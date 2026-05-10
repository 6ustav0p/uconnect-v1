import { v4 as uuidv4 } from "uuid";
import { config } from "../config";
import { logger } from "../utils";
import {
  faqKbStore,
  parseFaqKbText,
  type FaqKbEntry,
  type FaqTier,
} from "./faq-kb.store";
import { gptVectorStoreService } from "./gpt-vector-store.service";

const FAQ_KB_KIND = "faq_kb";
const DEFAULT_KB_FILENAME = "uconnect-faq-kb.json";

export type FaqKbAdminSnapshot = {
  file: {
    vectorStoreFileId: string;
    createdAt: number;
  };
  loadedAt: string;
  entries: FaqKbEntry[];
  total: number;
};

export type FaqKbEntryCreateInput = {
  id?: string;
  tier: FaqTier;
  category: string;
  question?: string;
  questions?: string[];
  answer: string;
  source?: {
    title?: string;
    url?: string;
  };
};

export type FaqKbEntryUpdateInput = {
  tier?: FaqTier;
  category?: string;
  question?: string;
  questions?: string[];
  answer?: string;
  source?: {
    title?: string;
    url?: string;
  };
  isActive?: boolean;
};

function isFaqTier(value: unknown): value is FaqTier {
  return value === "featured" || value === "faq" || value === "archive";
}

function normalizeQuestions(input: {
  question?: unknown;
  questions?: unknown;
}): string[] {
  const fromArray = Array.isArray(input.questions)
    ? input.questions
        .map((q) => (typeof q === "string" ? q.trim() : ""))
        .filter(Boolean)
    : [];

  if (fromArray.length > 0) return fromArray;

  if (typeof input.question === "string") {
    const trimmed = input.question.trim();
    return trimmed ? [trimmed] : [];
  }

  return [];
}

function compactEntry(entry: any): FaqKbEntry {
  return {
    id: String(entry.id),
    tier: entry.tier as FaqTier,
    category: String(entry.category),
    questions: Array.isArray(entry.questions)
      ? entry.questions
          .map((q: any) => (typeof q === "string" ? q.trim() : ""))
          .filter(Boolean)
      : [],
    answer: typeof entry.answer === "string" ? entry.answer : "",
    isActive:
      typeof entry.isActive === "boolean" ? (entry.isActive as boolean) : true,
    source:
      entry.source && typeof entry.source === "object"
        ? {
            title:
              typeof entry.source.title === "string"
                ? entry.source.title
                : undefined,
            url:
              typeof entry.source.url === "string" ? entry.source.url : undefined,
          }
        : undefined,
  };
}

function serializeKb(entries: FaqKbEntry[]): Buffer {
  const payload = {
    version: 1,
    kind: FAQ_KB_KIND,
    generatedAt: new Date().toISOString(),
    entries: entries,
  };

  return Buffer.from(JSON.stringify(payload, null, 2), "utf-8");
}

export class FaqKbAdminService {
  private isEnabled(): boolean {
    return Boolean(config.openai.apiKey) && Boolean(config.openai.vectorStoreId);
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

  private async loadRawKb(): Promise<{
    file: { vectorStoreFileId: string; createdAt: number };
    entries: FaqKbEntry[];
  }> {
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

    return {
      file: {
        vectorStoreFileId: selected.vectorStoreFileId,
        createdAt: selected.createdAt,
      },
      entries: parsedEntries,
    };
  }

  async getKb(options?: { forceRefresh?: boolean }): Promise<FaqKbAdminSnapshot> {
    // Para admin, siempre leemos el KB crudo (incluye isActive=false).
    // Igual permitimos forceRefresh para que el runtime recargue su snapshot si se requiere.
    const { file, entries } = await this.loadRawKb();

    if (options?.forceRefresh) {
      await faqKbStore.getSnapshot({ forceRefresh: true });
    }

    return {
      file,
      loadedAt: new Date().toISOString(),
      entries,
      total: entries.length,
    };
  }

  private async saveKb(entries: FaqKbEntry[]): Promise<{
    vectorStoreFileId: string;
    createdAt: number;
  }> {
    const fileBuffer = serializeKb(entries);

    logger.info("[FAQ KB] Subiendo KB actualizado al Vector Store...", {
      bytes: fileBuffer.length,
      entries: entries.length,
      kind: FAQ_KB_KIND,
    });

    await gptVectorStoreService.uploadAndPoll(fileBuffer, DEFAULT_KB_FILENAME, {
      attributes: { kind: FAQ_KB_KIND },
    });

    const vectorFiles = await gptVectorStoreService.listVectorStoreFiles();
    const latest = vectorFiles
      .filter((f) => f.status === "completed")
      .filter((f) => (f.attributes as any)?.kind === FAQ_KB_KIND)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];

    if (!latest) {
      throw new Error(
        "FAQ KB actualizado, pero no se pudo encontrar el vector store file resultante.",
      );
    }

    // Refrescar snapshot para que el runtime use el KB nuevo.
    await faqKbStore.getSnapshot({ forceRefresh: true });

    return { vectorStoreFileId: latest.id, createdAt: latest.createdAt };
  }

  private validateBase(entry: FaqKbEntry): void {
    if (!entry.id || !entry.id.trim()) {
      throw new Error("El campo 'id' es requerido");
    }

    if (!isFaqTier(entry.tier)) {
      throw new Error("El campo 'tier' debe ser: featured | faq | archive");
    }

    if (!entry.category || !entry.category.trim()) {
      throw new Error("El campo 'category' es requerido");
    }

    const questions = (entry.questions || []).map((q) => q.trim()).filter(Boolean);
    if (questions.length === 0) {
      throw new Error("Debes proveer 'question' o 'questions' (al menos 1)");
    }

    if (!entry.answer || !entry.answer.trim()) {
      throw new Error("El campo 'answer' es requerido");
    }
  }

  async createEntry(input: FaqKbEntryCreateInput): Promise<{
    file: { vectorStoreFileId: string; createdAt: number };
    entry: FaqKbEntry;
  }> {
    const kb = await this.loadRawKb();
    const entries = kb.entries.slice();

    const id = typeof input.id === "string" && input.id.trim()
      ? input.id.trim()
      : `q_${uuidv4()}`;

    if (entries.some((e) => e.id === id)) {
      throw new Error(`Ya existe una FAQ con id='${id}'`);
    }

    if (!isFaqTier(input.tier)) {
      throw new Error("El campo 'tier' debe ser: featured | faq | archive");
    }

    const questions = normalizeQuestions({
      question: input.question,
      questions: input.questions,
    });

    const entry: FaqKbEntry = {
      id,
      tier: input.tier,
      category: typeof input.category === "string" ? input.category.trim() : "",
      questions,
      answer: typeof input.answer === "string" ? input.answer.trim() : "",
      isActive: true,
      source: input.source,
    };

    this.validateBase(entry);

    entries.push(entry);

    const file = await this.saveKb(entries);
    return { file, entry };
  }

  async updateEntry(
    id: string,
    patch: FaqKbEntryUpdateInput,
  ): Promise<{
    file: { vectorStoreFileId: string; createdAt: number };
    entry: FaqKbEntry;
  }> {
    const safeId = id.trim();
    if (!safeId) throw new Error("El parámetro ':id' es requerido");

    const kb = await this.loadRawKb();
    const entries = kb.entries.slice();

    const index = entries.findIndex((e) => e.id === safeId);
    if (index === -1) {
      throw new Error(`No existe una FAQ con id='${safeId}'`);
    }

    const current = entries[index];

    const next: FaqKbEntry = {
      ...current,
      tier:
        patch.tier !== undefined
          ? (patch.tier as any)
          : current.tier,
      category:
        typeof patch.category === "string" ? patch.category.trim() : current.category,
      answer: typeof patch.answer === "string" ? patch.answer.trim() : current.answer,
      isActive:
        typeof patch.isActive === "boolean" ? patch.isActive : current.isActive,
      source: patch.source !== undefined ? patch.source : current.source,
    };

    if (patch.question !== undefined || patch.questions !== undefined) {
      next.questions = normalizeQuestions({
        question: patch.question,
        questions: patch.questions,
      });
    }

    if (!isFaqTier(next.tier)) {
      throw new Error("El campo 'tier' debe ser: featured | faq | archive");
    }

    this.validateBase(next);
    entries[index] = next;

    const file = await this.saveKb(entries);
    return { file, entry: next };
  }

  async deleteEntry(id: string): Promise<{ file: { vectorStoreFileId: string; createdAt: number } }> {
    const safeId = id.trim();
    if (!safeId) throw new Error("El parámetro ':id' es requerido");

    const kb = await this.loadRawKb();
    const entries = kb.entries.slice();

    const index = entries.findIndex((e) => e.id === safeId);
    if (index === -1) {
      throw new Error(`No existe una FAQ con id='${safeId}'`);
    }

    // Soft-delete: mantener la entry pero desactivarla.
    entries[index] = {
      ...entries[index],
      isActive: false,
    };

    const file = await this.saveKb(entries);
    return { file };
  }
}

export const faqKbAdminService = new FaqKbAdminService();
