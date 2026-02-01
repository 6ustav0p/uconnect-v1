import axios, { AxiosInstance, AxiosError } from "axios";
import { config } from "../config";
import { logger, withRetry, normalizeText, generateCacheKey } from "../utils";
import {
  Facultad,
  ProgramaAcademico,
  MateriaPensum,
  FacultadParams,
  ProgramaParams,
  PensumParams,
} from "../types";

// Importar datos locales como fallback
import facultadesData from "../facultades_api.json";
import programasData from "../programas_academicos_api.json";
import pensumData from "../pensum_programa.json";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class AcademusoftService {
  private client: AxiosInstance;
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private readonly cacheTTL: number;

  // Datos locales tipados
  private localFacultades: Facultad[];
  private localProgramas: ProgramaAcademico[];
  private localPensum: MateriaPensum[];

  constructor() {
    this.client = axios.create({
      baseURL: config.academusoft.baseUrl,
      timeout: config.academusoft.timeout,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    this.cacheTTL = config.chatbot.cacheTTLSeconds * 1000;

    // Cargar datos locales
    this.localFacultades = facultadesData as Facultad[];
    this.localProgramas = programasData as ProgramaAcademico[];
    this.localPensum = pensumData as MateriaPensum[];

    logger.info("AcademusoftService inicializado", {
      facultades: this.localFacultades.length,
      programas: this.localProgramas.length,
      pensum: this.localPensum.length,
    });
  }

  // ============================================
  // MÉTODOS DE CACHÉ
  // ============================================

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  // ============================================
  // API: FACULTADES
  // ============================================

  async getFacultades(params?: FacultadParams): Promise<Facultad[]> {
    const cacheKey = generateCacheKey(
      "facultades",
      (params || {}) as Record<string, unknown>,
    );
    const cached = this.getCached<Facultad[]>(cacheKey);
    if (cached) {
      logger.debug("Facultades desde caché", { params });
      return cached;
    }

    try {
      const result = await withRetry(async () => {
        const response = await this.client.get<Facultad[]>(
          config.academusoft.endpoints.facultades,
          { params },
        );
        return response.data;
      }, config.academusoft.retries);

      this.setCache(cacheKey, result);
      logger.info("Facultades desde API", { count: result.length, params });
      return result;
    } catch (error) {
      logger.warn("Error API facultades, usando datos locales", {
        error: (error as AxiosError).message,
      });
      return this.filterLocalFacultades(params);
    }
  }

  private filterLocalFacultades(params?: FacultadParams): Facultad[] {
    if (!params) return this.localFacultades;

    return this.localFacultades.filter((f) => {
      if (params.codigo && f.unid_id !== params.codigo) return false;
      if (
        params.nombre &&
        !normalizeText(f.unid_nombre).includes(normalizeText(params.nombre))
      ) {
        return false;
      }
      return true;
    });
  }

  // ============================================
  // API: PROGRAMAS ACADÉMICOS
  // ============================================

  async getProgramas(params?: ProgramaParams): Promise<ProgramaAcademico[]> {
    const cacheKey = generateCacheKey(
      "programas",
      (params || {}) as Record<string, unknown>,
    );
    const cached = this.getCached<ProgramaAcademico[]>(cacheKey);
    if (cached) {
      logger.debug("Programas desde caché", { params });
      return cached;
    }

    try {
      const result = await withRetry(async () => {
        const response = await this.client.get<ProgramaAcademico[]>(
          config.academusoft.endpoints.programas,
          { params },
        );
        return response.data;
      }, config.academusoft.retries);

      this.setCache(cacheKey, result);
      logger.info("Programas desde API", { count: result.length, params });
      return result;
    } catch (error) {
      logger.warn("Error API programas, usando datos locales", {
        error: (error as AxiosError).message,
      });
      return this.filterLocalProgramas(params);
    }
  }

  private filterLocalProgramas(params?: ProgramaParams): ProgramaAcademico[] {
    if (!params) return this.localProgramas;

    return this.localProgramas.filter((p) => {
      if (params.facultad_id && p.facultad_id !== params.facultad_id)
        return false;
      if (params.programa_id && p.prog_id !== params.programa_id) return false;
      if (
        params.facultad_nombre &&
        !normalizeText(p.facultad_nombre).includes(
          normalizeText(params.facultad_nombre),
        )
      ) {
        return false;
      }
      if (
        params.programa_nombre &&
        !normalizeText(p.prog_nombre).includes(
          normalizeText(params.programa_nombre),
        )
      ) {
        return false;
      }
      return true;
    });
  }

  // ============================================
  // API: PENSUM / MATERIAS
  // ============================================

  async getPensum(params?: PensumParams): Promise<MateriaPensum[]> {
    const cacheKey = generateCacheKey(
      "pensum",
      (params || {}) as Record<string, unknown>,
    );
    const cached = this.getCached<MateriaPensum[]>(cacheKey);
    if (cached) {
      logger.debug("Pensum desde caché", { params });
      return cached;
    }

    try {
      const result = await withRetry(async () => {
        const response = await this.client.get<MateriaPensum[]>(
          config.academusoft.endpoints.pensum,
          { params },
        );
        return response.data;
      }, config.academusoft.retries);

      // Limitar resultados para no sobrecargar
      const limited = result.slice(0, config.chatbot.maxApiResults * 10);
      this.setCache(cacheKey, limited);
      logger.info("Pensum desde API", { count: limited.length, params });
      return limited;
    } catch (error) {
      logger.warn("Error API pensum, usando datos locales", {
        error: (error as AxiosError).message,
      });
      return this.filterLocalPensum(params);
    }
  }

  private filterLocalPensum(params?: PensumParams): MateriaPensum[] {
    let results = this.localPensum;

    if (params) {
      results = results.filter((m) => {
        if (params.materia_codigo && m.codigo_materia !== params.materia_codigo)
          return false;
        if (
          params.materia_nombre &&
          !normalizeText(m.materia).includes(
            normalizeText(params.materia_nombre),
          )
        ) {
          return false;
        }
        // Filtrar por programa académico
        if (
          params.programa_nombre &&
          !normalizeText(m.programa).includes(
            normalizeText(params.programa_nombre),
          )
        ) {
          return false;
        }
        // Filtrar por semestre
        if (params.semestre && m.semestre !== params.semestre) {
          return false;
        }
        if (params.pensun && m.pensum !== params.pensun) return false;
        if (
          params.lugar_desarrollo &&
          !normalizeText(m.unid_nombre).includes(
            normalizeText(params.lugar_desarrollo),
          )
        ) {
          return false;
        }
        return true;
      });
    }

    // Limitar resultados
    return results.slice(0, config.chatbot.maxApiResults * 10);
  }

  // ============================================
  // MÉTODOS DE BÚSQUEDA AVANZADA
  // ============================================

  /**
   * Búsqueda inteligente que combina múltiples fuentes
   */
  async smartSearch(query: string): Promise<{
    facultades: Facultad[];
    programas: ProgramaAcademico[];
    materias: MateriaPensum[];
  }> {
    const normalizedQuery = normalizeText(query);
    const keywords = normalizedQuery.split(/\s+/).filter((k) => k.length > 2);

    logger.info("Smart search iniciado", { query, keywords });

    // Búsqueda paralela en todas las fuentes
    const [facultades, programas, materias] = await Promise.all([
      this.searchFacultades(keywords),
      this.searchProgramas(keywords),
      this.searchMaterias(keywords),
    ]);

    return { facultades, programas, materias };
  }

  private async searchFacultades(keywords: string[]): Promise<Facultad[]> {
    const results = new Set<Facultad>();

    for (const keyword of keywords.slice(0, 3)) {
      const facultades = await this.getFacultades({ nombre: keyword });
      facultades.forEach((f) => results.add(f));
    }

    return Array.from(results);
  }

  private async searchProgramas(
    keywords: string[],
  ): Promise<ProgramaAcademico[]> {
    const results = new Map<string, ProgramaAcademico>();

    for (const keyword of keywords.slice(0, 3)) {
      const programas = await this.getProgramas({ programa_nombre: keyword });
      programas.forEach((p) => results.set(p.prog_id, p));
    }

    return Array.from(results.values()).slice(0, config.chatbot.maxApiResults);
  }

  private async searchMaterias(keywords: string[]): Promise<MateriaPensum[]> {
    const results = new Map<string, MateriaPensum>();

    for (const keyword of keywords.slice(0, 2)) {
      const materias = await this.getPensum({ materia_nombre: keyword });
      materias.forEach((m) =>
        results.set(`${m.programa}-${m.codigo_materia}`, m),
      );
    }

    return Array.from(results.values()).slice(0, config.chatbot.maxApiResults);
  }

  // ============================================
  // MÉTODOS DE AGREGACIÓN
  // ============================================

  /**
   * Obtiene estadísticas de un programa
   */
  async getProgramStats(programaNombre: string): Promise<{
    programa: string;
    totalCreditos: number;
    totalMaterias: number;
    semestres: number;
    pensum: string;
    jornadas: string[];
  } | null> {
    const materias = await this.getPensum({ materia_nombre: programaNombre });

    if (materias.length === 0) {
      // Intentar búsqueda por programa directamente
      const filtered = this.localPensum.filter((m) =>
        normalizeText(m.programa).includes(normalizeText(programaNombre)),
      );

      if (filtered.length === 0) return null;

      return this.aggregateProgramStats(filtered);
    }

    return this.aggregateProgramStats(materias);
  }

  private aggregateProgramStats(materias: MateriaPensum[]): {
    programa: string;
    totalCreditos: number;
    totalMaterias: number;
    semestres: number;
    pensum: string;
    jornadas: string[];
  } {
    const programa = materias[0].programa;
    const pensum = materias[0].pensum;
    const totalCreditos = parseInt(materias[0].numero_de_creditos_pensum) || 0;

    const materiasUnicas = new Set(materias.map((m) => m.codigo_materia));
    const semestres = new Set(materias.map((m) => m.semestre));
    const jornadas = [...new Set(materias.map((m) => m.jornada))];

    return {
      programa,
      totalCreditos,
      totalMaterias: materiasUnicas.size,
      semestres: semestres.size,
      pensum,
      jornadas,
    };
  }

  /**
   * Obtiene programas por facultad con conteo
   */
  async getProgramasByFacultad(): Promise<Map<string, ProgramaAcademico[]>> {
    const programas = await this.getProgramas();
    const grouped = new Map<string, ProgramaAcademico[]>();

    for (const programa of programas) {
      const facultad = programa.facultad_nombre;
      if (!grouped.has(facultad)) {
        grouped.set(facultad, []);
      }
      grouped.get(facultad)!.push(programa);
    }

    return grouped;
  }

  /**
   * Obtiene materias por semestre de un programa
   */
  async getMateriasBySemestre(
    programaNombre: string,
  ): Promise<Map<string, MateriaPensum[]>> {
    const materias = this.localPensum.filter((m) =>
      normalizeText(m.programa).includes(normalizeText(programaNombre)),
    );

    const grouped = new Map<string, MateriaPensum[]>();

    for (const materia of materias) {
      const semestre = `Semestre ${materia.semestre}`;
      if (!grouped.has(semestre)) {
        grouped.set(semestre, []);
      }
      grouped.get(semestre)!.push(materia);
    }

    return grouped;
  }

  // ============================================
  // GETTERS PARA DATOS LOCALES
  // ============================================

  getAllFacultades(): Facultad[] {
    return this.localFacultades;
  }

  getAllProgramas(): ProgramaAcademico[] {
    return this.localProgramas;
  }

  getProgramasCount(): number {
    return this.localProgramas.length;
  }

  getFacultadesCount(): number {
    return this.localFacultades.length;
  }
}

// Singleton
export const academusoftService = new AcademusoftService();
