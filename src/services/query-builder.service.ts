import { config } from "../config";
import { QUERY_OPTIMIZATION_PROMPT } from "../config/prompts";
import { logger, normalizeText, extractKeywords } from "../utils";
import {
  ExtractedEntities,
  IntentType,
  QueryPlan,
  FacultadParams,
  ProgramaParams,
  PensumParams,
  ApiCall,
} from "../types";
import { ollamaService } from "./ollama.service";

export class QueryBuilderService {
  // Mapeo de palabras clave a facultades
  private readonly facultadKeywords: Map<string, string[]> = new Map([
    [
      "ingenieria",
      [
        "ingenierias",
        "sistemas",
        "mecanica",
        "ambiental",
        "alimentos",
        "industrial",
        "agronomica",
      ],
    ],
    ["salud", ["medicina", "enfermeria", "bacteriologia", "salud"]],
    [
      "educacion",
      ["licenciatura", "pedagogia", "educacion", "ciencias humanas"],
    ],
    ["agricolas", ["agronomia", "acuicultura", "agricola"]],
    ["veterinaria", ["veterinaria", "zootecnia", "animal"]],
    [
      "economicas",
      [
        "administracion",
        "contaduria",
        "economia",
        "derecho",
        "finanzas",
        "negocios",
      ],
    ],
    [
      "basicas",
      [
        "matematicas",
        "fisica",
        "quimica",
        "biologia",
        "estadistica",
        "geografia",
      ],
    ],
  ]);

  // Patrones de intención
  private readonly intentPatterns: Map<IntentType, RegExp[]> = new Map([
    [
      "SALUDO",
      [
        /^(hola|buenos?\s*d[ií]as?|buenas?\s*(tardes?|noches?)|hey|saludos?|qu[eé]\s*tal)/i,
      ],
    ],
    ["DESPEDIDA", [/^(adi[oó]s|chao|hasta\s*luego|bye|gracias|nos\s*vemos)/i]],
    [
      "LISTAR_FACULTADES",
      [
        /cu[aá]ntas?\s*facultades?|listar?\s*facultades?|todas?\s*las?\s*facultades?|qu[eé]\s*facultades?/i,
      ],
    ],
    [
      "LISTAR_PROGRAMAS",
      [
        /cu[aá]ntos?\s*programas?|listar?\s*programas?|carreras?\s*ofrece|qu[eé]\s*carreras?|programas?\s*tiene/i,
      ],
    ],
    [
      "LISTAR_MATERIAS",
      [
        /cu[aá]ntas?\s*materias?|listar?\s*materias?|todas?\s*las?\s*materias?/i,
      ],
    ],
    [
      "INFO_FACULTAD",
      [/facultad\s*de|sobre\s*la\s*facultad|informaci[oó]n\s*facultad/i],
    ],
    [
      "INFO_PROGRAMA",
      [
        /carrera\s*de|programa\s*de|estudiar|sobre\s*(el|la)\s*(programa|carrera)|ingenier[ií]a|licenciatura|maestr[ií]a|especializaci[oó]n/i,
      ],
    ],
    ["INFO_MATERIA", [/materia\s*de|asignatura|clase\s*de|curso\s*de/i]],
    [
      "INFO_PENSUM",
      [/pensum|plan\s*de\s*estudios?|malla\s*curricular|semestres?/i],
    ],
    ["CREDITOS", [/cr[eé]ditos?|cu[aá]ntos?\s*cr[eé]ditos?/i]],
    ["JORNADA", [/jornada|diurna|nocturna|sabatina|horario/i]],
  ]);

  constructor() {
    logger.info("QueryBuilderService inicializado");
  }

  // ============================================
  // EXTRACCIÓN DE ENTIDADES
  // ============================================

  /**
   * Extrae entidades del mensaje usando reglas + IA
   */
  async extractEntities(message: string): Promise<ExtractedEntities> {
    const normalizedMessage = normalizeText(message);

    // Primero intentar extracción basada en reglas
    const ruleBasedEntities = this.extractEntitiesWithRules(normalizedMessage);

    // Si encontramos suficiente información, no llamamos a la IA
    if (this.hasEnoughEntities(ruleBasedEntities)) {
      logger.debug("Entidades extraídas por reglas", {
        entities: ruleBasedEntities,
      });
      return ruleBasedEntities;
    }

    // Complementar con IA para casos complejos
    try {
      const aiEntities = await this.extractEntitiesWithAI(message);
      const merged = this.mergeEntities(ruleBasedEntities, aiEntities);
      logger.info("Entidades extraídas con IA", { entities: merged });
      return merged;
    } catch (error) {
      logger.warn("Error extrayendo entidades con IA, usando solo reglas", {
        error: (error as Error).message,
      });
      return ruleBasedEntities;
    }
  }

  private extractEntitiesWithRules(message: string): ExtractedEntities {
    const entities: ExtractedEntities = {
      facultades: [],
      programas: [],
      materias: [],
      semestres: [],
      jornadas: [],
      intenciones: [],
      rawQuery: "",
    };

    // Detectar intenciones
    for (const [intent, patterns] of this.intentPatterns) {
      if (patterns.some((pattern) => pattern.test(message))) {
        entities.intenciones.push(intent);
      }
    }

    // Si no se detectó intención específica, es GENERAL
    if (entities.intenciones.length === 0) {
      entities.intenciones.push("GENERAL");
    }

    // Detectar facultades por keywords
    for (const [facultad, keywords] of this.facultadKeywords) {
      if (keywords.some((kw) => message.includes(kw))) {
        entities.facultades.push(facultad);
      }
    }

    // Detectar programas conocidos con nombres completos
    const programasMap: Record<string, string> = {
      "ingenieria de sistemas": "INGENIERIA DE SISTEMAS",
      "ingenieria sistemas": "INGENIERIA DE SISTEMAS",
      sistemas: "INGENIERIA DE SISTEMAS",
      "ingenieria mecanica": "INGENIERIA MECANICA",
      mecanica: "INGENIERIA MECANICA",
      "ingenieria ambiental": "INGENIERIA AMBIENTAL",
      ambiental: "INGENIERIA AMBIENTAL",
      "ingenieria de alimentos": "INGENIERIA DE ALIMENTOS",
      alimentos: "INGENIERIA DE ALIMENTOS",
      "ingenieria industrial": "INGENIERIA INDUSTRIAL",
      industrial: "INGENIERIA INDUSTRIAL",
      "ingenieria agronomica": "INGENIERIA AGRONOMICA",
      agronomica: "INGENIERIA AGRONOMICA",
      medicina: "MEDICINA",
      enfermeria: "ENFERMERIA",
      bacteriologia: "BACTERIOLOGIA",
      derecho: "DERECHO",
      administracion: "ADMINISTRACION EN FINANZAS Y NEGOCIOS INTERNACIONALES",
      contaduria: "CONTADURIA PUBLICA",
      economia: "ECONOMIA",
      acuicultura: "ACUICULTURA",
      veterinaria: "MEDICINA VETERINARIA Y ZOOTECNIA",
      zootecnia: "MEDICINA VETERINARIA Y ZOOTECNIA",
      matematicas: "LICENCIATURA EN MATEMATICAS",
      fisica: "FISICA",
      quimica: "QUIMICA",
      biologia: "BIOLOGIA",
      estadistica: "ESTADISTICA",
      geografia: "GEOGRAFIA",
    };

    for (const [keyword, programa] of Object.entries(programasMap)) {
      if (message.includes(keyword)) {
        if (!entities.programas.includes(programa)) {
          entities.programas.push(programa);
        }
        break; // Solo tomar el primer match para evitar duplicados
      }
    }

    // Detectar semestres - incluyendo "primer", "segundo", etc.
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
      séptimo: "7",
      "7mo": "7",
      "7°": "7",
      octavo: "8",
      "8vo": "8",
      "8°": "8",
      noveno: "9",
      "9no": "9",
      "9°": "9",
      decimo: "10",
      décimo: "10",
      "10mo": "10",
      "10°": "10",
    };

    // Buscar patrón "X semestre" donde X es ordinal
    for (const [ordinal, numero] of Object.entries(semestresOrdinal)) {
      if (message.includes(ordinal) && message.includes("semestre")) {
        entities.semestres.push(numero);
        break;
      }
    }

    // También buscar patrón numérico "semestre N"
    const semestreMatch = message.match(/(?:semestre|sem)\s*(\d+)/i);
    if (semestreMatch && entities.semestres.length === 0) {
      entities.semestres.push(semestreMatch[1]);
    }

    // Detectar jornadas
    if (message.includes("diurna")) entities.jornadas.push("DIURNA");
    if (message.includes("nocturna")) entities.jornadas.push("NOCTURNA");
    if (message.includes("sabatina")) entities.jornadas.push("SABATINA");

    // Generar query raw
    entities.rawQuery = extractKeywords(message).join(" ");

    return entities;
  }

  private async extractEntitiesWithAI(
    message: string,
  ): Promise<ExtractedEntities> {
    return ollamaService.extractEntitiesWithAI(message);
  }

  private hasEnoughEntities(entities: ExtractedEntities): boolean {
    const hasSaludoOrDespedida = entities.intenciones.some(
      (i) => i === "SALUDO" || i === "DESPEDIDA",
    );

    if (hasSaludoOrDespedida) return true;

    const hasSpecificEntities =
      entities.facultades.length > 0 ||
      entities.programas.length > 0 ||
      entities.materias.length > 0;

    const hasListIntent = entities.intenciones.some((i) =>
      i.startsWith("LISTAR_"),
    );

    return hasSpecificEntities || hasListIntent;
  }

  private mergeEntities(
    rules: ExtractedEntities,
    ai: ExtractedEntities,
  ): ExtractedEntities {
    return {
      facultades: [...new Set([...rules.facultades, ...ai.facultades])],
      programas: [...new Set([...rules.programas, ...ai.programas])],
      materias: [...new Set([...rules.materias, ...ai.materias])],
      semestres: [...new Set([...rules.semestres, ...ai.semestres])],
      jornadas: [...new Set([...rules.jornadas, ...ai.jornadas])],
      intenciones: [
        ...new Set([...rules.intenciones, ...ai.intenciones]),
      ] as IntentType[],
      rawQuery: ai.rawQuery || rules.rawQuery,
    };
  }

  // ============================================
  // GENERACIÓN DE QUERY PLAN
  // ============================================

  /**
   * Genera un plan de consultas óptimo basado en las entidades
   */
  async buildQueryPlan(entities: ExtractedEntities): Promise<QueryPlan> {
    const apis: ApiCall[] = [];

    // Saludos y despedidas no necesitan APIs
    if (
      entities.intenciones.includes("SALUDO") ||
      entities.intenciones.includes("DESPEDIDA")
    ) {
      return { apis: [], strategy: "sequential", maxResults: 0 };
    }

    // Listar facultades
    if (entities.intenciones.includes("LISTAR_FACULTADES")) {
      apis.push({
        endpoint: "facultades",
        params: {},
        priority: 1,
      });
    }

    // Búsqueda de facultad específica
    if (
      entities.facultades.length > 0 ||
      entities.intenciones.includes("INFO_FACULTAD")
    ) {
      const facultadNombre = entities.facultades[0] || entities.rawQuery;
      apis.push({
        endpoint: "facultades",
        params: { nombre: facultadNombre } as FacultadParams,
        priority: 1,
      });
    }

    // Listar o buscar programas
    if (
      entities.intenciones.includes("LISTAR_PROGRAMAS") ||
      entities.intenciones.includes("INFO_PROGRAMA") ||
      entities.programas.length > 0
    ) {
      const params: ProgramaParams = {};

      if (entities.programas.length > 0) {
        // Usar primera palabra significativa para búsqueda parcial
        params.programa_nombre = entities.programas[0].slice(0, 6);
      } else if (entities.rawQuery) {
        params.programa_nombre = entities.rawQuery.split(" ")[0];
      }

      if (entities.facultades.length > 0) {
        params.facultad_nombre = entities.facultades[0];
      }

      apis.push({
        endpoint: "programas",
        params,
        priority: 2,
      });
    }

    // Búsqueda de materias o pensum
    if (
      entities.intenciones.includes("INFO_MATERIA") ||
      entities.intenciones.includes("INFO_PENSUM") ||
      entities.intenciones.includes("LISTAR_MATERIAS") ||
      entities.intenciones.includes("CREDITOS") ||
      entities.materias.length > 0 ||
      (entities.programas.length > 0 && entities.semestres.length > 0)
    ) {
      const params: PensumParams = {};

      // Si hay un programa específico, filtrar por programa
      if (entities.programas.length > 0) {
        params.programa_nombre = entities.programas[0];
      }

      // Si hay semestre específico, filtrar por semestre
      if (entities.semestres.length > 0) {
        params.semestre = entities.semestres[0];
      }

      // Solo buscar por nombre de materia si se menciona explícitamente
      if (entities.materias.length > 0) {
        params.materia_nombre = entities.materias[0];
      }

      if (entities.jornadas.length > 0) {
        params.lugar_desarrollo = entities.jornadas[0];
      }

      apis.push({
        endpoint: "pensum",
        params,
        priority: 3,
      });
    }

    // Si no hay APIs específicas pero hay query, hacer búsqueda inteligente
    if (apis.length === 0 && entities.rawQuery) {
      // Buscar en programas primero
      apis.push({
        endpoint: "programas",
        params: {
          programa_nombre: entities.rawQuery.split(" ")[0],
        } as ProgramaParams,
        priority: 1,
      });
    }

    // Ordenar por prioridad
    apis.sort((a, b) => a.priority - b.priority);

    // Limitar a máximo 3 llamadas
    const limitedApis = apis.slice(0, 3);

    return {
      apis: limitedApis,
      strategy: limitedApis.length > 1 ? "parallel" : "sequential",
      maxResults: config.chatbot.maxApiResults,
    };
  }

  // ============================================
  // OPTIMIZACIÓN DE QUERY CON IA
  // ============================================

  /**
   * Usa IA para optimizar queries complejos
   */
  async optimizeQueryWithAI(
    message: string,
    entities: ExtractedEntities,
  ): Promise<QueryPlan> {
    try {
      const prompt = QUERY_OPTIMIZATION_PROMPT.replace(
        "{message}",
        message,
      ).replace("{entities}", JSON.stringify(entities, null, 2));

      const response = await ollamaService.generateQueryOptimization(prompt);

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No se pudo extraer JSON del plan de query");
      }

      const plan = JSON.parse(jsonMatch[0]) as QueryPlan;

      // Validar y sanitizar el plan
      return this.validateQueryPlan(plan);
    } catch (error) {
      logger.warn("Error optimizando query con IA, usando plan básico", {
        error: (error as Error).message,
      });
      return this.buildQueryPlan(entities);
    }
  }

  private validateQueryPlan(plan: QueryPlan): QueryPlan {
    const validEndpoints = ["facultades", "programas", "pensum"];

    const validatedApis = plan.apis
      .filter((api) => validEndpoints.includes(api.endpoint))
      .slice(0, 3)
      .map((api, index) => ({
        ...api,
        priority: api.priority || index + 1,
      }));

    return {
      apis: validatedApis,
      strategy: plan.strategy === "parallel" ? "parallel" : "sequential",
      maxResults: Math.min(plan.maxResults || 50, config.chatbot.maxApiResults),
    };
  }
}

// Singleton
export const queryBuilderService = new QueryBuilderService();
