import {
  calculateSimilarity,
  extractKeywords,
  logger,
  normalizeText,
} from "../utils";
import {
  faqKbStore,
  type FaqKbEntryIndexed,
  type FaqTier,
} from "./faq-kb.store";

export interface FaqMatchResult {
  id: string;
  question: string;
  answer: string;
  category: string;
  tier: string;
  score: number;
}

const THRESHOLD_EXACT = 0.88;
const THRESHOLD_SHORT_QUERY = 0.95;

function getKeywordsOverlapCount(
  queryKeywords: string[],
  faqKeywords: string[],
): number {
  if (!queryKeywords.length || !faqKeywords.length) return 0;
  const set = new Set(faqKeywords);
  let count = 0;
  for (const kw of queryKeywords) {
    if (set.has(kw)) count += 1;
  }
  return count;
}

function scoreVariant(
  normalizedQuery: string,
  queryKeywords: string[],
  faqKeywords: string[],
  variantNormalized: string,
): number {
  if (!variantNormalized) return 0;

  let score = calculateSimilarity(normalizedQuery, variantNormalized);

  const contains =
    normalizedQuery.includes(variantNormalized) ||
    variantNormalized.includes(normalizedQuery);

  if (contains) {
    const enoughSignal =
      normalizedQuery.length >= 12 || queryKeywords.length >= 2;
    score = Math.max(score, enoughSignal ? 0.92 : 0.78);
  }

  const overlap = getKeywordsOverlapCount(queryKeywords, faqKeywords);

  if (overlap >= 2) {
    score += Math.min(0.08, overlap * 0.02);
  }

  if (queryKeywords.length >= 2) {
    const coverage = overlap / queryKeywords.length;
    if (coverage >= 0.8) score += 0.05;
    if (coverage === 1) score += 0.05;
  }

  return Math.min(1, score);
}

function scoreFaq(
  normalizedQuery: string,
  queryKeywords: string[],
  faq: FaqKbEntryIndexed,
): { score: number; question: string } {
  const faqKeywords = Array.isArray(faq.keywords) ? faq.keywords : [];

  const variantsNormalized =
    Array.isArray(faq.questionsNormalized) && faq.questionsNormalized.length > 0
      ? faq.questionsNormalized
      : (faq.questions || []).map((q) => normalizeText(q)).filter(Boolean);

  const questions = Array.isArray(faq.questions) ? faq.questions : [];

  let bestScore = 0;
  let bestQuestion = questions[0] || "";

  for (let i = 0; i < variantsNormalized.length; i += 1) {
    const variantNormalized = variantsNormalized[i] || "";
    const variantScore = scoreVariant(
      normalizedQuery,
      queryKeywords,
      faqKeywords,
      variantNormalized,
    );

    if (variantScore > bestScore) {
      bestScore = variantScore;
      bestQuestion = questions[i] || questions[0] || "";
    }
  }

  return { score: bestScore, question: bestQuestion };
}

export class FaqService {
  async listByTier(
    tier: FaqTier,
  ): Promise<Array<{ id: string; question: string; category: string }>> {
    const snapshot = await faqKbStore.getSnapshot();
    const list = snapshot.byTier[tier] || [];

    return list
      .map((entry) => ({
        id: entry.id,
        question: entry.questions?.[0] || "",
        category: entry.category,
      }))
      .filter((item) => item.question);
  }

  async findById(id: string): Promise<FaqKbEntryIndexed | null> {
    const snapshot = await faqKbStore.getSnapshot();
    return snapshot.byId.get(id) || null;
  }

  async match(message: string): Promise<FaqMatchResult | null> {
    const normalizedQuery = normalizeText(message);
    if (!normalizedQuery) return null;

    try {
      const snapshot = await faqKbStore.getSnapshot();

      const exactId = snapshot.exactIndex.get(normalizedQuery);
      const exact = exactId ? snapshot.byId.get(exactId) : null;

      if (exact) {
        return {
          id: exact.id,
          question: exact.questions?.[0] || "",
          answer: exact.answer,
          category: exact.category,
          tier: exact.tier,
          score: 1,
        };
      }

      const queryKeywordsRaw = extractKeywords(message);
      const queryKeywords = queryKeywordsRaw
        .map((k) => normalizeText(k))
        .filter(Boolean);

      const candidateIds = new Set<string>();
      for (const kw of queryKeywords) {
        const ids = snapshot.keywordIndex.get(kw);
        if (!ids) continue;
        for (const id of ids) candidateIds.add(id);
      }

      const candidates: FaqKbEntryIndexed[] =
        candidateIds.size > 0
          ? Array.from(candidateIds)
              .map((id) => snapshot.byId.get(id))
              .filter((e): e is FaqKbEntryIndexed => Boolean(e))
          : snapshot.entries;

      let best: {
        faq: FaqKbEntryIndexed;
        score: number;
        question: string;
      } | null = null;

      for (const faq of candidates) {
        const { score, question } = scoreFaq(
          normalizedQuery,
          queryKeywords,
          faq,
        );
        if (!best || score > best.score) {
          best = { faq, score, question };
        }
      }

      if (!best) return null;

      const threshold =
        normalizedQuery.length < 12 && queryKeywords.length < 2
          ? THRESHOLD_SHORT_QUERY
          : THRESHOLD_EXACT;

      if (best.score < threshold) return null;

      return {
        id: best.faq.id,
        question: best.question || best.faq.questions?.[0] || "",
        answer: best.faq.answer,
        category: best.faq.category,
        tier: best.faq.tier,
        score: best.score,
      };
    } catch (error) {
      logger.warn("FAQ KB match falló", {
        error: (error as Error).message,
      });
      return null;
    }
  }

  async search(
    query: string,
    limit: number = 5,
  ): Promise<Array<Omit<FaqMatchResult, "answer">>> {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return [];

    const safeLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Math.floor(limit), 1), 20)
      : 5;

    const snapshot = await faqKbStore.getSnapshot();

    const queryKeywordsRaw = extractKeywords(query);
    const queryKeywords = queryKeywordsRaw
      .map((k) => normalizeText(k))
      .filter(Boolean);

    const candidateIds = new Set<string>();
    for (const kw of queryKeywords) {
      const ids = snapshot.keywordIndex.get(kw);
      if (!ids) continue;
      for (const id of ids) candidateIds.add(id);
    }

    const candidates: FaqKbEntryIndexed[] =
      candidateIds.size > 0
        ? Array.from(candidateIds)
            .map((id) => snapshot.byId.get(id))
            .filter((e): e is FaqKbEntryIndexed => Boolean(e))
        : snapshot.entries;

    const scored = candidates
      .map((faq) => {
        const { score, question } = scoreFaq(
          normalizedQuery,
          queryKeywords,
          faq,
        );
        return {
          id: faq.id,
          question: question || faq.questions?.[0] || "",
          category: faq.category,
          tier: faq.tier,
          score,
        };
      })
      .filter((r) => r.question)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, safeLimit);
  }
}

export const faqService = new FaqService();
