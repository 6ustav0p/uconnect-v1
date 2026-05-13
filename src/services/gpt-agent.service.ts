/**
 * GPT Agent Service
 * Servicio para procesar consultas usando OpenAI GPT con RAG (Vector Store)
 */

import { OpenAI } from "openai";
import { Agent, AgentInputItem, Runner, withTrace } from "@openai/agents";
import { logger, normalizeText } from "../utils";
import { LocalDataService } from "./local-data.service";

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

// Default configuration
const DEFAULT_CONFIG: GptAgentConfig = {
  vectorStoreId: process.env.OPENAI_VECTOR_STORE_ID || "",
  model: "gpt-3.5-turbo",
  temperature: 0.3,
  maxTokens: 2048,
  maxResults: 5,
};

const localData = new LocalDataService();

// Keywords that indicate a pensum/academic plan query
const PENSUM_KEYWORDS =
  /pensum|materias|asignaturas|semestre|plan de estudio|plan\s+de\s+estudio/i;

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

export class GptAgentService {
  private client: OpenAI;
  private agent: Agent;
  private config: GptAgentConfig;

  constructor(config: Partial<GptAgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

    this.agent = new Agent({
      name: "uconnect",
      instructions: `Eres un asistente universitario que SOLO responde basándose en el contenido de los documentos proporcionados.

REGLAS ESTRICTAS:
1. Solo usa información que esté explícitamente en el contexto de los documentos proporcionados
2. NO inventes, supongas o generalices información que no esté en los documentos
3. Si la información no está en los documentos, responde: "No encuentro esa información en los documentos disponibles"
4. Cita el documento cuando sea relevante
5. Sé preciso y específico con la información del documento

Tu objetivo es ayudar a estudiantes con información verificable de los documentos institucionales.`,
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
   * Procesa una consulta usando datos locales + GPT para formatear (pensum/materias)
   */
  private async processWithLocalPensum(
    message: string,
    pensumContext: string,
  ): Promise<GptQueryResult> {
    const prompt = `Tienes los siguientes datos académicos de la Universidad de Córdoba:

${pensumContext}

Pregunta del estudiante: ${message}

Responde de forma clara y amigable usando ÚNICAMENTE los datos anteriores. Lista las materias con su nombre y créditos.`;

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
   * Procesa una consulta usando GPT con RAG (vector store)
   */
  async processQuery(message: string): Promise<GptQueryResult> {
    return await withTrace("uconnect-api", async () => {
      try {
        // Ruta 1: preguntas de pensum/materias → usar JSON local directamente
        if (PENSUM_KEYWORDS.test(message)) {
          const pensumContext = buildPensumContext(message);
          if (pensumContext) {
            return await this.processWithLocalPensum(message, pensumContext);
          }
        }

        // Ruta 2: resto → vector store RAG
        const searchResult = await this.client.vectorStores.search(
          this.config.vectorStoreId,
          {
            query: message,
            max_num_results: this.config.maxResults,
          },
        );

        // Si no hay documentos relevantes
        if (searchResult.data.length === 0) {
          logger.info("GPT Agent: No se encontraron documentos relevantes", {
            query: message,
          });
          return {
            response: "No encontré documentos relevantes para tu consulta.",
            documents: [],
          };
        }

        // Extraer contenido de los documentos
        const relevantDocs = searchResult.data
          .map((result, index) => {
            return `DOCUMENTO ${index + 1}: ${result.filename}\nContenido: ${result.content?.[0]?.text || "Sin contenido disponible"}\nRelevancia: ${result.score.toFixed(4)}`;
          })
          .join("\n\n");

        // Crear prompt con contexto
        const contextualPrompt = `Contexto de los documentos:

${relevantDocs}

---

Pregunta del estudiante: ${message}

Responde SOLO basándote en la información del contexto anterior. Si la información no está en el contexto, dilo claramente.`;

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

        const documents = searchResult.data.map((result) => ({
          id: result.file_id,
          filename: result.filename,
          score: result.score,
        }));

        logger.info("GPT Agent: Consulta procesada", {
          query: message.substring(0, 50),
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
