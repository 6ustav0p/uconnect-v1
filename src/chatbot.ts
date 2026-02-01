import { v4 as uuidv4 } from "uuid";
import { config } from "./config";
import { logger, normalizeText } from "./utils";
import { ollamaService, database, chatRepository } from "./services";
import { localDataService } from "./services/local-data.service";
import {
  ChatMessage,
  ChatbotResponse,
  AcademicContext,
  ExtractedEntities,
  MateriaPensum,
} from "./types";

export class Chatbot {
  private initialized = false;

  // Contexto de conversación por sesión (programa, facultad, tema actual)
  private sessionContext: Map<
    string,
    {
      programa?: string;
      facultad?: string;
      ultimoTema?: string;
    }
  > = new Map();

  // ============================================
  // INICIALIZACIÓN
  // ============================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info("Inicializando Chatbot...");

    try {
      await database.connect();
      this.initialized = true;
      logger.info("Chatbot inicializado correctamente");
    } catch (error) {
      logger.error("Error inicializando Chatbot", {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    logger.info("Cerrando Chatbot...");
    await database.disconnect();
    this.initialized = false;
  }

  // ============================================
  // PROCESAMIENTO DE MENSAJES
  // ============================================

  async processMessage(
    sessionId: string,
    userMessage: string,
    userId?: string,
  ): Promise<ChatbotResponse> {
    const startTime = Date.now();

    if (!this.initialized) {
      await this.initialize();
    }

    logger.info("Procesando mensaje", {
      sessionId,
      messageLength: userMessage.length,
    });

    try {
      // Guardar mensaje del usuario
      await chatRepository.addMessage(sessionId, "user", userMessage);

      // Obtener historial
      const history = await chatRepository.getHistory(
        sessionId,
        config.chatbot.maxHistoryMessages,
      );

      // Extraer entidades del mensaje
      let entities = this.extractEntities(userMessage);

      // Enriquecer entidades con contexto de la sesión
      entities = this.enrichEntitiesFromContext(
        sessionId,
        entities,
        userMessage,
      );
      logger.debug("Entidades extraídas", { entities });

      // Verificar saludos/despedidas
      if (entities.intenciones.includes("SALUDO")) {
        return this.handleGreeting(sessionId, startTime);
      }

      if (entities.intenciones.includes("DESPEDIDA")) {
        this.sessionContext.delete(sessionId); // Limpiar contexto
        return this.handleFarewell(sessionId, startTime);
      }

      // Actualizar contexto de la sesión
      this.updateSessionContext(sessionId, entities);

      // Obtener contexto académico
      const context = this.getAcademicContext(entities);
      logger.debug("Contexto académico", {
        facultades: context.facultades.length,
        programas: context.programas.length,
        materias: context.materias.length,
      });

      // Generar respuesta con IA
      const response = await ollamaService.generateContextualResponse(
        sessionId,
        userMessage,
        context,
        history,
      );

      // Guardar respuesta
      await chatRepository.addMessage(sessionId, "assistant", response.message);

      const processingTime = Date.now() - startTime;
      logger.info("Mensaje procesado", {
        sessionId,
        processingTime,
        tokensUsed: response.tokensUsed,
      });

      return {
        ...response,
        sources: this.getSources(context),
      };
    } catch (error) {
      logger.error("Error procesando mensaje", {
        error: (error as Error).message,
        sessionId,
      });

      return {
        message:
          "Lo siento, ocurrió un error procesando tu mensaje. Por favor intenta de nuevo.",
        sources: [],
        tokensUsed: { input: 0, output: 0 },
      };
    }
  }

  // ============================================
  // EXTRACCIÓN DE ENTIDADES
  // ============================================

  private extractEntities(message: string): ExtractedEntities {
    const normalized = normalizeText(message);
    const entities: ExtractedEntities = {
      facultades: [],
      programas: [],
      materias: [],
      semestres: [],
      jornadas: [],
      intenciones: [],
      rawQuery: message,
    };

    // Detectar saludos
    if (
      /^(hola|buenos?\s*d[ií]as?|buenas?\s*(tardes?|noches?)|hey|saludos?|qu[eé]\s*tal)/i.test(
        normalized,
      )
    ) {
      entities.intenciones.push("SALUDO");
      return entities;
    }

    // Detectar despedidas
    if (
      /^(adi[oó]s|chao|hasta\s*luego|bye|gracias|nos\s*vemos)/i.test(normalized)
    ) {
      entities.intenciones.push("DESPEDIDA");
      return entities;
    }

    // Detectar programa académico
    const programaNombre =
      localDataService.buscarProgramaPorKeyword(normalized);
    if (programaNombre) {
      entities.programas.push(programaNombre);
    }

    // Detectar semestre
    const semestresOrdinal: Record<string, string> = {
      primer: "1",
      primero: "1",
      "1er": "1",
      "1°": "1",
      segundo: "2",
      "2do": "2",
      "2°": "2",
      tercer: "3",
      tercero: "3",
      "3er": "3",
      "3°": "3",
      cuarto: "4",
      "4to": "4",
      "4°": "4",
      quinto: "5",
      "5to": "5",
      "5°": "5",
      sexto: "6",
      "6to": "6",
      "6°": "6",
      septimo: "7",
      "7mo": "7",
      "7°": "7",
      octavo: "8",
      "8vo": "8",
      "8°": "8",
      noveno: "9",
      "9no": "9",
      "9°": "9",
      decimo: "10",
      "10mo": "10",
      "10°": "10",
    };

    for (const [ordinal, numero] of Object.entries(semestresOrdinal)) {
      if (normalized.includes(ordinal)) {
        entities.semestres.push(numero);
        break;
      }
    }

    // Patrón numérico
    const semestreMatch = normalized.match(/semestre\s*(\d+)/i);
    if (semestreMatch && entities.semestres.length === 0) {
      entities.semestres.push(semestreMatch[1]);
    }

    // Detectar jornadas
    if (normalized.includes("diurna")) entities.jornadas.push("DIURNA");
    if (normalized.includes("nocturna")) entities.jornadas.push("NOCTURNA");
    if (normalized.includes("distancia")) entities.jornadas.push("DISTANCIA");

    // Detectar intenciones
    if (/materias?|asignaturas?|pensum/i.test(normalized)) {
      entities.intenciones.push("INFO_PENSUM");
    }
    if (/creditos?/i.test(normalized)) {
      entities.intenciones.push("CREDITOS");
    }
    if (/facultad/i.test(normalized)) {
      entities.intenciones.push("INFO_FACULTAD");
    }
    if (/programa|carrera/i.test(normalized)) {
      entities.intenciones.push("INFO_PROGRAMA");
    }
    if (/listar|cuales|todos/i.test(normalized)) {
      entities.intenciones.push("LISTAR");
    }

    if (entities.intenciones.length === 0) {
      entities.intenciones.push("GENERAL");
    }

    return entities;
  }

  // ============================================
  // MANEJO DE CONTEXTO CONVERSACIONAL
  // ============================================

  /**
   * Enriquece las entidades extraídas con el contexto de la sesión
   * Si falta el programa pero hay semestre, usa el programa del contexto
   */
  private enrichEntitiesFromContext(
    sessionId: string,
    entities: ExtractedEntities,
    message: string,
  ): ExtractedEntities {
    const ctx = this.sessionContext.get(sessionId);
    if (!ctx) return entities;

    const normalized = normalizeText(message);

    // Detectar preguntas de seguimiento ("y de...", "que tal...", "y el...")
    const esPreguntaSeguimiento =
      /^(y\s+(de|el|la|los|las)?|que\s+tal|como\s+es|cual(es)?)/i.test(
        normalized,
      );

    // Si no se detectó programa pero hay contexto y es pregunta de seguimiento o menciona semestre
    if (entities.programas.length === 0 && ctx.programa) {
      const mencionaSemestre =
        entities.semestres.length > 0 ||
        /semestre|primer|segund|tercer|cuart|quint|sext|septim|octav|noven|decim/i.test(
          normalized,
        );

      if (esPreguntaSeguimiento || mencionaSemestre) {
        entities.programas.push(ctx.programa);
        logger.debug("Programa inferido del contexto", {
          programa: ctx.programa,
        });
      }
    }

    // Si no se detectó facultad pero hay contexto
    if (
      entities.facultades.length === 0 &&
      ctx.facultad &&
      esPreguntaSeguimiento
    ) {
      entities.facultades.push(ctx.facultad);
    }

    // Si hay semestre y programa del contexto, agregar intención de pensum
    if (entities.semestres.length > 0 && entities.programas.length > 0) {
      if (!entities.intenciones.includes("INFO_PENSUM")) {
        entities.intenciones = entities.intenciones.filter(
          (i) => i !== "GENERAL",
        );
        entities.intenciones.push("INFO_PENSUM");
      }
    }

    return entities;
  }

  /**
   * Actualiza el contexto de la sesión basado en las entidades detectadas
   */
  private updateSessionContext(
    sessionId: string,
    entities: ExtractedEntities,
  ): void {
    let ctx = this.sessionContext.get(sessionId) || {};

    // Actualizar programa si se detectó uno nuevo
    if (entities.programas.length > 0) {
      ctx.programa = entities.programas[0];
    }

    // Actualizar facultad si se detectó una nueva
    if (entities.facultades.length > 0) {
      ctx.facultad = entities.facultades[0];
    }

    // Actualizar último tema
    if (
      entities.intenciones.length > 0 &&
      !entities.intenciones.includes("GENERAL")
    ) {
      ctx.ultimoTema = entities.intenciones[0];
    }

    this.sessionContext.set(sessionId, ctx);
    logger.debug("Contexto de sesión actualizado", { sessionId, ctx });
  }

  // ============================================
  // CONTEXTO ACADÉMICO
  // ============================================

  private getAcademicContext(entities: ExtractedEntities): AcademicContext {
    const context: AcademicContext = {
      facultades: [],
      programas: [],
      materias: [],
      summary: "",
    };

    // Si hay programa, buscar sus materias
    if (entities.programas.length > 0) {
      const programa = entities.programas[0];

      // Buscar información del programa
      const programasInfo = localDataService.getProgramas(programa);
      context.programas = programasInfo;

      // Buscar materias del programa
      const semestre =
        entities.semestres.length > 0 ? entities.semestres[0] : undefined;
      const jornada =
        entities.jornadas.length > 0 ? entities.jornadas[0] : undefined;

      const materias = localDataService.getMaterias(
        programa,
        semestre,
        undefined,
        jornada,
      );
      context.materias = materias;

      // Generar resumen
      if (semestre) {
        context.summary = `Materias del semestre ${semestre} del programa ${programa}`;
      } else {
        context.summary = `Información del programa ${programa}`;
      }
    }

    // Si pregunta por facultades
    if (entities.intenciones.includes("INFO_FACULTAD")) {
      context.facultades = localDataService.getFacultades();
    }

    // Si pregunta por programas en general (listar todos)
    if (
      (entities.intenciones.includes("INFO_PROGRAMA") ||
        entities.intenciones.includes("LISTAR")) &&
      entities.programas.length === 0
    ) {
      // Incluir todos los programas
      context.programas = localDataService.getProgramas();
      context.summary = `Lista de ${context.programas.length} programas académicos disponibles`;
    }

    return context;
  }

  // ============================================
  // RESPUESTAS ESPECIALES
  // ============================================

  private async handleGreeting(
    sessionId: string,
    startTime: number,
  ): Promise<ChatbotResponse> {
    const greeting =
      "¡Hola! 👋 Soy UConnect, tu asistente virtual de la Universidad de Córdoba. " +
      "Puedo ayudarte con información sobre:\n\n" +
      "📚 **Programas académicos** - Carreras disponibles\n" +
      "📋 **Pensum** - Materias por semestre\n" +
      "🏛️ **Facultades** - Información de facultades\n\n" +
      "¿En qué puedo ayudarte hoy?";

    await chatRepository.addMessage(sessionId, "assistant", greeting);

    return {
      message: greeting,
      sources: [],
      tokensUsed: { input: 0, output: 0 },
    };
  }

  private async handleFarewell(
    sessionId: string,
    startTime: number,
  ): Promise<ChatbotResponse> {
    const farewell =
      "¡Hasta pronto! 👋 Fue un gusto ayudarte. " +
      "Si tienes más preguntas sobre la Universidad de Córdoba, no dudes en volver. " +
      "¡Éxitos en tu camino académico! 🎓";

    await chatRepository.addMessage(sessionId, "assistant", farewell);
    ollamaService.clearSession(sessionId);

    return {
      message: farewell,
      sources: [],
      tokensUsed: { input: 0, output: 0 },
    };
  }

  // ============================================
  // UTILIDADES
  // ============================================

  private getSources(context: AcademicContext): string[] {
    const sources: string[] = [];

    if (context.facultades.length > 0) sources.push("Datos de Facultades");
    if (context.programas.length > 0)
      sources.push("Datos de Programas Académicos");
    if (context.materias.length > 0) {
      const pensum = context.materias[0]?.pensum;
      sources.push(`Pensum ${pensum || "actualizado"}`);
    }

    return sources.length > 0 ? sources : ["Base de conocimiento local"];
  }

  // ============================================
  // MÉTODOS PÚBLICOS
  // ============================================

  async getStats() {
    const stats = localDataService.getEstadisticas();
    const chatCount = await chatRepository.getChatCount();

    return {
      ...stats,
      chatsActivos: chatCount,
    };
  }

  createSession(): string {
    return uuidv4();
  }
}

// Singleton
export const chatbot = new Chatbot();
