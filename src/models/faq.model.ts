import mongoose, { Schema, Document, Model } from "mongoose";
import { extractKeywords, normalizeText } from "../utils";

export type FaqTier = "featured" | "faq" | "archive";

export interface IFaqSource {
  title?: string;
  url?: string;
}

export interface IFaqEntry extends Document {
  id: string;
  questions: string[];
  questionsNormalized: string[];
  answer: string;
  category: string;
  tier: FaqTier;
  keywords: string[];
  source?: IFaqSource;
  isActive: boolean;
  hitCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const FaqEntrySchema = new Schema<IFaqEntry>(
  {
    id: { type: String, required: true, unique: true, index: true },
    questions: { type: [String], required: true, default: [] },
    questionsNormalized: { type: [String], required: true, default: [] },
    answer: { type: String, required: true },
    category: { type: String, required: true, index: true },
    tier: {
      type: String,
      enum: ["featured", "faq", "archive"],
      required: true,
      index: true,
    },
    keywords: { type: [String], required: true, default: [], index: true },
    source: {
      title: String,
      url: String,
    },
    isActive: { type: Boolean, default: true, index: true },
    hitCount: { type: Number, default: 0, index: true },
  },
  {
    timestamps: true,
    collection: "faqs",
  },
);

FaqEntrySchema.index({ category: 1, hitCount: -1 });
FaqEntrySchema.index({ tier: 1, hitCount: -1 });
FaqEntrySchema.index({ questionsNormalized: 1 });

FaqEntrySchema.pre("validate", function () {
  const questions = Array.isArray(this.questions) ? this.questions : [];

  this.questionsNormalized = [
    ...new Set(questions.map((q) => normalizeText(q)).filter(Boolean)),
  ];

  const normalizedKeywords = Array.isArray(this.keywords)
    ? this.keywords.map((k) => normalizeText(k)).filter(Boolean)
    : [];

  if (normalizedKeywords.length > 0) {
    this.keywords = [...new Set(normalizedKeywords)];
    return;
  }

  const keywords = new Set<string>();
  for (const q of questions) {
    for (const kw of extractKeywords(q)) {
      keywords.add(kw);
    }
  }
  this.keywords = [...keywords];
});

export const FaqEntry: Model<IFaqEntry> =
  mongoose.models.FaqEntry ||
  mongoose.model<IFaqEntry>("FaqEntry", FaqEntrySchema);
