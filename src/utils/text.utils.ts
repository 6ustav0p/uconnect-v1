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
 * Normalización más agresiva para texto extraído con OCR (AWS Textract)
 * Remueve acentos, símbolos y normaliza espacios para búsqueda tolerante a errores
 */
export function normalizeForOCR(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
    .replace(/[^a-z0-9\s]/g, " ") // Reemplazar símbolos por espacio
    .replace(/\s+/g, " ") // Normalizar espacios múltiples
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
 * Extrae fragmentos relevantes de un texto largo basándose en palabras clave de la consulta
 * Usa búsqueda semántica simple para encontrar las secciones más relevantes
 *
 * @param text Texto completo (ej: rawText del PEP)
 * @param query Pregunta del usuario
 * @param maxLength Máximo de caracteres a retornar
 * @returns Fragmentos relevantes concatenados
 */
export function extractRelevantChunks(
  text: string,
  query: string,
  maxLength: number = 4000,
): { text: string; foundKeywords: string[]; chunksUsed: number } {
  if (text.length <= maxLength) {
    return { text, foundKeywords: [], chunksUsed: 1 };
  }

  // Extraer palabras clave de la consulta
  const queryKeywords = extractKeywords(query);

  // Agregar variantes y palabras relacionadas comunes
  const expandedKeywords = new Set<string>();
  queryKeywords.forEach((kw) => {
    expandedKeywords.add(kw);
    // Agregar variantes según el término
    if (kw.includes("objetivo")) {
      expandedKeywords.add("objetivos");
      expandedKeywords.add("meta");
      expandedKeywords.add("metas");
      expandedKeywords.add("proposito");
      expandedKeywords.add("fin");
    }
    if (kw.includes("competencia")) {
      expandedKeywords.add("competencias");
      expandedKeywords.add("habilidad");
      expandedKeywords.add("habilidades");
      expandedKeywords.add("capacidad");
    }
    if (kw.includes("perfil")) {
      expandedKeywords.add("perfil");
      expandedKeywords.add("profesional");
      expandedKeywords.add("ocupacional");
      expandedKeywords.add("egresado");
    }
    if (kw.includes("mision") || kw.includes("vision")) {
      expandedKeywords.add("mision");
      expandedKeywords.add("vision");
      expandedKeywords.add("proposito");
    }
    if (kw.includes("campo")) {
      expandedKeywords.add("campos");
      expandedKeywords.add("ocupacional");
      expandedKeywords.add("laboral");
      expandedKeywords.add("trabajo");
    }
    if (kw.includes("linea") || kw.includes("investigacion")) {
      expandedKeywords.add("lineas");
      expandedKeywords.add("investigacion");
      expandedKeywords.add("investigativas");
      expandedKeywords.add("investigar");
    }
    if (kw.includes("principio")) {
      expandedKeywords.add("principios");
      expandedKeywords.add("valores");
      expandedKeywords.add("valor");
    }
    if (kw.includes("valor") || kw.includes("valores")) {
      expandedKeywords.add("valores");
      expandedKeywords.add("principios");
      expandedKeywords.add("principio");
    }
  });

  const keywords = Array.from(expandedKeywords);

  // Dividir texto en secciones
  let paragraphs: string[] = [];
  // Opción 1: Intentar dividir por secciones numeradas o títulos en mayúsculas
  const sectionPattern =
    /(?:^|\n)(?:[\d\.]+\s+[A-ZÑÁÉÍÓÚ][^\n]{5,}|[A-ZÑÁÉÍÓÚ\s]{10,})(?=\n)/gm;
  const matches = Array.from(text.matchAll(sectionPattern));

  if (matches.length > 2) {
    // Dividir por posiciones de títulos y capturar el contenido DESPUÉS del título
    for (let i = 0; i < matches.length; i++) {
      const titleStart = matches[i].index || 0;
      const contentStart = titleStart + matches[i][0].length; // Empezar DESPUÉS del título
      const end =
        i < matches.length - 1
          ? matches[i + 1].index || text.length
          : text.length;

      // Capturar título + contenido
      const section = text.slice(titleStart, end).trim();
      if (section.length > 150) {
        // Asegurar que hay contenido sustancial
        paragraphs.push(section);
      }
    }
  }

  // Opción 2: Dividir por párrafos dobles si no hay suficientes secciones
  if (paragraphs.length < 3) {
    const doubleNewlineParagraphs = text
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 50);

    if (doubleNewlineParagraphs.length > 3) {
      paragraphs = doubleNewlineParagraphs;
    }
  }

  // Opción 3: Si aún no hay párrafos, dividir en chunks de tamaño fijo con superposición
  if (paragraphs.length < 3) {
    const chunkSize = 800; // Tamaño del chunk
    const overlap = 200; // Superposición entre chunks

    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      const chunk = text.slice(i, i + chunkSize).trim();
      if (chunk.length > 100) {
        paragraphs.push(chunk);
      }
    }
  }

  // Calcular relevancia de cada párrafo
  interface ScoredChunk {
    text: string;
    score: number;
    matchedKeywords: string[];
  }

  const scoredChunks: ScoredChunk[] = paragraphs.map((paragraph) => {
    const normalizedParagraph = normalizeForOCR(paragraph); // Usar normalización tolerante a OCR
    let score = 0;
    const matchedKeywords: string[] = [];

    keywords.forEach((keyword) => {
      const normalizedKeyword = normalizeForOCR(keyword);
      // Búsqueda más flexible: substring match con regex tolerante a espacios
      const flexiblePattern = normalizedKeyword.replace(/\s+/g, "\\s+");
      const regex = new RegExp(flexiblePattern, "gi");
      const matches = normalizedParagraph.match(regex);

      if (matches && matches.length > 0) {
        // Más peso si la palabra aparece múltiples veces
        score += matches.length * 10;
        matchedKeywords.push(keyword);
      }
    });

    // 🔥 BONUS EXTRA-MASIVO para keywords que aparecen JUNTAS (proximidad)
    // "marco legal" junto es mucho más relevante que "marco" + "legal" separados
    if (keywords.length >= 2) {
      // Buscar pares de keywords en proximidad (hasta 50 chars de distancia)
      for (let i = 0; i < keywords.length - 1; i++) {
        for (let j = i + 1; j < keywords.length; j++) {
          const kw1 = normalizeForOCR(keywords[i]);
          const kw2 = normalizeForOCR(keywords[j]);

          // Crear regex que busque kw1 y kw2 con hasta 50 chars entre ellas
          const proximityPattern = new RegExp(
            `${kw1}.{0,50}${kw2}|${kw2}.{0,50}${kw1}`,
            "gi",
          );
          const proximityMatches = normalizedParagraph.match(proximityPattern);

          if (proximityMatches && proximityMatches.length > 0) {
            score += 50000; // BONUS GIGANTESCO para keywords en proximidad
          }
        }
      }
    }

    // 🔥 BONUS MASIVO si el chunk tiene TODAS las keywords del query
    // Esto es lo más importante - indica que la sección es directamente relevante
    if (matchedKeywords.length >= Math.min(3, keywords.length)) {
      score += 10000; // Bonus ENORME para secciones con todas las keywords
    } else if (matchedKeywords.length >= keywords.length * 0.6) {
      score += 1000; // Bonus grande para mayoría de keywords
    }

    // Bonus por longitud razonable (párrafos muy largos suelen ser más informativos)
    if (paragraph.length > 200 && paragraph.length < 2000) {
      score += 5;
    }

    // BONUS IMPORTANTE: Paragraphs con contenido sustancial (más de 300 chars)
    // Esto ayuda a priorizar secciones con contenido real sobre menciones en índices
    if (paragraph.length > 300) {
      score += 15; // Bonus alto para contenido sustancial
    }

    // PENALIZACIÓN para párrafos que parecen ser índices (muchos números, pocas palabras)
    const wordCount = paragraph.split(/\s+/).length;
    const numberCount = (paragraph.match(/\d+/g) || []).length;
    if (numberCount > wordCount * 0.3 && paragraph.length < 500) {
      score -= 20; // Penalizar fuertemente índices
    }

    return { text: paragraph, score, matchedKeywords };
  });

  // Ordenar por relevancia
  scoredChunks.sort((a, b) => b.score - a.score);

  // Tomar los chunks más relevantes hasta llenar maxLength
  const selectedChunks: ScoredChunk[] = [];
  let currentLength = 0;
  const allMatchedKeywords = new Set<string>();

  for (const chunk of scoredChunks) {
    if (chunk.score === 0) break; // No incluir chunks sin relevancia

    const chunkLength = chunk.text.length + 4; // +4 por "\n\n\n"

    // Si es el PRIMER chunk y tiene buen score, inclúyelo AUNQUE exceda el límite
    if (currentLength === 0 && chunk.score > 10) {
      // Truncar si es necesario
      const truncatedText =
        chunk.text.length > maxLength
          ? chunk.text.slice(0, maxLength - 3) + "..."
          : chunk.text;

      selectedChunks.push({
        text: truncatedText,
        score: chunk.score,
        matchedKeywords: chunk.matchedKeywords,
      });
      currentLength += truncatedText.length;
      chunk.matchedKeywords.forEach((kw) => allMatchedKeywords.add(kw));
    } else if (currentLength + chunkLength <= maxLength) {
      selectedChunks.push(chunk);
      currentLength += chunkLength;
      chunk.matchedKeywords.forEach((kw) => allMatchedKeywords.add(kw));
    } else {
      break;
    }
  }

  // Si no encontramos chunks relevantes, usar el inicio del texto
  if (selectedChunks.length === 0) {
    return {
      text: text.slice(0, maxLength - 3) + "...",
      foundKeywords: [],
      chunksUsed: 0,
    };
  }

  // Re-ordenar chunks en el orden original del texto para mantener coherencia
  const textPositions = selectedChunks.map((chunk) => ({
    chunk,
    position: text.indexOf(chunk.text),
  }));
  textPositions.sort((a, b) => a.position - b.position);

  const result = textPositions.map((tp) => tp.chunk.text).join("\n\n---\n\n");

  return {
    text: result,
    foundKeywords: Array.from(allMatchedKeywords),
    chunksUsed: selectedChunks.length,
  };
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
