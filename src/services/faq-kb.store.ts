import { config } from "../config";
import { extractKeywords, logger, normalizeText } from "../utils";
import { gptVectorStoreService } from "./gpt-vector-store.service";

export type FaqTier = "featured" | "faq" | "archive";

export interface FaqKbEntry {
  id: string;
  tier: FaqTier;
  category: string;
  questions: string[];
  answer: string;
  isActive?: boolean;
  source?: {
    title?: string;
    url?: string;
  };
}

export interface FaqKbEntryIndexed extends FaqKbEntry {
  questionsNormalized: string[];
  keywords: string[];
}

export interface FaqKbSnapshot {
  file: {
    vectorStoreFileId: string;
    createdAt: number;
  };
  loadedAt: Date;
  entries: FaqKbEntryIndexed[];
  byId: Map<string, FaqKbEntryIndexed>;
  byTier: Record<FaqTier, FaqKbEntryIndexed[]>;
  exactIndex: Map<string, string>; // normalized question -> faq id
  keywordIndex: Map<string, Set<string>>; // keyword -> faq ids
}

const FAQ_KB_KIND = "faq_kb";
const CACHE_TTL_MS = 5 * 60 * 1000;

function isFaqTier(value: unknown): value is FaqTier {
  return value === "featured" || value === "faq" || value === "archive";
}

function normalizeQuestions(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map((q) => (typeof q === "string" ? q.trim() : ""))
      .filter(Boolean);
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1);
  }

  return trimmed;
}

export function parseFaqKbText(text: string): FaqKbEntry[] {
  const jsonText = extractJsonObject(text);
  let parsed: any;

  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(
      `FAQ KB inválido: no se pudo parsear JSON (${(error as Error).message})`,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("FAQ KB inválido: se esperaba un objeto JSON");
  }

  // Shape A: { version, entries: [...] }
  if (Array.isArray((parsed as any).entries)) {
    const entries: any[] = (parsed as any).entries;
    const flattened: FaqKbEntry[] = [];

    for (const raw of entries) {
      const id = typeof raw?.id === "string" ? raw.id.trim() : "";
      const tier = raw?.tier;
      const category =
        typeof raw?.category === "string" ? raw.category.trim() : "";
      const questions = normalizeQuestions(raw?.questions);
      const answer = typeof raw?.answer === "string" ? raw.answer.trim() : "";
      const isActive = typeof raw?.isActive === "boolean" ? raw.isActive : true;

      if (
        !id ||
        !isFaqTier(tier) ||
        !answer ||
        !category ||
        questions.length === 0
      ) {
        continue;
      }

      const source = raw?.source;
      const sourceObj =
        source && typeof source === "object"
          ? {
              title:
                typeof source.title === "string" ? source.title : undefined,
              url: typeof source.url === "string" ? source.url : undefined,
            }
          : undefined;

      flattened.push({
        id,
        tier,
        category,
        questions,
        answer,
        isActive,
        source: sourceObj,
      });
    }

    return flattened;
  }

  // Shape B (legacy): { featured: [{id, question, answer, category}], faq: [...], archive: [...] }
  const tiers: Array<[FaqTier, any[]]> = [
    [
      "featured",
      Array.isArray((parsed as any).featured) ? (parsed as any).featured : [],
    ],
    ["faq", Array.isArray((parsed as any).faq) ? (parsed as any).faq : []],
    [
      "archive",
      Array.isArray((parsed as any).archive) ? (parsed as any).archive : [],
    ],
  ];

  const flattened: FaqKbEntry[] = [];

  for (const [tier, list] of tiers) {
    for (const raw of list) {
      const id = typeof raw?.id === "string" ? raw.id.trim() : "";
      const category =
        typeof raw?.category === "string" ? raw.category.trim() : "";
      const question =
        typeof raw?.question === "string" ? raw.question.trim() : "";
      const answer = typeof raw?.answer === "string" ? raw.answer.trim() : "";
      const isActive = typeof raw?.isActive === "boolean" ? raw.isActive : true;

      if (!id || !category || !question || !answer) continue;

      flattened.push({
        id,
        tier,
        category,
        questions: [question],
        answer,
        isActive,
      });
    }
  }

  if (flattened.length === 0) {
    throw new Error(
      "FAQ KB inválido: no se encontró 'entries' ni arrays featured/faq/archive",
    );
  }

  return flattened;
}

function buildSnapshot(
  file: { vectorStoreFileId: string; createdAt: number },
  entries: FaqKbEntry[],
): FaqKbSnapshot {
  const indexed: FaqKbEntryIndexed[] = [];
  const byId = new Map<string, FaqKbEntryIndexed>();
  const byTier: Record<FaqTier, FaqKbEntryIndexed[]> = {
    featured: [],
    faq: [],
    archive: [],
  };
  const exactIndex = new Map<string, string>();
  const keywordIndex = new Map<string, Set<string>>();

  for (const entry of entries) {
    if (entry.isActive === false) continue;

    const questions = (entry.questions || [])
      .map((q) => q.trim())
      .filter(Boolean);
    if (questions.length === 0) continue;

    const questionsNormalized = questions.map((q) => normalizeText(q));

    const keywords = [
      ...new Set(
        extractKeywords(questions.join(" "))
          .map((k) => normalizeText(k))
          .filter(Boolean),
      ),
    ];

    const normalizedEntry: FaqKbEntryIndexed = {
      ...entry,
      questions,
      questionsNormalized,
      keywords,
    };

    indexed.push(normalizedEntry);
    byId.set(entry.id, normalizedEntry);
    byTier[entry.tier].push(normalizedEntry);

    for (const qn of questionsNormalized) {
      if (!qn) continue;
      if (!exactIndex.has(qn)) {
        exactIndex.set(qn, entry.id);
      }
    }

    for (const kw of keywords) {
      if (!keywordIndex.has(kw)) keywordIndex.set(kw, new Set());
      keywordIndex.get(kw)!.add(entry.id);
    }
  }

  return {
    file,
    loadedAt: new Date(),
    entries: indexed,
    byId,
    byTier,
    exactIndex,
    keywordIndex,
  };
}

export class FaqKbStore {
  private cached: { snapshot: FaqKbSnapshot; expiresAt: number } | null = null;
  private inFlight: Promise<FaqKbSnapshot> | null = null;

  private isEnabled(): boolean {
    return (
      Boolean(config.openai.apiKey) && Boolean(config.openai.vectorStoreId)
    );
  }

  private async selectKbVectorStoreFileId(): Promise<{
    vectorStoreFileId: string;
    createdAt: number;
  } | null> {
    const override = process.env.FAQ_KB_VECTOR_STORE_FILE_ID;
    if (override && typeof override === "string" && override.trim()) {
      return { vectorStoreFileId: override.trim(), createdAt: 0 };
    }

    const files = await gptVectorStoreService.listVectorStoreFiles();

    const kbFiles = files
      .filter((file) => file.status === "completed")
      .filter((file) => {
        const kind = file.attributes && (file.attributes as any).kind;
        return kind === FAQ_KB_KIND;
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const latest = kbFiles[0];
    if (!latest) return null;

    return {
      vectorStoreFileId: latest.id,
      createdAt: latest.createdAt,
    };
  }

  private async refresh(): Promise<FaqKbSnapshot> {
    if (!this.isEnabled()) {
      throw new Error(
        "FAQ KB no disponible: OpenAI no está configurado (OPENAI_API_KEY / OPENAI_VECTOR_STORE_ID)",
      );
    }

    const selected = await this.selectKbVectorStoreFileId();

    if (!selected) {
      throw new Error(
        `FAQ KB no encontrado: sube un archivo al vector store con attributes.kind='${FAQ_KB_KIND}' o define FAQ_KB_VECTOR_STORE_FILE_ID`,
      );
    }

    const text = await gptVectorStoreService.getVectorStoreFileText(
      selected.vectorStoreFileId,
    );

    if (!text) {
      throw new Error(
        `FAQ KB vacío: no se pudo leer contenido del archivo ${selected.vectorStoreFileId}`,
      );
    }

    const parsedEntries = parseFaqKbText(text);

    return buildSnapshot(
      {
        vectorStoreFileId: selected.vectorStoreFileId,
        createdAt: selected.createdAt,
      },
      parsedEntries,
    );
  }

  async getSnapshot(options?: {
    forceRefresh?: boolean;
  }): Promise<FaqKbSnapshot> {
    const now = Date.now();

    if (!options?.forceRefresh && this.cached && this.cached.expiresAt > now) {
      return this.cached.snapshot;
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.refresh()
      .then((snapshot) => {
        this.cached = { snapshot, expiresAt: Date.now() + CACHE_TTL_MS };
        return snapshot;
      })
      .catch((error) => {
        if (this.cached) {
          logger.warn("FAQ KB refresh falló; usando snapshot previo", {
            error: (error as Error).message,
          });
          return this.cached.snapshot;
        }
        throw error;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }
}

export const faqKbStore = new FaqKbStore();
