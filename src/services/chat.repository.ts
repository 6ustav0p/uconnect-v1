import { Chat, IChat, IChatMessage, CacheEntry, ICacheEntry } from "../models";
import { config } from "../config";
import { logger, generateCacheKey } from "../utils";
import { ChatMessage, ChatbotResponse } from "../types";

export class ChatRepository {
  // ============================================
  // OPERACIONES DE CHAT
  // ============================================

  /**
   * Obtiene o crea un chat por sessionId
   */
  async getOrCreateChat(sessionId: string, userId?: string): Promise<IChat> {
    let chat = await Chat.findOne({ sessionId });

    if (!chat) {
      chat = new Chat({
        sessionId,
        userId,
        messages: [],
        metadata: {
          totalMessages: 0,
          totalTokensInput: 0,
          totalTokensOutput: 0,
          lastActivity: new Date(),
        },
      });
      await chat.save();
      logger.debug("Nuevo chat creado", { sessionId });
    }

    return chat;
  }

  /**
   * Agrega un mensaje al chat
   */
  async addMessage(
    sessionId: string,
    role: "user" | "assistant",
    content: string,
    metadata?: {
      tokensUsed?: { input: number; output: number };
      intent?: string[];
      sources?: string[];
      processingTime?: number;
    },
  ): Promise<IChat> {
    const message: IChatMessage = {
      role,
      content,
      timestamp: new Date(),
      tokensUsed: metadata?.tokensUsed,
      metadata: {
        intent: metadata?.intent,
        sources: metadata?.sources,
        processingTime: metadata?.processingTime,
      },
    };

    const updateData: Record<string, unknown> = {
      $push: { messages: message },
      $inc: { "metadata.totalMessages": 1 },
      $set: { "metadata.lastActivity": new Date() },
    };

    if (metadata?.tokensUsed) {
      updateData.$inc = {
        ...(updateData.$inc as object),
        "metadata.totalTokensInput": metadata.tokensUsed.input,
        "metadata.totalTokensOutput": metadata.tokensUsed.output,
      };
    }

    const chat = await Chat.findOneAndUpdate({ sessionId }, updateData, {
      new: true,
      upsert: true,
    });

    logger.debug("Mensaje agregado al chat", { sessionId, role });
    return chat!;
  }

  /**
   * Obtiene el historial de mensajes
   */
  async getHistory(sessionId: string, limit?: number): Promise<ChatMessage[]> {
    const chat = await Chat.findOne({ sessionId });

    if (!chat) return [];

    const messages = chat.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
    }));

    if (limit) {
      return messages.slice(-limit);
    }

    return messages;
  }

  /**
   * Obtiene chats recientes de un usuario
   */
  async getUserChats(userId: string, limit = 10): Promise<IChat[]> {
    return Chat.find({ userId })
      .sort({ "metadata.lastActivity": -1 })
      .limit(limit)
      .select("-messages")
      .lean();
  }

  /**
   * Elimina chats antiguos (limpieza)
   */
  async cleanOldChats(daysOld: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await Chat.deleteMany({
      "metadata.lastActivity": { $lt: cutoffDate },
    });

    logger.info("Chats antiguos eliminados", {
      count: result.deletedCount,
      daysOld,
    });
    return result.deletedCount;
  }

  // ============================================
  // OPERACIONES DE CACHÉ
  // ============================================

  /**
   * Obtiene entrada de caché
   */
  async getCached<T>(key: string): Promise<T | null> {
    const entry = await CacheEntry.findOneAndUpdate(
      { key, expiresAt: { $gt: new Date() } },
      { $inc: { hitCount: 1 } },
      { new: true },
    );

    if (entry) {
      logger.debug("Cache hit", { key, hitCount: entry.hitCount });
      return entry.data as T;
    }

    return null;
  }

  /**
   * Guarda entrada en caché
   */
  async setCache<T>(
    key: string,
    data: T,
    type: "query_result" | "api_response" | "frequent_answer",
    ttlSeconds?: number,
  ): Promise<void> {
    const ttl = ttlSeconds || config.chatbot.cacheTTLSeconds;
    const expiresAt = new Date(Date.now() + ttl * 1000);

    await CacheEntry.findOneAndUpdate(
      { key },
      {
        key,
        type,
        data,
        hitCount: 0,
        createdAt: new Date(),
        expiresAt,
      },
      { upsert: true },
    );

    logger.debug("Cache set", { key, type, ttl });
  }

  /**
   * Obtiene respuestas frecuentes más populares
   */
  async getPopularCachedAnswers(limit = 10): Promise<ICacheEntry[]> {
    return CacheEntry.find({
      type: "frequent_answer",
      expiresAt: { $gt: new Date() },
    })
      .sort({ hitCount: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Limpia caché expirado manualmente
   */
  async cleanExpiredCache(): Promise<number> {
    const result = await CacheEntry.deleteMany({
      expiresAt: { $lt: new Date() },
    });

    logger.info("Caché expirado eliminado", { count: result.deletedCount });
    return result.deletedCount;
  }

  // ============================================
  // ESTADÍSTICAS
  // ============================================

  /**
   * Obtiene estadísticas generales
   */
  async getStats(): Promise<{
    totalChats: number;
    totalMessages: number;
    totalTokensUsed: number;
    cacheEntries: number;
    cacheHits: number;
  }> {
    const [chatStats, cacheStats] = await Promise.all([
      Chat.aggregate([
        {
          $group: {
            _id: null,
            totalChats: { $sum: 1 },
            totalMessages: { $sum: "$metadata.totalMessages" },
            totalTokensInput: { $sum: "$metadata.totalTokensInput" },
            totalTokensOutput: { $sum: "$metadata.totalTokensOutput" },
          },
        },
      ]),
      CacheEntry.aggregate([
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalHits: { $sum: "$hitCount" },
          },
        },
      ]),
    ]);

    const chat = chatStats[0] || {
      totalChats: 0,
      totalMessages: 0,
      totalTokensInput: 0,
      totalTokensOutput: 0,
    };
    const cache = cacheStats[0] || { count: 0, totalHits: 0 };

    return {
      totalChats: chat.totalChats,
      totalMessages: chat.totalMessages,
      totalTokensUsed: chat.totalTokensInput + chat.totalTokensOutput,
      cacheEntries: cache.count,
      cacheHits: cache.totalHits,
    };
  }

  /**
   * Obtiene el número total de chats
   */
  async getChatCount(): Promise<number> {
    return Chat.countDocuments();
  }
}

// Singleton
export const chatRepository = new ChatRepository();
