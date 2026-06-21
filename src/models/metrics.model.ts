import mongoose, { Schema, Document, Model } from "mongoose";

export type ConversationRoute = "faq" | "documents" | "general";
export type FeedbackCategory =
  | "accuracy"
  | "clarity"
  | "speed"
  | "completeness"
  | "tone"
  | "other";
export type FeedbackSentiment = "positive" | "neutral" | "negative";
export type FeedbackType = "rating" | "thumbs" | "comment";

export interface IChatSessionMetric extends Document {
  sessionId: string;
  userId?: string;
  startedAt: Date;
  lastActivityAt: Date;
  closedAt?: Date;
  status: "open" | "closed";
  exchangeCount: number;
  userQuestionsCount: number;
  assistantResponsesCount: number;
  faqTurns: number;
  documentsTurns: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalResponseTimeMs: number;
  lastRoute?: ConversationRoute;
  feedbackCount: number;
  feedbackScoreTotal: number;
  feedbackHelpfulCount: number;
  feedbackNegativeCount: number;
  lastFeedbackAt?: Date;
}

export interface IChatFeedback extends Document {
  sessionId: string;
  userId?: string;
  route: ConversationRoute;
  type: FeedbackType;
  score: number;
  helpful: boolean;
  resolved: boolean;
  sentiment: FeedbackSentiment;
  category: FeedbackCategory;
  comment?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ChatSessionMetricSchema = new Schema<IChatSessionMetric>(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      index: true,
      sparse: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    closedAt: {
      type: Date,
      index: true,
    },
    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
      index: true,
    },
    exchangeCount: {
      type: Number,
      default: 0,
    },
    userQuestionsCount: {
      type: Number,
      default: 0,
    },
    assistantResponsesCount: {
      type: Number,
      default: 0,
    },
    faqTurns: {
      type: Number,
      default: 0,
    },
    documentsTurns: {
      type: Number,
      default: 0,
    },
    totalTokensInput: {
      type: Number,
      default: 0,
    },
    totalTokensOutput: {
      type: Number,
      default: 0,
    },
    totalResponseTimeMs: {
      type: Number,
      default: 0,
    },
    lastRoute: {
      type: String,
      enum: ["faq", "documents", "general"],
    },
    feedbackCount: {
      type: Number,
      default: 0,
    },
    feedbackScoreTotal: {
      type: Number,
      default: 0,
    },
    feedbackHelpfulCount: {
      type: Number,
      default: 0,
    },
    feedbackNegativeCount: {
      type: Number,
      default: 0,
    },
    lastFeedbackAt: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "chat_session_metrics",
  },
);

ChatSessionMetricSchema.index({ startedAt: -1 });
ChatSessionMetricSchema.index({ status: 1, lastActivityAt: -1 });
ChatSessionMetricSchema.index({ userId: 1, startedAt: -1 });

const ChatFeedbackSchema = new Schema<IChatFeedback>(
  {
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      index: true,
      sparse: true,
    },
    route: {
      type: String,
      enum: ["faq", "documents", "general"],
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["rating", "thumbs", "comment"],
      required: true,
    },
    score: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      index: true,
    },
    helpful: {
      type: Boolean,
      default: false,
      index: true,
    },
    resolved: {
      type: Boolean,
      default: false,
      index: true,
    },
    sentiment: {
      type: String,
      enum: ["positive", "neutral", "negative"],
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: ["accuracy", "clarity", "speed", "completeness", "tone", "other"],
      default: "other",
      index: true,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    tags: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: "chat_feedback",
  },
);

ChatFeedbackSchema.index({ createdAt: -1 });
ChatFeedbackSchema.index({ sessionId: 1, createdAt: -1 });

export const ChatSessionMetric: Model<IChatSessionMetric> =
  mongoose.models.ChatSessionMetric ||
  mongoose.model<IChatSessionMetric>(
    "ChatSessionMetric",
    ChatSessionMetricSchema,
  );

export const ChatFeedback: Model<IChatFeedback> =
  mongoose.models.ChatFeedback ||
  mongoose.model<IChatFeedback>("ChatFeedback", ChatFeedbackSchema);
