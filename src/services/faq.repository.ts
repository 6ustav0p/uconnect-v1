import { FaqEntry, IFaqEntry, FaqTier } from "../models";
import { extractKeywords, normalizeText } from "../utils";

export interface FaqUpsertInput {
  id: string;
  questions: string[];
  answer: string;
  category: string;
  tier: FaqTier;
  source?: {
    title?: string;
    url?: string;
  };
  isActive?: boolean;
}

export class FaqRepository {
  async findById(id: string): Promise<IFaqEntry | null> {
    return FaqEntry.findOne({ id, isActive: true }).lean<IFaqEntry>();
  }

  async listByTier(tier: FaqTier): Promise<
    Array<{ id: string; question: string; category: string }>
  > {
    const docs = await FaqEntry.find({ isActive: true, tier })
      .sort({ hitCount: -1, updatedAt: -1 })
      .select({ id: 1, questions: 1, category: 1 })
      .lean<Array<Pick<IFaqEntry, "id" | "questions" | "category">>>();

    return docs
      .map((doc) => ({
        id: doc.id,
        question: doc.questions?.[0] || "",
        category: doc.category,
      }))
      .filter((item) => item.question);
  }

  async findExactByNormalizedQuestion(
    normalizedQuestion: string,
  ): Promise<IFaqEntry | null> {
    return FaqEntry.findOne({
      isActive: true,
      questionsNormalized: normalizedQuestion,
    }).lean<IFaqEntry>();
  }

  async findCandidatesByKeywords(
    keywords: string[],
    limit: number = 200,
  ): Promise<IFaqEntry[]> {
    if (!keywords.length) return [];

    const normalizedKeywords = keywords.map((k) => normalizeText(k)).filter(Boolean);
    if (!normalizedKeywords.length) return [];

    return FaqEntry.find({ isActive: true, keywords: { $in: normalizedKeywords } })
      .limit(limit)
      .lean<IFaqEntry[]>();
  }

  async listActive(limit: number = 500): Promise<IFaqEntry[]> {
    return FaqEntry.find({ isActive: true })
      .limit(limit)
      .lean<IFaqEntry[]>();
  }

  async incrementHit(id: string): Promise<void> {
    await FaqEntry.updateOne({ id }, { $inc: { hitCount: 1 } }).exec();
  }

  async upsert(input: FaqUpsertInput): Promise<void> {
    const questions = (input.questions || []).map((q) => q.trim()).filter(Boolean);

    const questionsNormalized = [
      ...new Set(questions.map((q) => normalizeText(q)).filter(Boolean)),
    ];

    const keywords = [
      ...new Set(extractKeywords(questions.join(" ")).map((k) => normalizeText(k))),
    ].filter(Boolean);

    await FaqEntry.updateOne(
      { id: input.id },
      {
        $set: {
          id: input.id,
          questions,
          questionsNormalized,
          answer: input.answer,
          category: input.category,
          tier: input.tier,
          keywords,
          source: input.source,
          isActive: input.isActive ?? true,
        },
        $setOnInsert: {
          hitCount: 0,
        },
      },
      { upsert: true },
    ).exec();
  }
}

export const faqRepository = new FaqRepository();
