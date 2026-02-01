/**
 * Servicio de datos académicos locales
 * Lee directamente de los archivos JSON sin depender de APIs externas
 */

import { logger, normalizeText } from "../utils";
import { Facultad, ProgramaAcademico, MateriaPensum } from "../types";

// Importar datos locales
import facultadesData from "../facultades_api.json";
import programasData from "../programas_academicos_api.json";
import pensumData from "../pensum_programa.json";

export class LocalDataService {
  private facultades: Facultad[];
  private programas: ProgramaAcademico[];
  private pensum: MateriaPensum[];

  constructor() {
    this.facultades = facultadesData as Facultad[];
    this.programas = programasData as ProgramaAcademico[];
    this.pensum = pensumData as MateriaPensum[];

    logger.info("LocalDataService inicializado", {
      facultades: this.facultades.length,
      programas: this.programas.length,
      materias: this.pensum.length,
    });
  }

  // ============================================
  // FACULTADES
  // ============================================

  getFacultades(nombre?: string): Facultad[] {
    if (!nombre) return this.facultades;

    const normalized = normalizeText(nombre);
    return this.facultades.filter((f) =>
      normalizeText(f.unid_nombre).includes(normalized),
    );
  }

  getFacultadById(id: string): Facultad | undefined {
    return this.facultades.find((f) => f.unid_id === id);
  }

  // ============================================
  // PROGRAMAS ACADÉMICOS
  // ============================================

  /**
   * Verifica si un programa es de postgrado (maestría, doctorado, especialización)
   */
  private esPostgrado(nombrePrograma: string): boolean {
    const normalized = normalizeText(nombrePrograma);
    return /maestr[ií]a|doctorado|especializaci[oó]n/i.test(normalized);
  }

  getProgramas(nombre?: string, facultadNombre?: string): ProgramaAcademico[] {
    // Filtrar solo programas de pregrado (excluir postgrados)
    let results = this.programas.filter(
      (p) => !this.esPostgrado(p.prog_nombre),
    );

    if (nombre) {
      const normalized = normalizeText(nombre);
      results = results.filter((p) =>
        normalizeText(p.prog_nombre).includes(normalized),
      );
    }

    if (facultadNombre) {
      const normalized = normalizeText(facultadNombre);
      results = results.filter((p) =>
        normalizeText(p.facultad_nombre).includes(normalized),
      );
    }

    return results;
  }

  getProgramaById(id: string): ProgramaAcademico | undefined {
    return this.programas.find((p) => p.prog_id === id);
  }

  getProgramasPorFacultad(facultadId: string): ProgramaAcademico[] {
    return this.programas.filter((p) => p.facultad_id === facultadId);
  }

  // ============================================
  // PENSUM / MATERIAS
  // ============================================

  getMaterias(
    programaNombre?: string,
    semestre?: string,
    materiaNombre?: string,
    jornada?: string,
  ): MateriaPensum[] {
    let results = this.pensum;

    if (programaNombre) {
      const normalized = normalizeText(programaNombre);
      results = results.filter((m) =>
        normalizeText(m.programa).includes(normalized),
      );
    }

    if (semestre) {
      results = results.filter((m) => m.semestre === semestre);
    }

    if (materiaNombre) {
      const normalized = normalizeText(materiaNombre);
      results = results.filter((m) =>
        normalizeText(m.materia).includes(normalized),
      );
    }

    if (jornada) {
      const normalized = normalizeText(jornada);
      results = results.filter((m) =>
        normalizeText(m.jornada).includes(normalized),
      );
    }

    // Eliminar duplicados basándose en programa + semestre + materia + jornada
    const seen = new Set<string>();
    results = results.filter((m) => {
      const key = `${m.programa}|${m.semestre}|${m.materia}|${m.jornada}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Si hay múltiples jornadas, preferir la primera (usualmente diurna/tarde)
    if (!jornada && results.length > 0) {
      const primeraJornada = results[0].jornada;
      results = results.filter((m) => m.jornada === primeraJornada);
    }

    return results;
  }

  /**
   * Obtiene el pensum completo de un programa, organizado por semestres
   */
  getPensumCompleto(programaNombre: string): {
    programa: string;
    jornada: string;
    pensum: string;
    creditosTotales: string;
    semestres: Record<string, MateriaPensum[]>;
  } | null {
    const materias = this.getMaterias(programaNombre);

    if (materias.length === 0) return null;

    const semestres: Record<string, MateriaPensum[]> = {};

    for (const materia of materias) {
      const sem = materia.semestre;
      if (!semestres[sem]) {
        semestres[sem] = [];
      }
      semestres[sem].push(materia);
    }

    return {
      programa: materias[0].programa,
      jornada: materias[0].jornada,
      pensum: materias[0].pensum,
      creditosTotales: materias[0].numero_de_creditos_pensum,
      semestres,
    };
  }

  /**
   * Busca programas que contengan una palabra clave
   */
  buscarProgramaPorKeyword(keyword: string): string | null {
    const normalized = normalizeText(keyword);

    // Mapeo de keywords comunes a nombres de programas (ordenados por especificidad)
    // Las frases más específicas van primero para evitar coincidencias parciales
    // NOTA: Usar \s (un backslash) porque new RegExp() interpreta el string literalmente
    const keywordMap: [string, string][] = [
      // Ingenierías - frases completas primero
      ["ingenieria\\s+industrial", "INGENIERIA INDUSTRIAL"],
      ["ingenieria\\s+de\\s+sistemas", "INGENIERIA DE SISTEMAS"],
      ["ingenieria\\s+mecanica", "INGENIERIA MECANICA"],
      ["ingenieria\\s+ambiental", "INGENIERIA AMBIENTAL"],
      ["ingenieria\\s+de\\s+alimentos", "INGENIERIA DE ALIMENTOS"],
      ["ingenieria\\s+agronomica", "INGENIERIA AGRONOMICA"],
      // Combinaciones parciales (variantes con "ing" abreviado o sin "de")
      ["ingenieria\\s+industri", "INGENIERIA INDUSTRIAL"], // Para "ingenieria industria"
      ["ingenieria\\s+sistem", "INGENIERIA DE SISTEMAS"],
      ["ing\\.?\\s+industri", "INGENIERIA INDUSTRIAL"],
      ["ing\\.?\\s+sistem", "INGENIERIA DE SISTEMAS"],
      ["ing\\.?\\s+mecanic", "INGENIERIA MECANICA"],
      ["ing\\.?\\s+ambient", "INGENIERIA AMBIENTAL"],
      ["ing\\.?\\s+alimento", "INGENIERIA DE ALIMENTOS"],
      ["ing\\.?\\s+agronom", "INGENIERIA AGRONOMICA"],
      // Solo keyword (palabras sueltas) - industrial/industria va antes
      ["industri(a|al)", "INGENIERIA INDUSTRIAL"],
      ["\\bsistemas\\b", "INGENIERIA DE SISTEMAS"],
      ["\\bmecanica\\b", "INGENIERIA MECANICA"],
      ["\\bambiental\\b", "INGENIERIA AMBIENTAL"],
      ["\\balimentos\\b", "INGENIERIA DE ALIMENTOS"],
      ["agronomica|agronomia", "INGENIERIA AGRONOMICA"],
      // Otros programas
      ["veterinaria|zootecnia", "MEDICINA VETERINARIA Y ZOOTECNIA"],
      ["enfermeria", "ENFERMERIA"],
      ["\\bderecho\\b", "DERECHO"],
      [
        "finanzas|negocios\\s+internacionales",
        "ADMINISTRACION EN FINANZAS Y NEGOCIOS INTERNACIONALES",
      ],
      [
        "administracion.*salud|salud.*administracion",
        "ADMINISTRACION EN SALUD",
      ],
      ["acuicultura", "ACUICULTURA"],
      ["\\bbiologia\\b", "BIOLOGIA"],
      ["\\bquimica\\b", "QUIMICA"],
      ["\\bfisica\\b", "FISICA"],
      ["estadistica", "ESTADISTICA"],
      ["geografia", "GEOGRAFIA"],
      ["matematicas", "MATEMATICAS"],
      ["bacteriolog", "BACTERIOLOGIA"],
      ["regencia|farmacia", "TECNOLOGIA EN REGENCIA DE FARMACIA"],
      ["desarrollo.*software|software", "TECNOLOGIA EN DESARROLLO DE SOFTWARE"],
      ["programacion.*web", "TECNICO PROFESIONAL EN PROGRAMACION WEB"],
      // Licenciaturas
      [
        "lic.*ciencias.*naturales|ciencias.*naturales.*educ",
        "LICENCIATURA EN CIENCIAS NATURALES Y EDUCACION AMBIENTAL",
      ],
      [
        "lic.*ciencias.*sociales|ciencias.*sociales",
        "LICENCIATURA EN CIENCIAS SOCIALES",
      ],
      [
        "lic.*artistica|educacion.*artistica",
        "LICENCIATURA EN EDUCACION ARTISTICA",
      ],
      [
        "lic.*infantil|educacion.*infantil",
        "LICENCIATURA EN EDUCACION INFANTIL",
      ],
      [
        "lic.*fisica.*deporte|educacion.*fisica",
        "LICENCIATURA EN EDUCACION FISICA RECREACION Y DEPORTE",
      ],
      [
        "lic.*informatica|informatica.*medios",
        "LICENCIATURA EN INFORMATICA Y MEDIOS AUDIOVISUALES",
      ],
      [
        "lic.*ingles|lenguas.*extranjeras",
        "LICENCIATURA EN LENGUAS EXTRANJERAS CON ENFASIS EN INGLES",
      ],
      [
        "lic.*literatura|lengua.*castellana",
        "LICENCIATURA EN LITERATURA Y LENGUA CASTELLANA",
      ],
    ];

    // Buscar usando expresiones regulares para mayor flexibilidad
    for (const [pattern, prog] of keywordMap) {
      const regex = new RegExp(pattern, "i");
      if (regex.test(normalized)) {
        return prog;
      }
    }

    // Buscar directamente en los programas del pensum
    const programasUnicos = [...new Set(this.pensum.map((m) => m.programa))];
    const match = programasUnicos.find((p) =>
      normalizeText(p).includes(normalized),
    );

    return match || null;
  }

  /**
   * Obtiene estadísticas generales (solo pregrado)
   */
  getEstadisticas() {
    const materiasUnicas = new Set(this.pensum.map((m) => m.codigo_materia))
      .size;
    // Filtrar solo programas de pregrado
    const programasPregrado = this.programas.filter(
      (p) => !this.esPostgrado(p.prog_nombre),
    );
    const programasConPensum = new Set(
      this.pensum
        .filter((m) => !this.esPostgrado(m.programa))
        .map((m) => m.programa),
    ).size;

    return {
      facultades: this.facultades.length,
      programas: programasPregrado.length,
      programasConPensum,
      materiasUnicas,
      registrosPensum: this.pensum.length,
    };
  }

  /**
   * Lista todos los programas únicos de pregrado que tienen pensum
   */
  getProgramasConPensum(): string[] {
    return [...new Set(this.pensum.map((m) => m.programa))]
      .filter((p) => !this.esPostgrado(p))
      .sort();
  }
}

// Singleton
export const localDataService = new LocalDataService();
