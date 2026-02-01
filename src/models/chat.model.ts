import mongoose, { Schema, Document, Model } from "mongoose";

// ============================================
// INTERFACES
// ============================================

export interface IChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  tokensUsed?: {
    input: number;
    output: number;
  };
  metadata?: {
    intent?: string[];
    sources?: string[];
    processingTime?: number;
  };
}

export interface IChat extends Document {
  sessionId: string;
  userId?: string;
  messages: IChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  metadata: {
    totalMessages: number;
    totalTokensInput: number;
    totalTokensOutput: number;
    lastActivity: Date;
    userAgent?: string;
    ipAddress?: string;
  };
}

export interface ICacheEntry extends Document {
  key: string;
  type: "query_result" | "api_response" | "frequent_answer";
  data: unknown;
  query?: string;
  hitCount: number;
  createdAt: Date;
  expiresAt: Date;
}

// ============================================
// SCHEMAS
// ============================================

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    tokensUsed: {
      input: Number,
      output: Number,
    },
    metadata: {
      intent: [String],
      sources: [String],
      processingTime: Number,
    },
  },
  { _id: false },
);

const ChatSchema = new Schema<IChat>(
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
    messages: [ChatMessageSchema],
    metadata: {
      totalMessages: { type: Number, default: 0 },
      totalTokensInput: { type: Number, default: 0 },
      totalTokensOutput: { type: Number, default: 0 },
      lastActivity: { type: Date, default: Date.now },
      userAgent: String,
      ipAddress: String,
    },
  },
  {
    timestamps: true,
    collection: "chats",
  },
);

// Índices para búsquedas eficientes
ChatSchema.index({ "metadata.lastActivity": -1 });
ChatSchema.index({ createdAt: -1 });
ChatSchema.index({ userId: 1, createdAt: -1 });

const CacheSchema = new Schema<ICacheEntry>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["query_result", "api_response", "frequent_answer"],
      required: true,
    },
    data: {
      type: Schema.Types.Mixed,
      required: true,
    },
    query: String,
    hitCount: {
      type: Number,
      default: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    collection: "cache",
  },
);

// TTL index para auto-eliminar documentos expirados
CacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ============================================
// MODELOS
// ============================================

export const Chat: Model<IChat> =
  mongoose.models.Chat || mongoose.model<IChat>("Chat", ChatSchema);
export const CacheEntry: Model<ICacheEntry> =
  mongoose.models.CacheEntry ||
  mongoose.model<ICacheEntry>("CacheEntry", CacheSchema);
