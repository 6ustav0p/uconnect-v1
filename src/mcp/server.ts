#!/usr/bin/env node

/**
 * MCP Server para datos académicos de la Universidad de Córdoba
 * Proporciona acceso a facultades, programas y pensum desde archivos JSON locales
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";

// ============================================
// CARGAR DATOS JSON
// ============================================

const dataDir = path.join(__dirname, "..");
const facultades = JSON.parse(
  fs.readFileSync(path.join(dataDir, "facultades_api.json"), "utf-8"),
);
const programas = JSON.parse(
  fs.readFileSync(path.join(dataDir, "programas_academicos_api.json"), "utf-8"),
);
const pensum = JSON.parse(
  fs.readFileSync(path.join(dataDir, "pensum_programa.json"), "utf-8"),
);

// ============================================
// FUNCIONES DE BÚSQUEDA
// ============================================

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Verifica si un programa es de postgrado (maestría, doctorado, especialización)
 */
function esPostgrado(nombrePrograma: string): boolean {
  const normalized = normalizeText(nombrePrograma);
  return /maestr[ií]a|doctorado|especializaci[oó]n/i.test(normalized);
}

function buscarFacultades(nombre?: string) {
  if (!nombre) return facultades;
  const normalized = normalizeText(nombre);
  return facultades.filter((f: any) =>
    normalizeText(f.unid_nombre).includes(normalized),
  );
}

function buscarProgramas(nombre?: string, facultadNombre?: string) {
  // Filtrar solo programas de pregrado (excluir maestrías, doctorados, especializaciones)
  let results = programas.filter((p: any) => !esPostgrado(p.prog_nombre));

  if (nombre) {
    const normalized = normalizeText(nombre);
    results = results.filter((p: any) =>
      normalizeText(p.prog_nombre).includes(normalized),
    );
  }

  if (facultadNombre) {
    const normalized = normalizeText(facultadNombre);
    results = results.filter((p: any) =>
      normalizeText(p.facultad_nombre).includes(normalized),
    );
  }

  return results;
}

function buscarMaterias(
  programaNombre?: string,
  semestre?: string,
  materiaNombre?: string,
  jornada?: string,
) {
  let results = [...pensum];

  if (programaNombre) {
    const normalized = normalizeText(programaNombre);
    results = results.filter((m: any) =>
      normalizeText(m.programa).includes(normalized),
    );
  }

  if (semestre) {
    results = results.filter((m: any) => m.semestre === semestre);
  }

  if (materiaNombre) {
    const normalized = normalizeText(materiaNombre);
    results = results.filter((m: any) =>
      normalizeText(m.materia).includes(normalized),
    );
  }

  if (jornada) {
    const normalized = normalizeText(jornada);
    results = results.filter((m: any) =>
      normalizeText(m.jornada).includes(normalized),
    );
  }

  return results;
}

function obtenerPensumCompleto(programaNombre: string) {
  const materias = buscarMaterias(programaNombre);

  if (materias.length === 0) return null;

  const semestres: Record<string, any[]> = {};

  for (const materia of materias) {
    const sem = materia.semestre;
    if (!semestres[sem]) {
      semestres[sem] = [];
    }
    semestres[sem].push(materia);
  }

  // Ordenar semestres
  const semestresOrdenados: Record<string, any> = {};
  Object.keys(semestres)
    .sort((a, b) => parseInt(a) - parseInt(b))
    .forEach((key) => {
      semestresOrdenados[`Semestre ${key}`] = {
        materias: semestres[key].map((m: any) => ({
          nombre: m.materia,
          creditos: m.creditos,
          codigo: m.codigo_materia,
        })),
        totalCreditos: semestres[key][0]?.total_creditos_semestre || "0",
      };
    });

  return {
    programa: materias[0].programa,
    jornada: materias[0].jornada,
    versionPensum: materias[0].pensum,
    creditosTotales: materias[0].numero_de_creditos_pensum,
    semestres: semestresOrdenados,
  };
}

// ============================================
// DEFINICIÓN DE HERRAMIENTAS
// ============================================

const TOOLS = [
  {
    name: "listar_facultades",
    description:
      "Lista todas las facultades de la Universidad de Córdoba. Opcionalmente filtra por nombre.",
    inputSchema: {
      type: "object" as const,
      properties: {
        nombre: {
          type: "string",
          description: "Nombre parcial de la facultad para filtrar (opcional)",
        },
      },
    },
  },
  {
    name: "buscar_programas",
    description:
      "Busca programas académicos (carreras) de la Universidad de Córdoba.",
    inputSchema: {
      type: "object" as const,
      properties: {
        nombre: {
          type: "string",
          description:
            "Nombre del programa a buscar (ej: 'sistemas', 'medicina')",
        },
        facultad: {
          type: "string",
          description: "Nombre de la facultad para filtrar",
        },
      },
    },
  },
  {
    name: "buscar_materias",
    description:
      "Busca materias específicas en el pensum. Usa para buscar información sobre una materia en particular.",
    inputSchema: {
      type: "object" as const,
      properties: {
        programa: {
          type: "string",
          description: "Nombre del programa académico",
        },
        semestre: {
          type: "string",
          description: "Número de semestre (1, 2, 3, etc.)",
        },
        materia: {
          type: "string",
          description: "Nombre de la materia a buscar",
        },
        jornada: {
          type: "string",
          description: "Jornada: DIURNA, NOCTURNA, SABATINA",
        },
      },
    },
  },
  {
    name: "obtener_pensum_programa",
    description:
      "Obtiene el pensum COMPLETO de un programa académico, organizado por semestres con todas las materias.",
    inputSchema: {
      type: "object" as const,
      properties: {
        programa: {
          type: "string",
          description: "Nombre del programa (ej: 'INGENIERIA DE SISTEMAS')",
        },
      },
      required: ["programa"],
    },
  },
  {
    name: "info_universidad",
    description:
      "Proporciona información general sobre la Universidad de Córdoba y estadísticas de los datos disponibles.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];

// ============================================
// SERVIDOR MCP
// ============================================

const server = new Server(
  {
    name: "unicordoba-academic-data",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Handler para listar herramientas
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handler para ejecutar herramientas
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "listar_facultades": {
        const results = buscarFacultades(args?.nombre as string | undefined);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  total: results.length,
                  facultades: results.map((f: any) => ({
                    id: f.unid_id,
                    nombre: f.unid_nombre,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "buscar_programas": {
        const results = buscarProgramas(
          args?.nombre as string | undefined,
          args?.facultad as string | undefined,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  total: results.length,
                  programas: results.map((p: any) => ({
                    id: p.prog_id,
                    nombre: p.prog_nombre,
                    facultad: p.facultad_nombre,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "buscar_materias": {
        const results = buscarMaterias(
          args?.programa as string | undefined,
          args?.semestre as string | undefined,
          args?.materia as string | undefined,
          args?.jornada as string | undefined,
        );
        const limited = results.slice(0, 50);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  total: results.length,
                  mostrando: limited.length,
                  materias: limited.map((m: any) => ({
                    materia: m.materia,
                    codigo: m.codigo_materia,
                    creditos: m.creditos,
                    semestre: m.semestre,
                    programa: m.programa,
                    jornada: m.jornada,
                    pensum: m.pensum,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "obtener_pensum_programa": {
        const programa = args?.programa as string;
        if (!programa) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error: "Se requiere el nombre del programa",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        const result = obtenerPensumCompleto(programa);

        if (!result) {
          // Sugerir programas similares
          const sugerencias = buscarProgramas(programa.split(" ")[0]);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error: "Programa no encontrado",
                    busqueda: programa,
                    sugerencias: sugerencias
                      .slice(0, 5)
                      .map((p: any) => p.prog_nombre),
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "info_universidad": {
        const totalMaterias = new Set(pensum.map((m: any) => m.codigo_materia))
          .size;
        const programasUnicos = new Set(pensum.map((m: any) => m.programa))
          .size;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  universidad: "Universidad de Córdoba",
                  ubicacion: "Montería, Córdoba, Colombia",
                  estadisticas: {
                    facultades: facultades.length,
                    programasAcademicos: programas.length,
                    programasConPensum: programasUnicos,
                    materiasUnicas: totalMaterias,
                  },
                  facultadesDisponibles: facultades.map(
                    (f: any) => f.unid_nombre,
                  ),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Herramienta desconocida: ${name}`,
              }),
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Error ejecutando herramienta",
            mensaje: (error as Error).message,
          }),
        },
      ],
      isError: true,
    };
  }
});

// ============================================
// INICIAR SERVIDOR
// ============================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "✅ MCP Server de datos académicos de Universidad de Córdoba iniciado",
  );
}

main().catch(console.error);
