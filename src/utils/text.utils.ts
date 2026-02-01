/**
 * Normaliza texto para búsquedas (sin acentos, minúsculas)
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Compara dos strings ignorando acentos y mayúsculas
 */
export function fuzzyMatch(source: string, target: string): boolean {
  const normalizedSource = normalizeText(source);
  const normalizedTarget = normalizeText(target);
  return (
    normalizedSource.includes(normalizedTarget) ||
    normalizedTarget.includes(normalizedSource)
  );
}

/**
 * Calcula similitud entre dos strings (0-1)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeText(str1);
  const s2 = normalizeText(str2);

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  // Levenshtein distance
  const matrix: number[][] = [];

  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  const maxLength = Math.max(s1.length, s2.length);
  return 1 - matrix[s1.length][s2.length] / maxLength;
}

/**
 * Extrae palabras clave relevantes de un texto
 */
export function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "el",
    "la",
    "los",
    "las",
    "un",
    "una",
    "unos",
    "unas",
    "de",
    "del",
    "al",
    "a",
    "en",
    "con",
    "por",
    "para",
    "que",
    "cual",
    "cuales",
    "como",
    "donde",
    "cuando",
    "es",
    "son",
    "tiene",
    "tienen",
    "hay",
    "puede",
    "pueden",
    "me",
    "te",
    "se",
    "nos",
    "les",
    "lo",
    "le",
    "y",
    "o",
    "pero",
    "si",
    "no",
    "mas",
    "menos",
    "este",
    "esta",
    "estos",
    "estas",
    "ese",
    "esa",
    "mi",
    "tu",
    "su",
    "mis",
    "tus",
    "sus",
    "quiero",
    "necesito",
    "busco",
    "quisiera",
    "podria",
    "puedo",
    "saber",
    "conocer",
    "informacion",
    "sobre",
    "acerca",
  ]);

  const words = normalizeText(text)
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  return [...new Set(words)];
}

/**
 * Trunca texto para optimizar tokens
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Formatea datos para contexto de IA (reduce tokens)
 */
export function formatForContext<T>(
  data: T[],
  maxItems: number,
  keyFields: (keyof T)[],
): string {
  const truncated = data.slice(0, maxItems);

  return truncated
    .map((item) => {
      const parts = keyFields.map((key) => `${String(key)}: ${item[key]}`);
      return parts.join(" | ");
    })
    .join("\n");
}

/**
 * Genera hash simple para claves de caché
 */
export function generateCacheKey(
  prefix: string,
  params: Record<string, unknown>,
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return `${prefix}:${Buffer.from(sortedParams).toString("base64").slice(0, 32)}`;
}

/**
 * Retry con backoff exponencial
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Agrupa array por una propiedad
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce(
    (groups, item) => {
      const groupKey = String(item[key]);
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
      return groups;
    },
    {} as Record<string, T[]>,
  );
}
