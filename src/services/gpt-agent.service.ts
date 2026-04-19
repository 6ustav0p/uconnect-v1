/**
 * GPT Agent Service
 * Servicio para procesar consultas usando OpenAI GPT con RAG (Vector Store)
 */

import { OpenAI } from "openai";
import { Agent, AgentInputItem, Runner, withTrace } from "@openai/agents";
import { logger } from "../utils";

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
        store: true
      }
    });
  }

  /**
   * Procesa una consulta usando GPT con RAG
   */
  async processQuery(message: string): Promise<GptQueryResult> {
    return await withTrace("uconnect-api", async () => {
      try {
        // Buscar documentos relevantes en el vector store
        const searchResult = await this.client.vectorStores.search(
          this.config.vectorStoreId,
          {
            query: message,
            max_num_results: this.config.maxResults
          }
        );

        // Si no hay documentos relevantes
        if (searchResult.data.length === 0) {
          logger.info("GPT Agent: No se encontraron documentos relevantes", { query: message });
          return {
            response: "No encontré documentos relevantes para tu consulta.",
            documents: []
          };
        }

        // Extraer contenido de los documentos
        const relevantDocs = searchResult.data.map((result, index) => {
          return `DOCUMENTO ${index + 1}: ${result.filename}\nContenido: ${result.content?.[0]?.text || "Sin contenido disponible"}\nRelevancia: ${result.score.toFixed(4)}`;
        }).join("\n\n");

        // Crear prompt con contexto
        const contextualPrompt = `Contexto de los documentos:

${relevantDocs}

---

Pregunta del estudiante: ${message}

Responde SOLO basándote en la información del contexto anterior. Si la información no está en el contexto, dilo claramente.`;

        const conversationHistory: AgentInputItem[] = [
          { role: "user", content: [{ type: "input_text", text: contextualPrompt }] }
        ];

        const runner = new Runner({
          traceMetadata: {
            __trace_source__: "agent-builder",
            workflow_id: "wf_69928f96e3f48190ac51583f8aa818a00505cc1c2d447968"
          }
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
          documentsFound: documents.length
        });

        return {
          response: agentResult.finalOutput,
          documents
        };

      } catch (error) {
        logger.error("GPT Agent: Error procesando consulta", {
          error: (error as Error).message
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
