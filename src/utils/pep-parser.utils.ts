/**
 * Utilidades para parsear contenido específico del PEP (principios, objetivos, etc.)
 */

import { normalizeForOCR } from "./text.utils";

interface PrincipioValor {
  nombre: string;
  descripcion: string;
}

/**
 * Extrae principios y valores del texto del PEP
 * Busca patrones como:
 * "Autonomía: Descripción..."
 * "Integralidad. Descripción..."
 */
export function extractPrincipiosValores(text: string): PrincipioValor[] {
  const normalized = text;
  const principios: PrincipioValor[] = [];

  // Buscar sección exacta: "Los principios y valores que se acogen para el Programa"
  // Esta frase es del contenido REAL, no del índice
  const inicioMatch = normalized.match(
    /los\s+principios\s+y\s+valores\s+que\s+se\s+acogen\s+para\s+el\s+programa[^:]*:\s*/i,
  );
  if (!inicioMatch) {
    return principios;
  }

  const startPos = inicioMatch.index! + inicioMatch[0].length;

  // Buscar fin de la sección (próximo título numerado como "12." o "13.")
  const finMatch = normalized
    .substring(startPos)
    .match(/\n\d+\.\s+[A-ZÁÉÍÓÚÑ]/);
  const endPos = finMatch ? startPos + finMatch.index! : startPos + 8000; // máximo 8000 chars

  const seccionPrincipios = normalized.substring(startPos, endPos);

  // Patrones más estrictos: palabra(s) que empiezan mayúscula + : o .
  // Debe tener al menos 4 caracteres y máximo 40
  const principioPattern =
    /([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:y\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)[:\.]\s+([^\n]+(?:\n(?![A-ZÁÉÍÓÚÑ][a-záéíóúñ]+[:\.]).*?)*?)(?=\n[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+[:.]|\n\d+\.|\n\n\d+|$)/g;

  let match;
  const maxPrincipios = 15;
  let count = 0;

  while (
    (match = principioPattern.exec(seccionPrincipios)) !== null &&
    count < maxPrincipios
  ) {
    const nombre = match[1].trim();
    let descripcion = match[2].trim();

    // Limpiar la descripción
    descripcion = descripcion
      .replace(/\d+\s*$/gm, "") // Remover números sueltos al final de líneas
      .replace(/\s+/g, " ")
      .trim();

    // Validaciones
    const nombreLength = nombre.length;
    const esNombreValido = nombreLength >= 4 && nombreLength <= 45;
    const tieneDescripcion = descripcion.length > 20;
    const noEsNumero = !/^\d+/.test(descripcion);

    // Excluir falsos positivos comunes
    const noEsFalsoPositivo = ![
      "Laboratorio",
      "Facultad",
      "Departamento",
      "Coordinador",
    ].includes(nombre);

    if (esNombreValido && tieneDescripcion && noEsNumero && noEsFalsoPositivo) {
      // Limitar descripción a primeras 500 chars para no saturar
      if (descripcion.length > 500) {
        descripcion = descripcion.substring(0, 497) + "...";
      }

      principios.push({ nombre, descripcion });
      count++;
    }
  }

  return principios;
}

/**
 * Formatea principios para el LLM en formato de lista
 */
export function formatPrincipiosForLLM(principios: PrincipioValor[]): string {
  if (principios.length === 0) {
    return "";
  }

  let resultado = "PRINCIPIOS Y VALORES DEL PROGRAMA (extraídos del PEP):\n\n";

  principios.forEach((p, index) => {
    resultado += `${index + 1}. **${p.nombre}**: ${p.descripcion}\n\n`;
  });

  return resultado;
}

/**
 * Parser inteligente de queries sobre principios/valores
 */
export function shouldParsePrincipios(query: string): boolean {
  const normalized = normalizeForOCR(query.toLowerCase());
  return (
    normalized.includes("principio") ||
    normalized.includes("valor") ||
    (normalized.includes("cuales") && normalized.includes("rigen"))
  );
}
