/**
 * GPT Agent Service
 * Servicio para procesar consultas usando OpenAI GPT con RAG (Vector Store)
 */

import { OpenAI } from "openai";
import { Agent, AgentInputItem, Runner, withTrace } from "@openai/agents";
import { logger, normalizeText } from "../utils";
import { LocalDataService } from "./local-data.service";
import { ChatMessage } from "../types";
import offeringBySede from "../data/oferta_academica_pregrado_sedes.json";

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
  model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  temperature: 0.3,
  maxTokens: 2048,
  maxResults: 10,
};

const DETAIL_QUERY_MAX_RESULTS = 14;

const localData = new LocalDataService();

// Keywords that indicate a pensum/academic plan query
const PENSUM_KEYWORDS =
  /pensum|materias|asignaturas|semestre|plan de estudio|plan\s+de\s+estudio/i;
const IMPLICIT_PENSUM_FOLLOWUP =
  /^(?:ahora|y\s+ahora|dame|quiero|mu[eé]strame|muestra(?:me)?|el)\b/i;

// Preguntas por la oferta académica
const PROGRAM_OR_CAREER_WORD = /\bprogramas?\b|\bcarreras?\b|\bopciones\b/i;

const ADMISSION_BENEFIT_SIGNAL =
  /beneficio|exoneraci[oó]n|cupos? especial(es)?|admisi[oó]n especial|acuerdo\s*062|comunidad(es)?|discapacidad|v[íi]ctima|veterano|desmovilizado|requisito/i;
const MEDICINE_PROGRAM_SIGNAL = /\bmedicin(?:a|as)\b|\bm[eé]dico\b/i;
const MEDICINE_SPECIAL_ADMISSION_SIGNAL =
  /acuerdo\s*(?:no\.?\s*)?(?:090|414)|modelo\s+especial\s+de\s+admisi[oó]n|distribuci[oó]n\s+de\s+cupos/i;

const POSGRADO_KEYWORDS = /posgrado|postgrado|maestr[ií]a|doctorado|especializaci[oó]n/i;
const PREGRADO_KEYWORDS = /pregrado/i;
const ACADEMIC_CALENDAR_QUERY =
  /calendario|fecha|inici\w*|cu[aá]ndo.*(clases?|semestre|periodo|matr[ií]cula|inscrip)|clases?.*(inician|empiezan|comienzan)/i;

/**
 * Arma un listado de la oferta académica real (facultades + programas) a
 * partir de los datos locales.
 */
function buildOfferingContext(contextQuery: string): string {
  const normalizedQuery = normalizeText(contextQuery);
  const sedeAliases: Array<[keyof typeof offeringBySede, string[]]> = [
    ["lorica", ["lorica", "lorca"]],
    ["sahagun", ["sahagun", "sahgun"]],
    ["montelibano", ["montelibano", "montelíbano", "montelibnao"]],
    ["berastegui", ["berastegui", "berastegui"]],
    ["monteria", ["monteria", "montería", "sede principal", "sede central"]],
  ];
  const sedeKey =
    sedeAliases.find(([, aliases]) =>
      aliases.some((alias) => normalizedQuery.includes(normalizeText(alias))),
    )?.[0] ?? "monteria";
  const sede = offeringBySede[sedeKey];
  const lines = [`OFERTA ACADÉMICA DE PREGRADO - ${sede.nombre}:`];

  if ("facultades" in sede) {
    for (const [facultad, programas] of Object.entries(sede.facultades)) {
      lines.push(`\n${facultad}:`);
      for (const programa of programas) lines.push(`  - ${programa}`);
    }
  } else {
    for (const programa of sede.programas) lines.push(`  - ${programa}`);
  }

  return lines.join("\n");
}

const PEP_PROFILE_KEYWORDS =
  /perfil (profesional|ocupacional)|proyecto educativo|\bPEP\b|misión del programa|visión del programa|competencias del programa|líneas de investigación|campos ocupacionales/i;

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
      ...materias.map((m) => `  - ${formatMateria(m)}`),
    ];
    const total = materias[0].total_creditos_semestre;
    if (total !== "NO ESPECIFICADO") {
      lines.push(`Total créditos del semestre ${semestre}: ${total}`);
    }

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
      lines.push(`    - ${formatMateria(m)}`);
    }
    const total = mats[0].total_creditos_semestre;
    if (total !== "NO ESPECIFICADO") {
      lines.push(`    Total créditos semestre ${sem}: ${total}`);
    }
  }
  return lines.join("\n");
}

function formatMateria(materia: {
  materia: string;
  codigo_materia: string;
  creditos: string;
}): string {
  const details = [
    materia.codigo_materia.startsWith("SIN_CODIGO_")
      ? ""
      : `código: ${materia.codigo_materia}`,
    materia.creditos === "NO ESPECIFICADO"
      ? ""
      : `créditos: ${materia.creditos}`,
  ]
    .filter(Boolean)
    .join(", ");

  return `${materia.materia}${details ? ` (${details})` : ""}`;
}

function isMedicineSpecificDocument(filename: string, content: string): boolean {
  const documentName = normalizeText(filename);
  if (/medicina|medico|cupos.*especiales/.test(documentName)) return true;

  const normalizedContent = normalizeText(content);
  return (
    /cupo[s]?\s+(?:especial(?:es)?|poblacional(?:es)?)/.test(
      normalizedContent,
    ) &&
    /programa\s+de\s+medicina/.test(normalizedContent)
  );
}

function isMedicineSpecialAdmissionDocument(
  filename: string,
  content: string,
): boolean {
  const documentText = normalizeText(`${filename}\n${content}`);
  return (
    MEDICINE_SPECIAL_ADMISSION_SIGNAL.test(documentText) &&
    MEDICINE_PROGRAM_SIGNAL.test(documentText)
  );
}

function studentPreviouslyMentionedMedicine(
  history: ChatMessage[],
): boolean {
  return history.some(
    (item) =>
      item.role === "user" && MEDICINE_PROGRAM_SIGNAL.test(item.content),
  );
}

function isImplicitPensumQuery(
  message: string,
  contextualSearchQuery: string,
  history: ChatMessage[],
): boolean {
  if (PENSUM_KEYWORDS.test(message)) return true;
  if (!IMPLICIT_PENSUM_FOLLOWUP.test(message)) return false;

  const program = localData.buscarProgramaPorKeyword(message);
  if (!program) return false;

  const followedOffering = history.some((item) =>
    item.role === "assistant"
      ? /oferta acad[eé]mica|programas de pregrado|programas de posgrado/i.test(
          item.content,
        )
      : /programas?|carreras?/i.test(item.content),
  );

  return followedOffering || contextualSearchQuery !== message;
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
3. Si el contexto no trae la información que te piden (sea cual sea el tema: un programa, un beneficio, una fecha, un requisito, lo que sea), NO inventes ni completes con supuestos. Dilo de forma directa y honesta, por ejemplo: "No tengo esa información en mis documentos actuales." y, solo si aplica, sugiere a quién preguntarle en la Universidad (ej. la División de Admisiones, Registro y Control Académico, o la coordinación del programa). No remitas genéricamente a "la página web" como si fuera la respuesta cuando en realidad simplemente no tienes el dato.
4. Cita el documento cuando sea relevante.
5. Sé preciso cuando uses documentos y cercano cuando orientes de forma general.
6. Nunca asumas por tu cuenta un programa, carrera, sede o tema del que el estudiante no haya hablado en su mensaje actual (ni lo infieras de preguntas anteriores sobre un tema distinto). Si el mensaje es ambiguo o genérico, pide que aclare a qué programa o tema se refiere en vez de adivinar.
7. Si la nueva pregunta del estudiante cambia de tema respecto al historial, responde solo sobre el tema nuevo; no arrastres ni repitas información de la pregunta anterior.
8. Ve directo al dato. No empieces la respuesta con frases de relleno como "Según el documento/Acuerdo/los documentos proporcionados..." — cita la fuente de forma breve solo si aporta algo (ej. "(Art. 5)"), no como preámbulo.
9. No cierres cada respuesta con frases genéricas de relleno como "¿Hay algo más en lo que pueda ayudarte?", "no dudes en preguntar" o "si necesitas más información, dime". Solo ofrece seguir la conversación cuando de verdad haga falta una aclaración puntual (por ejemplo, pedir el programa o semestre).
10. Apunta a respuestas cortas: normalmente 2-5 frases, o una lista breve con viñetas si son varios puntos. Da más extensión solo si el estudiante lo pide o el tema realmente lo requiere.
11. Escribe con buena oratoria: frases completas, bien hilvanadas y naturales, como las diría una persona que domina el tema — no una lista telegráfica de fragmentos ni un tono robótico. El objetivo es sonar claro y fluido, no acumular relleno ni sonar cortante.
12. El contexto de documentos puede traer fragmentos de varios documentos o capítulos distintos a la vez (por ejemplo, el PEP de otra carrera, o un capítulo del Acuerdo 062 sobre un grupo poblacional distinto al que preguntó el estudiante). Antes de responder, identifica primero qué grupo, programa o tema específico preguntó el estudiante, usa SOLO los fragmentos que hablan de exactamente eso, e ignora por completo (sin mencionarlos) los fragmentos de otro programa, grupo poblacional o capítulo que no fue lo preguntado.
13. No concluyas que un beneficio "no aplica" o "no se menciona" para el grupo/programa preguntado solo porque no lo vuelve a nombrar textualmente en cada fragmento — si el capítulo o sección donde aparece ese grupo describe un beneficio general para "el aspirante" de ese mismo capítulo, entiende que aplica a ese grupo salvo que el documento diga explícitamente una excepción.
14. Cuando el estudiante haga una pregunta corta que depende del contexto (ej. "¿qué requisitos piden?", "¿y eso qué implica?", "¿cuánto dura?"), resuelve a qué se refiere usando el ÚLTIMO tema, grupo o programa que el ESTUDIANTE mismo nombró explícitamente en sus propios mensajes — nunca uses como referencia algo que solo tú mencionaste de más en un turno anterior (por ejemplo, un tema relacionado que agregaste sin que te lo pidieran). Si tu propia respuesta anterior mezcló un tema que el estudiante no pidió, ignóralo al resolver el follow-up: el tema válido sigue siendo el que el estudiante planteó originalmente.

15. DATO OBLIGATORIO — Capítulo III del Acuerdo 062 (indígenas, afrodescendientes, pueblo Rrom, raizales, palenqueros): si te preguntan por los requisitos de CUALQUIERA de estos cinco grupos, SIEMPRE debes incluir este requisito: "aval del Cabildo, o de su equivalente, o de una asociación de autoridades tradicionales" (Artículo 13). Aunque el Artículo 13 empiece mencionando solo a "comunidad indígena", aplica por igual a los cinco grupos del capítulo — es una redacción ambigua del documento, no una limitación real. No omitas este requisito para afrodescendientes, Rrom, raizales o palenqueros.
16. La palabra "programa" es ambigua en los documentos: puede referirse a un PROGRAMA ACADÉMICO (una carrera) o a un PROGRAMA DE ADMISIÓN ESPECIAL del Acuerdo 062 (cupos para víctimas, comunidades étnicas, discapacidad, deportistas, artistas, veteranos, etc.). Si el estudiante pregunta de forma genérica por "programas", "carreras" u "oferta académica" sin mencionar beneficios, cupos, exoneraciones o un grupo poblacional, asume que pregunta por programas académicos — NO por los cupos especiales del Acuerdo 062.
17. Los documentos de cupos especiales de un programa concreto, como Medicina, solo aplican cuando el estudiante menciona explícitamente ese programa en la pregunta. No uses un documento de cupos de Medicina para responder preguntas generales sobre beneficios de comunidades, grupos minoritarios o el Acuerdo 062; en esos casos usa únicamente la normativa general.
18. Si la consulta trata exclusivamente sobre beneficios, cupos o admisión especial de Medicina, usa el documento "Modelo Especial de Admisión y Distribución de Cupos - Programa de Medicina", basado en los Acuerdos 090 de 2026 y 414 de 2026. No respondas esa consulta con el Acuerdo 062, salvo que el estudiante lo pida expresamente.

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

Responde de forma clara y amigable usando ÚNICAMENTE los datos académicos anteriores y el historial solo para entender referencias de seguimiento. Lista TODAS las materias del semestre o pensum solicitado con su nombre y créditos — no recortes, resumas ni omitas ninguna materia.`;

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

  private async processWithLocalOffering(
    message: string,
    offeringContext: string,
    history: ChatMessage[] = [],
  ): Promise<GptQueryResult> {
    logger.info("GPT Agent: Consulta de oferta académica procesada con datos locales", {
      query: message.substring(0, 50),
    });

    return {
      response: offeringContext,
      documents: [
        {
          id: "local",
          filename: "oferta_academica_pregrado_sedes.json",
          score: 1,
        },
      ],
    };
  }

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

  async processQuery(
    message: string,
    options: GptQueryOptions = {},
  ): Promise<GptQueryResult> {
    return await withTrace("uconnect-api", async () => {
      try {
        const history = options.history || [];
        let contextualSearchQuery = await this.buildContextualSearchQuery(
          message,
          history,
        );
        const mentionsAdmissionBenefit = ADMISSION_BENEFIT_SIGNAL.test(message);
        const followsMedicineConversation =
          mentionsAdmissionBenefit &&
          MEDICINE_PROGRAM_SIGNAL.test(message) === false &&
          studentPreviouslyMentionedMedicine(history);
        if (followsMedicineConversation) {
          contextualSearchQuery = `${contextualSearchQuery} Medicina`;
        }
        const mentionsPostgrado = POSGRADO_KEYWORDS.test(
          contextualSearchQuery,
        );

        // Ruta 0: preguntas de pensum/materias
        if (
          !mentionsPostgrado &&
          isImplicitPensumQuery(message, contextualSearchQuery, history)
        ) {
          const pensumContext = buildPensumContext(contextualSearchQuery);
          if (pensumContext) {
            return await this.processWithLocalPensum(
              message,
              pensumContext,
              history,
            );
          }
        }

        // Ruta 1: preguntas de oferta académica
        const mentionsProgramOrCareer =
          PROGRAM_OR_CAREER_WORD.test(contextualSearchQuery);
        const isOfferingQuery =
          !mentionsPostgrado &&
          !PENSUM_KEYWORDS.test(message) &&
          !PEP_PROFILE_KEYWORDS.test(message) &&
          mentionsProgramOrCareer &&
          !mentionsAdmissionBenefit;

        if (isOfferingQuery) {
          const offeringContext = buildOfferingContext(contextualSearchQuery);
          return await this.processWithLocalOffering(
            message,
            offeringContext,
            history,
          );
        }

        // Ruta 2: vector store RAG
        const isPepProfileQuery = PEP_PROFILE_KEYWORDS.test(message);
        const wantsExhaustiveDetail = DETAIL_QUERY_KEYWORDS.test(message);
        const isAcademicCalendarQuery = ACADEMIC_CALENDAR_QUERY.test(
          contextualSearchQuery,
        );
        const academicLevel = mentionsPostgrado
          ? "posgrado"
          : PREGRADO_KEYWORDS.test(message)
            ? "pregrado"
            : undefined;
        const calendarFilter = {
          type: "eq" as const,
          key: "kind",
          value: "calendario_academico",
        };
        const searchFilters = isAcademicCalendarQuery
          ? {
              type: "and" as const,
              filters: [
                calendarFilter,
                ...(academicLevel
                  ? [
                      {
                        type: "or" as const,
                        filters: [
                          {
                            type: "eq" as const,
                            key: "academic_level",
                            value: academicLevel,
                          },
                          {
                            type: "eq" as const,
                            key: "academic_level",
                            value: "general",
                          },
                        ],
                      },
                    ]
                  : []),
              ],
            }
          : academicLevel
          ? {
              type: "and" as const,
              filters: [
                ...(isPepProfileQuery
                  ? []
                  : [
                      { type: "ne" as const, key: "kind", value: "pep" },
                      { type: "ne" as const, key: "kind", value: "faq_kb" },
                    ]),
                {
                  type: "or" as const,
                  filters: [
                    {
                      type: "eq" as const,
                      key: "academic_level",
                      value: academicLevel,
                    },
                    {
                      type: "eq" as const,
                      key: "academic_level",
                      value: "general",
                    },
                  ],
                },
              ],
            }
          : isPepProfileQuery
            ? { type: "ne" as const, key: "kind", value: "pensum_data" }
            : {
                type: "and" as const,
                filters: [
                  { type: "ne" as const, key: "kind", value: "pep" },
                  { type: "ne" as const, key: "kind", value: "faq_kb" },
                  { type: "ne" as const, key: "kind", value: "pensum_data" },
                ],
              };

        const searchResult = await this.client.vectorStores.search(
          this.config.vectorStoreId,
          {
            query: contextualSearchQuery,
            max_num_results: wantsExhaustiveDetail
              ? DETAIL_QUERY_MAX_RESULTS
              : this.config.maxResults,
            filters: searchFilters,
          },
        );

        // Si no hay documentos relevantes
        if (searchResult.data.length === 0) {
          logger.info("GPT Agent: No se encontraron documentos relevantes", {
            query: message,
            sessionId: options.sessionId,
          });
          if (isAcademicCalendarQuery) {
            const levelLabel = academicLevel
              ? academicLevel === "pregrado"
                ? "de pregrado"
                : "de posgrado"
              : "académico";
            return {
              response: `No encuentro un acuerdo de calendario académico ${levelLabel} indexado actualmente en el Vector Store. Verifica que el documento esté cargado con el tipo "Calendario académico (acuerdo)" y vuelve a intentarlo.`,
              documents: [],
            };
          }
          return await this.processGeneralQuery(message, history);
        }

        const topScore = searchResult.data[0].score;
        const scoreFloor = wantsExhaustiveDetail
          ? DETAIL_QUERY_RELATIVE_SCORE_FLOOR
          : RELATIVE_SCORE_FLOOR;
        let filteredResults = searchResult.data.filter(
          (result) => result.score >= topScore * scoreFloor,
        );

        const isMedicineSpecialAdmissionQuery =
          MEDICINE_PROGRAM_SIGNAL.test(contextualSearchQuery) &&
          mentionsAdmissionBenefit;

        if (isMedicineSpecialAdmissionQuery) {
          filteredResults = filteredResults.filter((result) =>
            isMedicineSpecialAdmissionDocument(
              result.filename,
              result.content?.[0]?.text || "",
            ),
          );
        } else if (!MEDICINE_PROGRAM_SIGNAL.test(message)) {
          filteredResults = filteredResults.filter(
            (result) =>
              !isMedicineSpecificDocument(
                result.filename,
                result.content?.[0]?.text || "",
              ),
          );
        }

        if (filteredResults.length === 0) {
          logger.info(
            "GPT Agent: Se descartaron documentos específicos de Medicina para una consulta general",
            { query: message, sessionId: options.sessionId },
          );
          if (isMedicineSpecialAdmissionQuery) {
            return {
              response:
                "No encuentro indexado el documento especial de admisión y distribución de cupos de Medicina (Acuerdos 090 y 414 de 2026). No usaré el Acuerdo 062 para responder esta consulta.",
              documents: [],
            };
          }
          return await this.processGeneralQuery(message, history);
        }

        const relevantDocs = filteredResults
          .map((result, index) => {
            return `DOCUMENTO ${index + 1}: ${result.filename}\nContenido: ${result.content?.[0]?.text || "Sin contenido disponible"}\nRelevancia: ${result.score.toFixed(4)}`;
          })
          .join("\n\n");

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

  async isAvailable(): Promise<boolean> {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return false;
      }
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}

export const gptAgentService = new GptAgentService();