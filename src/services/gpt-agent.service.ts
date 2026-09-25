/**
 * GPT Agent Service
 * Servicio para procesar consultas usando OpenAI GPT con RAG (Vector Store)
 */

import { OpenAI } from "openai";
import { Agent, AgentInputItem, Runner, withTrace } from "@openai/agents";
import { logger, normalizeText } from "../utils";
import { LocalDataService } from "./local-data.service";
import { ChatMessage } from "../types";

// Types
export interface GptQueryResult {
  response: string;
  documents: Array<{
    id: string;
    filename: string;
    score: number;
  }>;
}

export interface GptAgentConfig {
  vectorStoreId: string;
  model: string;
  temperature: number;
  maxTokens: number;
  maxResults: number;
}

export interface GptQueryOptions {
  sessionId?: string;
  history?: ChatMessage[];
}

// Default configuration
const DEFAULT_CONFIG: GptAgentConfig = {
  vectorStoreId: process.env.OPENAI_VECTOR_STORE_ID || "",
  model: "gpt-3.5-turbo",
  temperature: 0.3,
  maxTokens: 2048,
  maxResults: 10,
};

const DETAIL_QUERY_MAX_RESULTS = 14;

const localData = new LocalDataService();

// Keywords that indicate a pensum/academic plan query
const PENSUM_KEYWORDS =
  /pensum|materias|asignaturas|semestre|plan de estudio|plan\s+de\s+estudio/i;

// Keywords that indicate the student is asking about a program's PEP
// (Proyecto Educativo del Programa: perfil profesional, misión, objetivos,
// etc.), as opposed to a general question (reglamentos, admisión, etc).
// The vector store mixes reglamentos (ej. Acuerdo 062) con los PEP de cada
// carrera; sin este filtro, un PEP de un programa que nadie mencionó puede
// colarse con buen score en preguntas que no tienen nada que ver.
const PEP_PROFILE_KEYWORDS =
  /perfil (profesional|ocupacional)|proyecto educativo|\bPEP\b|misión del programa|visión del programa|competencias del programa|líneas de investigación|campos ocupacionales/i;

// Preguntas que piden un detalle exhaustivo, o que mencionan "requisito(s)"
// en cualquier forma (ej. "qué requisitos piden", "requisitos exactos"),
// se benefician de traer más fragmentos del documento: varios capítulos del
// Acuerdo 062 tienen listas de requisitos casi idénticas entre sí, y una
// búsqueda angosta puede traer la lista de un capítulo vecino en vez de la
// del capítulo correcto. "requisito(s)" es justo la palabra donde vive ese
// problema — no se amplía a preguntas de otro tipo (fechas, cupos,
// porcentajes, etc.), para no pagar la latencia extra donde no hace falta.
const DETAIL_QUERY_KEYWORDS =
  /\brequisitos?\b|todos los requisitos|lista completa|en detalle|exactamente qu[eé]|cu[aá]les son (todos|los requisitos)/i;

/**
 * Extracts a semester number from a query string (e.g. "tercer semestre" → "3")
 */
function extractSemestre(query: string): string | undefined {
  const numeric = query.match(
    /semestre\s+(\d+)|(\d+)\s*(er|do|to|vo|no|avo)?\.?\s*semestre/i,
  );
  if (numeric) return numeric[1] ?? numeric[2];
  const words: Record<string, string> = {
    primer: "1",
    primero: "1",
    segundo: "2",
    tercer: "3",
    tercero: "3",
    cuarto: "4",
    quinto: "5",
    sexto: "6",
    septimo: "7",
    séptimo: "7",
    octavo: "8",
    noveno: "9",
    decimo: "10",
    décimo: "10",
  };
  const norm = normalizeText(query);
  for (const [word, num] of Object.entries(words)) {
    if (norm.includes(word)) return num;
  }
  return undefined;
}

/**
 * Builds a plain-text pensum context block from local JSON data.
 * Returns null if no matching program is found.
 */
function buildPensumContext(query: string): string | null {
  const programaNombre = localData.buscarProgramaPorKeyword(query);
  if (!programaNombre) return null;

  const semestre = extractSemestre(query);
  const materias = localData.getMaterias(programaNombre, semestre);

  if (materias.length === 0) return null;

  if (semestre) {
    const lines = [
      `PENSUM - ${programaNombre} (Semestre ${semestre}):`,
      ...materias.map(
        (m) =>
          `  - ${m.materia} (código: ${m.codigo_materia}, créditos: ${m.creditos})`,
      ),
      `Total créditos del semestre ${semestre}: ${materias[0].total_creditos_semestre}`,
    ];
    return lines.join("\n");
  }

  // Full pensum
  const pensumCompleto = localData.getPensumCompleto(programaNombre);
  if (!pensumCompleto) return null;

  const lines = [
    `PENSUM COMPLETO - ${pensumCompleto.programa} (${pensumCompleto.jornada}):`,
    `Pensum: ${pensumCompleto.pensum} | Créditos totales: ${pensumCompleto.creditosTotales}`,
  ];
  for (const [sem, mats] of Object.entries(pensumCompleto.semestres).sort(
    ([a], [b]) => parseInt(a) - parseInt(b),
  )) {
    lines.push(`  Semestre ${sem}:`);
    for (const m of mats) {
      lines.push(
        `    - ${m.materia} (código: ${m.codigo_materia}, créditos: ${m.creditos})`,
      );
    }
    lines.push(
      `    Total créditos semestre ${sem}: ${mats[0].total_creditos_semestre}`,
    );
  }
  return lines.join("\n");
}

function formatHistoryForPrompt(history: ChatMessage[] = []): string {
  const recent = history.slice(-8);
  if (recent.length === 0) return "Sin historial previo.";

  return recent
    .map((message) => {
      const role = message.role === "assistant" ? "Asistente" : "Usuario";
      return `${role}: ${message.content}`;
    })
    .join("\n");
}

const SHORT_FOLLOWUP_MAX_WORDS = 6;
const CONTINUATION_SIMILARITY_THRESHOLD = 0.35;
const EMBEDDING_MODEL = "text-embedding-3-small";
const RELATIVE_SCORE_FLOOR = 0.5;
const DETAIL_QUERY_RELATIVE_SCORE_FLOOR = 0.3;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Word-count fallback used only if the embeddings call fails (rate limit,
 * network error, etc). Calibrated empirically: pure similarity is more
 * reliable than this for short/unrelated follow-ups (see
 * scripts/calibrate-embeddings.js), but this keeps the feature degrading
 * gracefully instead of throwing.
 */
function isShortFollowupHeuristic(message: string): boolean {
  return message.trim().split(/\s+/).filter(Boolean).length <= SHORT_FOLLOWUP_MAX_WORDS;
}

export class GptAgentService {
  private client: OpenAI;
  private agent: Agent;
  private config: GptAgentConfig;

  constructor(config: Partial<GptAgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

    this.agent = new Agent({
      name: "uconnect",
      instructions: `Eres un asistente universitario amable, claro y orientado a estudiantes de la Universidad de Córdoba.

REGLAS:
1. Cuando recibas contexto de documentos, usa esa información como fuente principal y no inventes datos específicos que no estén allí.
2. Si el estudiante hace una pregunta general de orientación, responde de forma útil y amigable con recomendaciones generales, sin presentar datos institucionales no verificados como hechos.
3. Si falta información específica, dilo claramente y ofrece una forma de continuar, por ejemplo pedir el programa, semestre, jornada o tema de interés. No remitas genéricamente a la página web como si fuera la respuesta.
4. Cita el documento cuando sea relevante.
5. Sé preciso cuando uses documentos y cercano cuando orientes de forma general.
6. Nunca asumas por tu cuenta un programa, carrera, sede o tema del que el estudiante no haya hablado en su mensaje actual (ni lo infieras de preguntas anteriores sobre un tema distinto). Si el mensaje es ambiguo o genérico, pide que aclare a qué programa o tema se refiere en vez de adivinar.
7. Si la nueva pregunta del estudiante cambia de tema respecto al historial, responde solo sobre el tema nuevo; no arrastres ni repitas información de la pregunta anterior.
8. Ve directo al dato. No empieces la respuesta con frases de relleno como "Según el documento/Acuerdo/los documentos proporcionados..." — cita la fuente de forma breve solo si aporta algo (ej. "(Art. 5)"), no como preámbulo.
9. No cierres cada respuesta con frases genéricas de relleno como "¿Hay algo más en lo que pueda ayudarte?", "no dudes en preguntar" o "si necesitas más información, dime". Solo ofrece seguir la conversación cuando de verdad haga falta una aclaración puntual (por ejemplo, pedir el programa o semestre).
10. Apunta a respuestas cortas: normalmente 2-5 frases, o una lista breve con viñetas si son varios puntos. Da más extensión solo si el estudiante lo pide o el tema realmente lo requiere.
11. Mantén un tono natural y cercano, no telegráfico ni robótico — la meta es cortar el relleno, no sonar cortante.
12. El contexto de documentos puede traer fragmentos de varios documentos o capítulos distintos a la vez (por ejemplo, el PEP de otra carrera, o un capítulo del Acuerdo 062 sobre un grupo poblacional distinto al que preguntó el estudiante). Antes de responder, identifica primero qué grupo, programa o tema específico preguntó el estudiante, usa SOLO los fragmentos que hablan de exactamente eso, e ignora por completo (sin mencionarlos) los fragmentos de otro programa, grupo poblacional o capítulo que no fue lo preguntado.
13. No concluyas que un beneficio "no aplica" o "no se menciona" para el grupo/programa preguntado solo porque no lo vuelve a nombrar textualmente en cada fragmento — si el capítulo o sección donde aparece ese grupo describe un beneficio general para "el aspirante" de ese mismo capítulo, entiende que aplica a ese grupo salvo que el documento diga explícitamente una excepción.
14. Cuando el estudiante haga una pregunta corta que depende del contexto (ej. "¿qué requisitos piden?", "¿y eso qué implica?", "¿cuánto dura?"), resuelve a qué se refiere usando el ÚLTIMO tema, grupo o programa que el ESTUDIANTE mismo nombró explícitamente en sus propios mensajes — nunca uses como referencia algo que solo tú mencionaste de más en un turno anterior (por ejemplo, un tema relacionado que agregaste sin que te lo pidieran). Si tu propia respuesta anterior mezcló un tema que el estudiante no pidió, ignóralo al resolver el follow-up: el tema válido sigue siendo el que el estudiante planteó originalmente.

15. DATO OBLIGATORIO — Capítulo III del Acuerdo 062 (indígenas, afrodescendientes, pueblo Rrom, raizales, palenqueros): si te preguntan por los requisitos de CUALQUIERA de estos cinco grupos, SIEMPRE debes incluir este requisito: "aval del Cabildo, o de su equivalente, o de una asociación de autoridades tradicionales" (Artículo 13). Aunque el Artículo 13 empiece mencionando solo a "comunidad indígena", aplica por igual a los cinco grupos del capítulo — es una redacción ambigua del documento, no una limitación real. No omitas este requisito para afrodescendientes, Rrom, raizales o palenqueros.

Tu objetivo es ayudar a estudiantes con información verificable de los documentos institucionales y orientación general responsable cuando no haya datos específicos disponibles.`,
      model: this.config.model,
      modelSettings: {
        temperature: this.config.temperature,
        topP: 1,
        maxTokens: this.config.maxTokens,
        store: true,
      },
    });
  }

  /**
   * Decide si la pregunta nueva es una continuación del mensaje anterior
   * (y por tanto conviene sumarle ese contexto a la búsqueda) o si es un
   * tema nuevo (y debe buscarse sola, para no "arrastrar" el tema viejo).
   * Se mide con similitud coseno de embeddings en vez de un conteo de
   * palabras: un follow-up corto pero sin relación real (p.ej. "¿cómo
   * recupero mi correo?" tras una pregunta de admisión) da una similitud
   * baja aunque sea corto, mientras que un conteo de palabras lo trataría
   * como continuación y contaminaría la búsqueda con el tema viejo.
   */
  private async buildContextualSearchQuery(
    message: string,
    history: ChatMessage[] = [],
  ): Promise<string> {
    const trimmed = message.trim();
    const lastUserMessage = [...history]
      .reverse()
      .find((item) => item.role === "user");
    if (!lastUserMessage) return trimmed;

    try {
      const response = await this.client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: [lastUserMessage.content, trimmed],
      });
      const [previous, current] = response.data;
      const similarity = cosineSimilarity(
        previous.embedding,
        current.embedding,
      );
      return similarity >= CONTINUATION_SIMILARITY_THRESHOLD
        ? `${lastUserMessage.content}\n${trimmed}`
        : trimmed;
    } catch (error) {
      logger.warn(
        "GPT Agent: no se pudo calcular similitud semántica, usando heurística de respaldo",
        { error: (error as Error).message },
      );
      return isShortFollowupHeuristic(trimmed)
        ? `${lastUserMessage.content}\n${trimmed}`
        : trimmed;
    }
  }

  /**
   * Procesa una consulta usando datos locales + GPT para formatear (pensum/materias)
   */
  private async processWithLocalPensum(
    message: string,
    pensumContext: string,
    history: ChatMessage[] = [],
  ): Promise<GptQueryResult> {
    const formattedHistory = formatHistoryForPrompt(history);
    const prompt = `Tienes los siguientes datos académicos de la Universidad de Córdoba:

${pensumContext}

Historial reciente de la conversación:
${formattedHistory}

Pregunta del estudiante: ${message}

Responde de forma clara y amigable usando ÚNICAMENTE los datos académicos anteriores y el historial solo para entender referencias de seguimiento. Lista las materias con su nombre y créditos.`;

    const conversationHistory: AgentInputItem[] = [
      { role: "user", content: [{ type: "input_text", text: prompt }] },
    ];

    const runner = new Runner();
    const agentResult = await runner.run(this.agent, conversationHistory);

    if (!agentResult.finalOutput) {
      throw new Error("El agente no generó una respuesta");
    }

    logger.info("GPT Agent: Consulta de pensum procesada con datos locales", {
      query: message.substring(0, 50),
    });

    return {
      response: agentResult.finalOutput,
      documents: [{ id: "local", filename: "pensum_programa.json", score: 1 }],
    };
  }

  /**
   * Procesa preguntas generales sin documentos relevantes.
   */
  private async processGeneralQuery(
    message: string,
    history: ChatMessage[] = [],
  ): Promise<GptQueryResult> {
    const prompt = `No se encontraron documentos institucionales relevantes para esta consulta.

Historial reciente de la conversación:
${formatHistoryForPrompt(history)}

Pregunta del estudiante: ${message}

Responde de forma amable, breve y útil. Puedes dar orientación general para ayudar al estudiante a avanzar, pero NO inventes datos específicos de la Universidad de Córdoba, como fechas, costos, requisitos exactos, puntajes, enlaces, materias o nombres de programas si no están en el contexto. Si necesitas más información, pide un dato concreto para continuar.`;

    const conversationHistory: AgentInputItem[] = [
      { role: "user", content: [{ type: "input_text", text: prompt }] },
    ];

    const runner = new Runner();
    const agentResult = await runner.run(this.agent, conversationHistory);

    if (!agentResult.finalOutput) {
      throw new Error("El agente no generó una respuesta");
    }

    return {
      response: agentResult.finalOutput,
      documents: [],
    };
  }

  /**
   * Procesa una consulta usando GPT con RAG (vector store)
   */
  async processQuery(
    message: string,
    options: GptQueryOptions = {},
  ): Promise<GptQueryResult> {
    return await withTrace("uconnect-api", async () => {
      try {
        const history = options.history || [];
        const contextualSearchQuery = await this.buildContextualSearchQuery(
          message,
          history,
        );

        // Ruta 1: preguntas de pensum/materias → usar JSON local directamente
        // (se prueba solo el mensaje actual, no el query con contexto, para
        // que una palabra clave de una pregunta anterior no secuestre el tema)
        if (PENSUM_KEYWORDS.test(message)) {
          const pensumContext = buildPensumContext(contextualSearchQuery);
          if (pensumContext) {
            return await this.processWithLocalPensum(
              message,
              pensumContext,
              history,
            );
          }
        }

        // Ruta 2: resto → vector store RAG
        // Si no es una pregunta de perfil de programa (PEP), se excluyen los
        // PEP de las carreras y el KB de FAQ (que tiene su propio flujo de
        // coincidencia exacta) de la búsqueda, para que no compitan con
        // reglamentos/admisión en preguntas que no tienen nada que ver con
        // ellos — sin importar qué grupo o tema puntual se pregunte.
        const isPepProfileQuery = PEP_PROFILE_KEYWORDS.test(message);
        const wantsExhaustiveDetail = DETAIL_QUERY_KEYWORDS.test(message);
        const searchResult = await this.client.vectorStores.search(
          this.config.vectorStoreId,
          {
            query: contextualSearchQuery,
            max_num_results: wantsExhaustiveDetail
              ? DETAIL_QUERY_MAX_RESULTS
              : this.config.maxResults,
            filters: isPepProfileQuery
              ? { type: "ne", key: "kind", value: "pensum_data" }
              : {
                  type: "and",
                  filters: [
                    { type: "ne", key: "kind", value: "pep" },
                    { type: "ne", key: "kind", value: "faq_kb" },
                    { type: "ne", key: "kind", value: "pensum_data" },
                  ],
                },
          },
        );

        // Si no hay documentos relevantes
        if (searchResult.data.length === 0) {
          logger.info("GPT Agent: No se encontraron documentos relevantes", {
            query: message,
            sessionId: options.sessionId,
          });
          return await this.processGeneralQuery(message, history);
        }

        // El vector store mezcla varios documentos (Acuerdo 062, PEPs de
        // otros programas, etc). Para una pregunta específica, un documento
        // ajeno a veces entra con un score no despreciable y contamina la
        // respuesta con un tema que nadie preguntó. Se descartan los
        // resultados muy por debajo del mejor score de esta búsqueda.
        // En preguntas de detalle se usa un piso más permisivo: varios
        // capítulos del Acuerdo 062 tienen listas de requisitos casi
        // idénticas entre sí, así que el fragmento correcto a veces queda
        // con un score más bajo aunque sí sea relevante.
        const topScore = searchResult.data[0].score;
        const scoreFloor = wantsExhaustiveDetail
          ? DETAIL_QUERY_RELATIVE_SCORE_FLOOR
          : RELATIVE_SCORE_FLOOR;
        const filteredResults = searchResult.data.filter(
          (result) => result.score >= topScore * scoreFloor,
        );

        // Extraer contenido de los documentos
        const relevantDocs = filteredResults
          .map((result, index) => {
            return `DOCUMENTO ${index + 1}: ${result.filename}\nContenido: ${result.content?.[0]?.text || "Sin contenido disponible"}\nRelevancia: ${result.score.toFixed(4)}`;
          })
          .join("\n\n");

        // Crear prompt con contexto
        const contextualPrompt = `Contexto de los documentos:

${relevantDocs}

---

Historial reciente de la conversación:
${formatHistoryForPrompt(history)}

Pregunta del estudiante: ${message}

Responde de forma clara y amigable. Para datos específicos, básate SOLO en la información de los documentos anteriores. Usa el historial únicamente para entender referencias de seguimiento del estudiante. Si la información específica no está en el contexto, dilo claramente y ofrece una siguiente pregunta concreta para continuar.`;

        const conversationHistory: AgentInputItem[] = [
          {
            role: "user",
            content: [{ type: "input_text", text: contextualPrompt }],
          },
        ];

        const runner = new Runner({
          traceMetadata: {
            __trace_source__: "agent-builder",
            workflow_id: "wf_69928f96e3f48190ac51583f8aa818a00505cc1c2d447968",
          },
        });

        const agentResult = await runner.run(this.agent, conversationHistory);

        if (!agentResult.finalOutput) {
          throw new Error("El agente no generó una respuesta");
        }

        const documents = filteredResults.map((result) => ({
          id: result.file_id,
          filename: result.filename,
          score: result.score,
        }));

        logger.info("GPT Agent: Consulta procesada", {
          query: message.substring(0, 50),
          sessionId: options.sessionId,
          historyMessages: history.length,
          documentsFound: documents.length,
        });

        return {
          response: agentResult.finalOutput,
          documents,
        };
      } catch (error) {
        logger.error("GPT Agent: Error procesando consulta", {
          error: (error as Error).message,
        });
        throw error;
      }
    });
  }

  /**
   * Verifica si el servicio está disponible
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return false;
      }
      // Simple check - list models
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const gptAgentService = new GptAgentService();
