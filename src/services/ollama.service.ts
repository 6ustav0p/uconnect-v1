import { Ollama, Message } from "ollama";
import { config } from "../config";
import {
  SYSTEM_PROMPT,
  RESPONSE_GENERATION_PROMPT,
  ENTITY_EXTRACTION_PROMPT,
} from "../config/prompts";
import { logger, truncateText, formatForContext } from "../utils";
import {
  ChatMessage,
  ChatbotResponse,
  AcademicContext,
  Facultad,
  ProgramaAcademico,
  MateriaPensum,
  ExtractedEntities,
} from "../types";

export class OllamaService {
  private client: Ollama;
  private chatHistories: Map<string, Message[]> = new Map();

  constructor() {
    this.client = new Ollama({ host: config.ollama.host });
    logger.info("OllamaService inicializado", {
      host: config.ollama.host,
      model: config.ollama.model,
    });
  }

  // ============================================
  // GESTIÓN DE SESIONES DE CHAT
  // ============================================

  private getOrCreateHistory(
    sessionId: string,
    history?: ChatMessage[],
  ): Message[] {
    if (this.chatHistories.has(sessionId)) {
      return this.chatHistories.get(sessionId)!;
    }

    const messages: Message[] = [{ role: "system", content: SYSTEM_PROMPT }];

    if (history && history.length > 0) {
      const recentMessages = history.slice(-config.chatbot.maxHistoryMessages);
      for (const msg of recentMessages) {
        if (msg.role !== "system") {
          messages.push({
            role: msg.role === "assistant" ? "assistant" : "user",
            content: msg.content,
          });
        }
      }
    }

    this.chatHistories.set(sessionId, messages);
    logger.debug("Nueva sesión de chat creada", { sessionId });

    return messages;
  }

  clearSession(sessionId: string): void {
    this.chatHistories.delete(sessionId);
    logger.debug("Sesión de chat eliminada", { sessionId });
  }

  // ============================================
  // GENERACIÓN DE RESPUESTAS
  // ============================================

  async generateSimpleResponse(
    sessionId: string,
    message: string,
    history?: ChatMessage[],
  ): Promise<ChatbotResponse> {
    const messages = this.getOrCreateHistory(sessionId, history);

    messages.push({ role: "user", content: message });

    try {
      const response = await this.client.chat({
        model: config.ollama.model,
        messages,
        options: {
          temperature: config.ollama.temperature,
          num_predict: config.ollama.maxOutputTokens,
        },
      });

      const assistantMessage = response.message.content;
      messages.push({ role: "assistant", content: assistantMessage });

      const tokensUsed = {
        input: response.prompt_eval_count || 0,
        output: response.eval_count || 0,
      };

      logger.info("Respuesta simple generada", { sessionId, tokensUsed });

      return {
        message: assistantMessage,
        sources: [],
        tokensUsed,
      };
    } catch (error) {
      logger.error("Error generando respuesta simple", {
        sessionId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async generateContextualResponse(
    sessionId: string,
    message: string,
    context: AcademicContext,
    history?: ChatMessage[],
  ): Promise<ChatbotResponse> {
    const messages = this.getOrCreateHistory(sessionId, history);

    const formattedContext = this.formatAcademicContext(context);
    const formattedHistory = this.formatHistoryForPrompt(history || []);

    const prompt = RESPONSE_GENERATION_PROMPT.replace(
      "{context}",
      formattedContext,
    )
      .replace("{question}", message)
      .replace("{history}", formattedHistory);

    messages.push({ role: "user", content: prompt });

    try {
      const response = await this.client.chat({
        model: config.ollama.model,
        messages,
        options: {
          temperature: config.ollama.temperature,
          num_predict: config.ollama.maxOutputTokens,
        },
      });

      const assistantMessage = response.message.content;
      messages.push({ role: "assistant", content: assistantMessage });

      const tokensUsed = {
        input: response.prompt_eval_count || 0,
        output: response.eval_count || 0,
      };

      logger.info("Respuesta contextual generada", { sessionId, tokensUsed });

      return {
        message: assistantMessage,
        data: {
          facultades: context.facultades,
          programas: context.programas,
          materias: context.materias,
        },
        sources: this.extractSources(context),
        tokensUsed,
      };
    } catch (error) {
      logger.error("Error generando respuesta contextual", {
        sessionId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // ============================================
  // EXTRACCIÓN DE ENTIDADES CON IA
  // ============================================

  async extractEntitiesWithAI(message: string): Promise<ExtractedEntities> {
    try {
      const prompt = ENTITY_EXTRACTION_PROMPT.replace("{message}", message);

      const response = await this.client.chat({
        model: config.ollama.model,
        messages: [
          {
            role: "system",
            content:
              "Eres un extractor de entidades. Responde SOLO con JSON válido.",
          },
          { role: "user", content: prompt },
        ],
        options: {
          temperature: 0.3,
          num_predict: 1024,
        },
      });

      const responseText = response.message.content;

      // Extraer JSON de la respuesta
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No se pudo extraer JSON de la respuesta de IA");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        facultades: parsed.facultades || [],
        programas: parsed.programas || [],
        materias: parsed.materias || [],
        semestres: parsed.semestres || [],
        jornadas: parsed.jornadas || [],
        intenciones: parsed.intenciones || ["GENERAL"],
        rawQuery: parsed.rawQuery || "",
      };
    } catch (error) {
      logger.error("Error extrayendo entidades con Ollama", {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // ============================================
  // OPTIMIZACIÓN DE QUERIES
  // ============================================

  async generateQueryOptimization(prompt: string): Promise<string> {
    try {
      const response = await this.client.chat({
        model: config.ollama.model,
        messages: [
          {
            role: "system",
            content:
              "Eres un optimizador de consultas. Responde SOLO con JSON válido.",
          },
          { role: "user", content: prompt },
        ],
        options: {
          temperature: 0.3,
          num_predict: 1024,
        },
      });

      return response.message.content;
    } catch (error) {
      logger.error("Error optimizando query con Ollama", {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // ============================================
  // FORMATEO DE CONTEXTO
  // ============================================

  private formatAcademicContext(context: AcademicContext): string {
    const parts: string[] = [];

    if (context.summary) {
      parts.push(`RESUMEN: ${context.summary}`);
    }

    if (context.facultades.length > 0) {
      const facultadesStr = formatForContext<Facultad>(context.facultades, 10, [
        "unid_nombre",
      ]);
      parts.push(`\nFACULTADES:\n${facultadesStr}`);
    }

    if (context.programas.length > 0) {
      const programasStr = formatForContext<ProgramaAcademico>(
        context.programas,
        20,
        ["prog_nombre", "facultad_nombre"],
      );
      parts.push(`\nPROGRAMAS ACADÉMICOS:\n${programasStr}`);
    }

    if (context.materias.length > 0) {
      const materiasAgrupadas = this.groupMateriasBySemestre(context.materias);
      parts.push(`\nMATERIAS DEL PENSUM:\n${materiasAgrupadas}`);
    }

    const fullContext = parts.join("\n");
    return truncateText(fullContext, config.chatbot.maxContextTokens * 4);
  }

  private groupMateriasBySemestre(materias: MateriaPensum[]): string {
    const grouped = new Map<string, MateriaPensum[]>();

    for (const materia of materias.slice(0, config.chatbot.maxApiResults)) {
      const key = `${materia.programa} - Sem ${materia.semestre}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(materia);
    }

    const lines: string[] = [];
    for (const [key, mats] of grouped) {
      const materiasStr = mats
        .slice(0, 10)
        .map((m) => `  - ${m.materia} (${m.creditos} créditos)`)
        .join("\n");
      lines.push(`${key}:\n${materiasStr}`);
    }

    return lines.slice(0, 5).join("\n\n");
  }

  private formatHistoryForPrompt(messages: ChatMessage[]): string {
    const recent = messages.slice(-4);
    if (recent.length === 0) return "Sin historial previo.";

    return recent
      .map(
        (msg) =>
          `${msg.role === "user" ? "Usuario" : "Asistente"}: ${truncateText(msg.content, 200)}`,
      )
      .join("\n");
  }

  private extractSources(context: AcademicContext): string[] {
    const sources: string[] = [];

    if (context.facultades.length > 0) {
      sources.push("API Facultades");
    }
    if (context.programas.length > 0) {
      sources.push("API Programas Académicos");
    }
    if (context.materias.length > 0) {
      const pensum = context.materias[0]?.pensum;
      if (pensum) {
        sources.push(`Pensum ${pensum}`);
      } else {
        sources.push("API Pensum");
      }
    }

    return sources;
  }

  // ============================================
  // RESPUESTAS PREDEFINIDAS
  // ============================================

  getGreetingResponse(): string {
    const greetings = [
      "¡Hola! 👋 Soy UConnect, el asistente virtual de la Universidad de Córdoba. ¿En qué puedo ayudarte hoy? Puedo darte información sobre facultades, programas académicos, materias y más.",
      "¡Bienvenido/a! 🎓 Soy UConnect y estoy aquí para ayudarte con información sobre la Universidad de Córdoba. ¿Qué te gustaría saber?",
      "¡Hola! Soy tu asistente virtual de la Universidad de Córdoba. Puedo ayudarte con información sobre carreras, facultades, pensum y más. ¿Cuál es tu consulta?",
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  getFarewellResponse(): string {
    const farewells = [
      "¡Hasta luego! 👋 Si tienes más preguntas sobre la Universidad de Córdoba, no dudes en volver. ¡Éxito en tu proceso de admisión!",
      "¡Fue un gusto ayudarte! 🎓 Recuerda que puedes volver cuando necesites más información. ¡Buena suerte!",
      "¡Chao! Espero haberte sido de ayuda. Si necesitas más información, aquí estaré. ¡Éxitos!",
    ];
    return farewells[Math.floor(Math.random() * farewells.length)];
  }

  getErrorResponse(): string {
    return "Lo siento, tuve un problema procesando tu consulta. ¿Podrías reformular tu pregunta? Si el problema persiste, puedes contactar a admisiones@unicordoba.edu.co";
  }

  getNoDataResponse(query: string): string {
    return (
      `No encontré información específica sobre "${query}" en mis datos. Te sugiero:\n\n` +
      "1. Verificar la escritura del programa o materia\n" +
      "2. Ser más específico en tu consulta\n" +
      "3. Contactar directamente a admisiones@unicordoba.edu.co\n\n" +
      "¿Hay algo más en lo que pueda ayudarte?"
    );
  }
}

// Singleton
export const ollamaService = new OllamaService();
