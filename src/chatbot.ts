import { v4 as uuidv4 } from "uuid";
import { config } from "./config";
import { ADMISION_CONTEXT } from "./config/prompts";
import { logger, normalizeText } from "./utils";
import {
  ollamaService,
  database,
  chatRepository,
  pepRepository,
  academusoftService,
  faqService,
} from "./services";
import { localDataService } from "./services/local-data.service";
import {
  ChatMessage,
  ChatbotResponse,
  AcademicContext,
  ExtractedEntities,
  MateriaPensum,
} from "./types";
import { ADMISSION_GUIDED_QUESTIONS } from "./config/prompts";

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

      // Early-exit: banco de preguntas (FAQ)
      const faqMatch = await faqService.match(userMessage);
      if (faqMatch) {
        await chatRepository.addMessage(sessionId, "assistant", faqMatch.answer, {
          sources: ["FAQ"],
        });

        return {
          message: faqMatch.answer,
          sources: ["FAQ"],
          tokensUsed: { input: 0, output: 0 },
        };
      }

      // Verificar intención de admisión
      if (entities.intenciones.includes("INFO_ADMISION")) {
        this.updateSessionContext(sessionId, entities);
        return this.handleAdmisionIntent(
          sessionId,
          userMessage,
          entities,
          history,
          startTime,
        );
      }

      // Actualizar contexto de la sesión
      this.updateSessionContext(sessionId, entities);

      // Obtener contexto académico
      const context = await this.getAcademicContext(entities);

      // Log detallado de información recopilada
      const contextStats = {
        facultades: context.facultades.length,
        programas: context.programas.length,
        materias: context.materias.length,
        pepIncluido: !!context.pep,
        pepCampos: context.pep
          ? Object.keys(context.pep).filter(
              (k) => context.pep![k as keyof typeof context.pep],
            ).length
          : 0,
        resumen: context.summary || "Sin resumen",
      };

      logger.info("📊 CONTEXTO ACADÉMICO RECOPILADO", contextStats);

      if (context.materias.length > 0) {
        logger.info("📚 Materias encontradas", {
          total: context.materias.length,
          primeras5: context.materias.slice(0, 5).map((m) => m.materia),
        });
      }

      if (context.programas.length > 0) {
        logger.info("🎓 Programas encontrados", {
          total: context.programas.length,
          nombres: context.programas.slice(0, 5).map((p) => p.prog_nombre),
        });
      }

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

    // Detectar saludos (SOLO si es un saludo simple sin pregunta adicional)
    const saludoRegex =
      /^(hola|buenos?\s*d[ií]as?|buenas?\s*(tardes?|noches?)|hey|saludos?|qu[eé]\s*tal)[\s,!?.]*$/i;
    if (saludoRegex.test(normalized)) {
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

    // Detectar intención de admisión / puntajes
    const admisionRegex = /admisi[oó]n|inscripci[oó]n|inscribirme|proceso\s*(de)?\s*(admisi[oó]n|inscripci[oó]n|entrada|ingreso|selecci[oó]n)|requisitos?\s*(de)?\s*ingreso|como\s*(entro|ingreso|me\s*inscribo)|puedo\s*(entrar|ingresar|aspirar)|puntaje|icfes|saber\s*11|aspirante|aspirar|simulador|ponderado|puntaje\s*m[ií]nimo|nota\s*de\s*corte|corte\s*(de)?\s*(admisi[oó]n)?|promedio\s*ponderado|calcular\s*(mi)?\s*puntaje/i;
    if (admisionRegex.test(normalized)) {
      entities.intenciones.push("INFO_ADMISION");
    }

    // Detectar intenciones
    if (/materias?|asignaturas?|pensum/i.test(normalized)) {
      entities.intenciones.push("INFO_PENSUM");
    }
    if (/creditos?/i.test(normalized)) {
      entities.intenciones.push("CREDITOS");
    }
    // Detectar facultad siempre (no solo cuando dice "facultad")
    const facultadDetectada = this.detectarFacultad(normalized);
    if (facultadDetectada) {
      entities.facultades.push(facultadDetectada);
      if (!entities.intenciones.includes("INFO_FACULTAD")) {
        entities.intenciones.push("INFO_FACULTAD");
      }
    } else if (/facultad/i.test(normalized)) {
      // Dice "facultad" pero no detectamos cuál específica
      entities.intenciones.push("INFO_FACULTAD");
    }

    if (/programa|carrera/i.test(normalized)) {
      entities.intenciones.push("INFO_PROGRAMA");
    }
    if (/listar|cuales|todos|que\s+(programas|carreras)\s+(hay|ofrece|tiene)/i.test(normalized)) {
      entities.intenciones.push("LISTAR");
    }

    // Disambiguación: si es listado y se detectó facultad,
    // el match de programa específico es probablemente un falso positivo
    if (
      entities.intenciones.includes("LISTAR") &&
      entities.facultades.length > 0 &&
      entities.programas.length > 0
    ) {
      logger.debug("Disambiguación: listado por facultad, limpiando programa", {
        programaDescartado: entities.programas[0],
        facultad: entities.facultades[0],
      });
      entities.programas = [];
    }

    if (entities.intenciones.length === 0) {
      entities.intenciones.push("GENERAL");
    }

    return entities;
  }

  // ============================================
  // DETECCIÓN DE FACULTAD
  // ============================================

  /**
   * Detecta el nombre de la facultad mencionada en el mensaje.
   * Mapea keywords comunes a los nombres oficiales de las facultades.
   */
  private detectarFacultad(normalized: string): string | null {
    const facultadKeywords: Array<{ keywords: RegExp; nombre: string }> = [
      {
        keywords: /ingenieria|ingenierias|\bing\b/i,
        nombre: "FACULTAD DE INGENIERIAS",
      },
      {
        keywords: /agricola|agricolas|agronomia|agro\b/i,
        nombre: "FACULTAD DE CIENCIAS AGRICOLAS",
      },
      {
        keywords: /ciencias\s*basicas|basicas|fisica|quimica|biologia|estadistica|matematica|geografia/i,
        nombre: "FACULTAD DE CIENCIAS BASICAS",
      },
      {
        keywords: /salud|enfermeria|medicina(?!\s*veterinaria)|bacteriologia/i,
        nombre: "FACULTAD DE CIENCIAS DE LA SALUD",
      },
      {
        keywords: /economica|juridica|administrativa|derecho|administracion|finanzas|comercio/i,
        nombre: "FACULTAD DE CIENCIAS ECONOMICAS, JURIDICAS Y ADMINISTRATIVAS",
      },
      {
        keywords: /educacion|humanas|pedagogia|licenciatura|sociales/i,
        nombre: "FACULTAD DE EDUCACION Y CIENCIAS HUMANAS",
      },
      {
        keywords: /veterinaria|zootecnia|animal/i,
        nombre: "FACULTAD DE MEDICINA VETERINARIA Y ZOOTECNIA",
      },
    ];

    for (const { keywords, nombre } of facultadKeywords) {
      if (keywords.test(normalized)) {
        logger.debug("Facultad detectada", { nombre });
        return nombre;
      }
    }

    return null;
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

  private async getAcademicContext(
    entities: ExtractedEntities,
  ): Promise<AcademicContext> {
    const context: AcademicContext = {
      facultades: [],
      programas: [],
      materias: [],
      summary: "",
      pep: null,
    };

    // Si hay programa, buscar sus materias
    if (entities.programas.length > 0) {
      const programa = entities.programas[0];

      // Buscar información del programa (API Academusoft)
      const programasInfo = await academusoftService.getProgramas({
        programa_nombre: programa,
      });
      context.programas = programasInfo;

      // Buscar materias del programa (API con fallback a datos locales)
      const semestre =
        entities.semestres.length > 0 ? entities.semestres[0] : undefined;
      const jornada =
        entities.jornadas.length > 0 ? entities.jornadas[0] : undefined;

      let materias = await academusoftService.getPensum({
        programa_nombre: programa,
        semestre,
      });

      // Deduplicar resultados
      const seen = new Set<string>();
      materias = materias.filter((m) => {
        const key = `${m.programa}|${m.semestre}|${m.materia}|${m.jornada}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Filtrar por jornada
      if (jornada) {
        materias = materias.filter((m) =>
          normalizeText(m.jornada).includes(normalizeText(jornada)),
        );
      } else if (materias.length > 0) {
        const primeraJornada = materias[0].jornada;
        materias = materias.filter((m) => m.jornada === primeraJornada);
      }

      context.materias = materias;

      // PEP: solo cargar si la consulta amerita perfil del programa
      // (no para consultas simples de materias/pensum/créditos)
      const pensumOnlyIntents = ["INFO_PENSUM", "CREDITOS", "LISTAR", "INFO_FACULTAD"];
      const isPensumOnlyQuery = entities.intenciones.every((i) =>
        pensumOnlyIntents.includes(i),
      );

      const programaInfo = programasInfo[0];
      if (programaInfo && !isPensumOnlyQuery) {
        logger.debug("🔍 Buscando PEP del programa", {
          programaId: programaInfo.prog_id,
          programaNombre: programaInfo.prog_nombre,
        });

        const pep = await pepRepository.findByProgramaId(programaInfo.prog_id);
        if (pep) {
          context.pep = pep;

          // Log detallado del PEP encontrado
          const pepStats = {
            programaId: pep.programaId,
            programaNombre: pep.programaNombre,
            camposDisponibles: {
              resumen: !!pep.resumen,
              historia: !!pep.historia,
              perfilProfesional: !!pep.perfilProfesional,
              perfilOcupacional: !!pep.perfilOcupacional,
              mision: !!pep.mision,
              vision: !!pep.vision,
              objetivos: pep.objetivos?.length || 0,
              competencias: pep.competencias?.length || 0,
              camposOcupacionales: pep.camposOcupacionales?.length || 0,
              lineasInvestigacion: pep.lineasInvestigacion?.length || 0,
              requisitosIngreso: !!pep.requisitosIngreso,
              requisitosGrado: !!pep.requisitosGrado,
              rawText: !!pep.rawText,
            },
            tamanos: {
              resumenChars: pep.resumen?.length || 0,
              historiaChars: pep.historia?.length || 0,
              perfilProfesionalChars: pep.perfilProfesional?.length || 0,
              perfilOcupacionalChars: pep.perfilOcupacional?.length || 0,
              rawTextChars: pep.rawText?.length || 0,
              totalEstimadoChars:
                (pep.resumen?.length || 0) +
                (pep.historia?.length || 0) +
                (pep.perfilProfesional?.length || 0) +
                (pep.perfilOcupacional?.length || 0) +
                (pep.mision?.length || 0) +
                (pep.vision?.length || 0) +
                (pep.objetivos?.join("; ").length || 0) +
                (pep.competencias?.join("; ").length || 0) +
                (pep.rawText?.length || 0),
            },
            actualizadoEn: pep.actualizadoEn,
          };

          logger.info("📋 PEP ENCONTRADO Y CARGADO", pepStats);
          logger.info("📏 Tamaño total del PEP", {
            caracteres: pepStats.tamanos.totalEstimadoChars,
            tokensEstimados: Math.ceil(pepStats.tamanos.totalEstimadoChars / 4),
          });
        } else {
          logger.warn("⚠️ PEP no encontrado en base de datos", {
            programaId: programaInfo.prog_id,
            programaNombre: programaInfo.prog_nombre,
          });
        }
      }

      // Generar resumen
      if (semestre) {
        context.summary = `Materias del semestre ${semestre} del programa ${programa}`;
      } else {
        context.summary = `Información del programa ${programa}`;
      }
    }

    // Si pregunta por facultades
    if (entities.intenciones.includes("INFO_FACULTAD")) {
      if (entities.facultades.length > 0) {
        // Filtrar por la facultad detectada
        context.facultades = await academusoftService.getFacultades({
          nombre: entities.facultades[0],
        });
      } else {
        context.facultades = await academusoftService.getFacultades();
      }
    }

    // Si pregunta por programas en general (sin programa específico detectado)
    if (
      (entities.intenciones.includes("INFO_PROGRAMA") ||
        entities.intenciones.includes("LISTAR") ||
        entities.intenciones.includes("INFO_FACULTAD")) &&
      entities.programas.length === 0
    ) {
      if (entities.facultades.length > 0) {
        // Filtrar programas por la facultad detectada
        const facultadNombre = entities.facultades[0];
        context.programas = await academusoftService.getProgramas({
          facultad_nombre: facultadNombre,
        });
        context.summary = `Programas académicos de la ${facultadNombre}: ${context.programas.length} encontrados`;
        logger.info("Programas filtrados por facultad", {
          facultad: facultadNombre,
          count: context.programas.length,
          programas: context.programas.map((p) => p.prog_nombre),
        });
      } else {
        // Sin facultad específica: incluir todos los programas
        context.programas = await academusoftService.getProgramas();
        context.summary = `Lista de ${context.programas.length} programas académicos disponibles`;
      }
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
      "🏛️ **Facultades** - Información de facultades\n" +
      "📝 **Proceso de admisión** - Puntajes y simulador\n\n" +
      "¿En qué puedo ayudarte hoy?";

    await chatRepository.addMessage(sessionId, "assistant", greeting);

    return {
      message: greeting,
      sources: [],
      tokensUsed: { input: 0, output: 0 },
      suggestedQuestions: ADMISSION_GUIDED_QUESTIONS,
    };
  }

  private async handleAdmisionIntent(
    sessionId: string,
    userMessage: string,
    entities: ExtractedEntities,
    history: ChatMessage[],
    startTime: number,
  ): Promise<ChatbotResponse> {
    const simuladorUrl = config.admision.simuladorUrl;
    const puntajesUrl = config.admision.puntajesReferenciaUrl;

    const admisionInfo =
      "## 📝 Proceso de Admisión - Universidad de Córdoba\n\n" +
      "El ingreso a la Universidad de Córdoba se realiza a través de un **proceso de selección basado en los resultados de las Pruebas Saber 11 (ICFES)**. " +
      "Cada programa académico asigna **pesos diferentes** a las áreas evaluadas (Lectura Crítica, Matemáticas, Ciencias Naturales, Sociales y Ciudadanas, Inglés, entre otras), " +
      "por lo que el **promedio ponderado** varía según la carrera a la que aspires.\n\n" +
      "### 🧮 ¿Cómo calcular tu puntaje?\n" +
      "Puedes usar el **Simulador de Promedio Ponderado** oficial para estimar tu puntaje de admisión " +
      "ingresando tus resultados del Saber 11:\n" +
      `• 📊 [**Simulador de Promedio Ponderado por Programa**](${simuladorUrl})\n\n` +
      "### 📋 ¿Cuáles son los puntajes de referencia?\n" +
      "Consulta los **puntajes mínimos y máximos de referencia** por programa y jornada " +
      "para el período actual:\n" +
      `• 📈 [**Puntajes de Referencia**](${puntajesUrl})\n\n` +
      "### 💡 Recomendación\n" +
      "1. Descarga el **simulador** e ingresa tus puntajes del ICFES\n" +
      "2. Compara tu resultado con los **puntajes de referencia** del programa que te interesa\n" +
      "3. Así podrás tener una orientación clara sobre tus posibilidades de ingreso\n";

    // Si hay programa específico, enriquecer con contexto del programa + IA
    if (entities.programas.length > 0) {
      const context = await this.getAcademicContext(entities);
      context.summary = `Información de admisión para el programa ${entities.programas[0]}`;

      // Inyectar info de admisión en el contexto para que la IA la use
      const admisionContext = ADMISION_CONTEXT
        .replace("{simuladorUrl}", simuladorUrl)
        .replace("{puntajesUrl}", puntajesUrl)
        .replace("{programa}", entities.programas[0]);

      const enrichedContext: AcademicContext = {
        ...context,
        summary: `${context.summary}\n\n${admisionContext}`,
      };

      const response = await ollamaService.generateContextualResponse(
        sessionId,
        userMessage,
        enrichedContext,
        history,
      );

      // Asegurar que los links siempre estén presentes en la respuesta
      let finalMessage = response.message;
      if (!finalMessage.includes(simuladorUrl)) {
        finalMessage +=
          "\n\n---\n" +
          `📊 [**Simulador de Promedio Ponderado**](${simuladorUrl})\n` +
          `📈 [**Puntajes de Referencia**](${puntajesUrl})`;
      }

      await chatRepository.addMessage(sessionId, "assistant", finalMessage);

      return {
        message: finalMessage,
        sources: [
          "Proceso de Admisión - Universidad de Córdoba",
          ...this.getSources(context),
        ],
        tokensUsed: response.tokensUsed,
      };
    }

    // Sin programa específico: respuesta fija informativa
    await chatRepository.addMessage(sessionId, "assistant", admisionInfo);

    return {
      message: admisionInfo,
      sources: ["Proceso de Admisión - Universidad de Córdoba"],
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
    if (context.pep?.programaNombre) {
      sources.push(`PEP ${context.pep.programaNombre}`);
    }
    if (context.summary?.includes("admisión")) {
      sources.push("Proceso de Admisión - Universidad de Córdoba");
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
