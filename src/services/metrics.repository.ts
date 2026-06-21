import {
  ChatFeedback,
  ChatSessionMetric,
  type ConversationRoute,
  type FeedbackCategory,
  type FeedbackSentiment,
  type FeedbackType,
  type IChatFeedback,
  type IChatSessionMetric,
} from "../models/metrics.model";

type MetricsRangeInput = {
  from?: string | Date;
  to?: string | Date;
  days?: number;
};

type TrackConversationTurnInput = {
  sessionId: string;
  userId?: string;
  route: ConversationRoute;
  tokensUsed?: {
    input: number;
    output: number;
  };
  responseTimeMs?: number;
};

type RecordFeedbackInput = {
  sessionId: string;
  userId?: string;
  route?: ConversationRoute;
  score?: number;
  helpful?: boolean;
  resolved?: boolean;
  category?: FeedbackCategory;
  comment?: string;
  tags?: string[];
  type?: FeedbackType;
};

function startOfUtcDay(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function endOfUtcDay(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
}

function toDate(input: string | Date | undefined): Date | null {
  if (!input) return null;
  const parsed = input instanceof Date ? input : new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveRange(input: MetricsRangeInput = {}): { from: Date; to: Date } {
  const explicitFrom = toDate(input.from);
  const explicitTo = toDate(input.to);

  if (explicitFrom && explicitTo) {
    return {
      from: explicitFrom,
      to: explicitTo,
    };
  }

  const days =
    typeof input.days === "number" && Number.isFinite(input.days)
      ? Math.min(Math.max(Math.trunc(input.days), 1), 365)
      : 30;

  const to = endOfUtcDay(new Date());
  const from = startOfUtcDay(
    new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000),
  );

  return { from, to };
}

function sentimentFromScore(score: number): FeedbackSentiment {
  if (score >= 4) return "positive";
  if (score === 3) return "neutral";
  return "negative";
}

function normalizeFeedbackScore(
  score?: number,
  helpful?: boolean,
): number {
  if (typeof score === "number" && Number.isFinite(score)) {
    return Math.min(5, Math.max(1, Math.round(score)));
  }

  if (typeof helpful === "boolean") {
    return helpful ? 5 : 1;
  }

  return 3;
}

function normalizeFeedbackType(
  score?: number,
  helpful?: boolean,
  comment?: string,
): FeedbackType {
  if (typeof score === "number") return "rating";
  if (typeof helpful === "boolean") return "thumbs";
  if (comment && comment.trim()) return "comment";
  return "rating";
}

function normalizeRoute(route?: ConversationRoute): ConversationRoute {
  return route || "general";
}

function safeDurationMs(
  startedAt: Date,
  endedAt: Date | undefined,
  lastActivityAt: Date,
): number {
  const end = endedAt || lastActivityAt;
  return Math.max(0, end.getTime() - startedAt.getTime());
}

export interface UsageSummary {
  range: {
    from: string;
    to: string;
    days: number;
  };
  totals: {
    sessions: number;
    uniqueUsers: number;
    openSessions: number;
    closedSessions: number;
    questions: number;
    assistantResponses: number;
    avgQuestionsPerSession: number;
    avgConversationDurationSeconds: number;
    avgResponseTimeMs: number;
    totalTokensInput: number;
    totalTokensOutput: number;
    faqTurns: number;
    documentsTurns: number;
  };
  daily: Array<{
    date: string;
    sessions: number;
    uniqueUsers: number;
    questions: number;
    assistantResponses: number;
    avgQuestionsPerSession: number;
    avgConversationDurationSeconds: number;
    avgResponseTimeMs: number;
    totalTokensInput: number;
    totalTokensOutput: number;
    faqTurns: number;
    documentsTurns: number;
  }>;
}

export interface FeedbackSummary {
  range: {
    from: string;
    to: string;
    days: number;
  };
  totals: {
    feedbackCount: number;
    averageScore: number | null;
    helpfulCount: number;
    helpfulRate: number | null;
    resolvedCount: number;
    resolutionRate: number | null;
    positiveCount: number;
    neutralCount: number;
    negativeCount: number;
    categories: Record<FeedbackCategory, number>;
  };
  ratingDistribution: Array<{
    score: number;
    count: number;
  }>;
  daily: Array<{
    date: string;
    feedbackCount: number;
    averageScore: number | null;
    helpfulRate: number | null;
    resolutionRate: number | null;
    positiveCount: number;
    neutralCount: number;
    negativeCount: number;
  }>;
  recent: Array<Pick<
    IChatFeedback,
    | "sessionId"
    | "userId"
    | "route"
    | "type"
    | "score"
    | "helpful"
    | "resolved"
    | "sentiment"
    | "category"
    | "comment"
    | "tags"
    | "createdAt"
  >>;
}

export class MetricsRepository {
  async ensureSession(
    sessionId: string,
    userId?: string,
    startedAt: Date = new Date(),
  ): Promise<IChatSessionMetric> {
    const $set: Record<string, unknown> = {
      lastActivityAt: startedAt,
    };

    if (userId) {
      $set.userId = userId;
    }

    const metric = await ChatSessionMetric.findOneAndUpdate(
      { sessionId },
      {
        $setOnInsert: {
          sessionId,
          startedAt,
          status: "open",
        },
        $set,
        $unset: {
          closedAt: "",
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      },
    );

    return metric!;
  }

  async findSessionMetric(
    sessionId: string,
  ): Promise<IChatSessionMetric | null> {
    return ChatSessionMetric.findOne({ sessionId }).lean<IChatSessionMetric>();
  }

  async trackConversationTurn(
    input: TrackConversationTurnInput,
  ): Promise<IChatSessionMetric> {
    const now = new Date();
    const metric = await this.ensureSession(input.sessionId, input.userId, now);
    const route = normalizeRoute(input.route);
    const tokensInput = input.tokensUsed?.input || 0;
    const tokensOutput = input.tokensUsed?.output || 0;
    const responseTimeMs = input.responseTimeMs || 0;

    const update: Record<string, unknown> = {
      $inc: {
        exchangeCount: 1,
        userQuestionsCount: 1,
        assistantResponsesCount: 1,
        totalTokensInput: tokensInput,
        totalTokensOutput: tokensOutput,
        totalResponseTimeMs: responseTimeMs,
        [route === "faq" ? "faqTurns" : "documentsTurns"]: 1,
      },
      $set: {
        lastActivityAt: now,
        lastRoute: route,
      },
    };

    if (input.userId) {
      (update.$set as Record<string, unknown>).userId = input.userId;
    }

    const updated = await ChatSessionMetric.findOneAndUpdate(
      { sessionId: input.sessionId },
      update,
      { returnDocument: "after" },
    );

    return updated || metric;
  }

  async closeSession(
    sessionId: string,
    userId?: string,
  ): Promise<IChatSessionMetric | null> {
    const now = new Date();
    const update: Record<string, unknown> = {
      $set: {
        status: "closed",
        closedAt: now,
        lastActivityAt: now,
      },
    };

    if (userId) {
      (update.$set as Record<string, unknown>).userId = userId;
    }

    return ChatSessionMetric.findOneAndUpdate({ sessionId }, update, {
      returnDocument: "after",
    });
  }

  async recordFeedback(
    input: RecordFeedbackInput,
  ): Promise<IChatFeedback> {
    const now = new Date();
    const score = normalizeFeedbackScore(input.score, input.helpful);
    const helpful = input.helpful ?? score >= 4;
    const resolved = input.resolved ?? false;
    const route = normalizeRoute(input.route);
    const sentiment = sentimentFromScore(score);
    const type = normalizeFeedbackType(input.score, input.helpful, input.comment);
    const comment =
      typeof input.comment === "string" ? input.comment.trim() : undefined;
    const tags = Array.isArray(input.tags)
      ? input.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : [];

    const feedback = await ChatFeedback.create({
      sessionId: input.sessionId,
      userId: input.userId,
      route,
      type,
      score,
      helpful,
      resolved,
      sentiment,
      category: input.category || "other",
      comment: comment || undefined,
      tags,
    });

    await ChatSessionMetric.findOneAndUpdate(
      { sessionId: input.sessionId },
      {
        $setOnInsert: {
          sessionId: input.sessionId,
          startedAt: now,
          status: "open",
        },
        $set: {
          ...(input.userId ? { userId: input.userId } : {}),
          lastFeedbackAt: now,
          lastActivityAt: now,
        },
        $inc: {
          feedbackCount: 1,
          feedbackScoreTotal: score,
          feedbackHelpfulCount: helpful ? 1 : 0,
          feedbackNegativeCount: sentiment === "negative" ? 1 : 0,
        },
      },
      { upsert: true },
    );

    return feedback;
  }

  async getUsageSummary(
    input: MetricsRangeInput = {},
  ): Promise<UsageSummary> {
    const range = resolveRange(input);
    const days = Math.max(
      1,
      Math.round((range.to.getTime() - range.from.getTime()) / 86400000) + 1,
    );

    const match = {
      startedAt: {
        $gte: range.from,
        $lte: range.to,
      },
    };

    const [overallRows, dailyRows, openSessions] = await Promise.all([
      ChatSessionMetric.aggregate([
        { $match: match },
        {
          $addFields: {
            effectiveUserId: { $ifNull: ["$userId", "$sessionId"] },
            durationMs: {
              $subtract: [
                { $ifNull: ["$closedAt", "$lastActivityAt"] },
                "$startedAt",
              ],
            },
            responseAverageMs: {
              $cond: [
                { $gt: ["$exchangeCount", 0] },
                { $divide: ["$totalResponseTimeMs", "$exchangeCount"] },
                0,
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            sessions: { $sum: 1 },
            uniqueUsers: { $addToSet: "$effectiveUserId" },
            questions: { $sum: "$userQuestionsCount" },
            assistantResponses: { $sum: "$assistantResponsesCount" },
            totalTokensInput: { $sum: "$totalTokensInput" },
            totalTokensOutput: { $sum: "$totalTokensOutput" },
            totalResponseTimeMs: { $sum: "$totalResponseTimeMs" },
            totalDurationMs: { $sum: "$durationMs" },
            faqTurns: { $sum: "$faqTurns" },
            documentsTurns: { $sum: "$documentsTurns" },
            closedSessions: {
              $sum: {
                $cond: [{ $eq: ["$status", "closed"] }, 1, 0],
              },
            },
            avgResponseTimeMs: { $avg: "$responseAverageMs" },
          },
        },
      ]),
      ChatSessionMetric.aggregate([
        { $match: match },
        {
          $addFields: {
            dayKey: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$startedAt",
                timezone: "UTC",
              },
            },
            effectiveUserId: { $ifNull: ["$userId", "$sessionId"] },
            durationMs: {
              $subtract: [
                { $ifNull: ["$closedAt", "$lastActivityAt"] },
                "$startedAt",
              ],
            },
            responseAverageMs: {
              $cond: [
                { $gt: ["$exchangeCount", 0] },
                { $divide: ["$totalResponseTimeMs", "$exchangeCount"] },
                0,
              ],
            },
          },
        },
        {
          $group: {
            _id: "$dayKey",
            sessions: { $sum: 1 },
            uniqueUsers: { $addToSet: "$effectiveUserId" },
            questions: { $sum: "$userQuestionsCount" },
            assistantResponses: { $sum: "$assistantResponsesCount" },
            totalTokensInput: { $sum: "$totalTokensInput" },
            totalTokensOutput: { $sum: "$totalTokensOutput" },
            totalResponseTimeMs: { $sum: "$totalResponseTimeMs" },
            totalDurationMs: { $sum: "$durationMs" },
            faqTurns: { $sum: "$faqTurns" },
            documentsTurns: { $sum: "$documentsTurns" },
            avgResponseTimeMs: { $avg: "$responseAverageMs" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      ChatSessionMetric.countDocuments({ status: "open" }),
    ]);

    const overall = overallRows[0] || {
      sessions: 0,
      uniqueUsers: [],
      questions: 0,
      assistantResponses: 0,
      totalTokensInput: 0,
      totalTokensOutput: 0,
      totalResponseTimeMs: 0,
      totalDurationMs: 0,
      faqTurns: 0,
      documentsTurns: 0,
      closedSessions: 0,
      avgResponseTimeMs: 0,
    };

    const uniqueUsers = Array.isArray(overall.uniqueUsers)
      ? overall.uniqueUsers.length
      : 0;
    const averageQuestionsPerSession =
      overall.sessions > 0 ? overall.questions / overall.sessions : 0;
    const averageConversationDurationSeconds =
      overall.sessions > 0
        ? overall.totalDurationMs / overall.sessions / 1000
        : 0;
    const averageResponseTimeMs =
      typeof overall.avgResponseTimeMs === "number"
        ? overall.avgResponseTimeMs
        : 0;

    const daily = dailyRows.map((row) => {
      const uniqueUsersCount = Array.isArray(row.uniqueUsers)
        ? row.uniqueUsers.length
        : 0;
      const avgQuestionsPerSession =
        row.sessions > 0 ? row.questions / row.sessions : 0;
      const avgConversationDurationSeconds =
        row.sessions > 0 ? row.totalDurationMs / row.sessions / 1000 : 0;
      const avgResponseTime =
        typeof row.avgResponseTimeMs === "number" ? row.avgResponseTimeMs : 0;

      return {
        date: row._id as string,
        sessions: row.sessions,
        uniqueUsers: uniqueUsersCount,
        questions: row.questions,
        assistantResponses: row.assistantResponses,
        avgQuestionsPerSession,
        avgConversationDurationSeconds,
        avgResponseTimeMs: avgResponseTime,
        totalTokensInput: row.totalTokensInput,
        totalTokensOutput: row.totalTokensOutput,
        faqTurns: row.faqTurns,
        documentsTurns: row.documentsTurns,
      };
    });

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        days,
      },
      totals: {
        sessions: overall.sessions,
        uniqueUsers,
        openSessions,
        closedSessions: overall.closedSessions,
        questions: overall.questions,
        assistantResponses: overall.assistantResponses,
        avgQuestionsPerSession: averageQuestionsPerSession,
        avgConversationDurationSeconds: averageConversationDurationSeconds,
        avgResponseTimeMs: averageResponseTimeMs,
        totalTokensInput: overall.totalTokensInput,
        totalTokensOutput: overall.totalTokensOutput,
        faqTurns: overall.faqTurns,
        documentsTurns: overall.documentsTurns,
      },
      daily,
    };
  }

  async getFeedbackSummary(
    input: MetricsRangeInput = {},
  ): Promise<FeedbackSummary> {
    const range = resolveRange(input);
    const days = Math.max(
      1,
      Math.round((range.to.getTime() - range.from.getTime()) / 86400000) + 1,
    );

    const match = {
      createdAt: {
        $gte: range.from,
        $lte: range.to,
      },
    };

    const [overallRows, dailyRows, ratingRows, recentRows] = await Promise.all([
      ChatFeedback.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            feedbackCount: { $sum: 1 },
            averageScore: { $avg: "$score" },
            helpfulCount: {
              $sum: { $cond: [{ $eq: ["$helpful", true] }, 1, 0] },
            },
            resolvedCount: {
              $sum: { $cond: [{ $eq: ["$resolved", true] }, 1, 0] },
            },
            positiveCount: {
              $sum: { $cond: [{ $eq: ["$sentiment", "positive"] }, 1, 0] },
            },
            neutralCount: {
              $sum: { $cond: [{ $eq: ["$sentiment", "neutral"] }, 1, 0] },
            },
            negativeCount: {
              $sum: { $cond: [{ $eq: ["$sentiment", "negative"] }, 1, 0] },
            },
            accuracyCount: {
              $sum: { $cond: [{ $eq: ["$category", "accuracy"] }, 1, 0] },
            },
            clarityCount: {
              $sum: { $cond: [{ $eq: ["$category", "clarity"] }, 1, 0] },
            },
            speedCount: {
              $sum: { $cond: [{ $eq: ["$category", "speed"] }, 1, 0] },
            },
            completenessCount: {
              $sum: { $cond: [{ $eq: ["$category", "completeness"] }, 1, 0] },
            },
            toneCount: {
              $sum: { $cond: [{ $eq: ["$category", "tone"] }, 1, 0] },
            },
            otherCount: {
              $sum: { $cond: [{ $eq: ["$category", "other"] }, 1, 0] },
            },
          },
        },
      ]),
      ChatFeedback.aggregate([
        { $match: match },
        {
          $addFields: {
            dayKey: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: "UTC",
              },
            },
          },
        },
        {
          $group: {
            _id: "$dayKey",
            feedbackCount: { $sum: 1 },
            averageScore: { $avg: "$score" },
            helpfulCount: {
              $sum: { $cond: [{ $eq: ["$helpful", true] }, 1, 0] },
            },
            resolvedCount: {
              $sum: { $cond: [{ $eq: ["$resolved", true] }, 1, 0] },
            },
            positiveCount: {
              $sum: { $cond: [{ $eq: ["$sentiment", "positive"] }, 1, 0] },
            },
            neutralCount: {
              $sum: { $cond: [{ $eq: ["$sentiment", "neutral"] }, 1, 0] },
            },
            negativeCount: {
              $sum: { $cond: [{ $eq: ["$sentiment", "negative"] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      ChatFeedback.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$score",
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      ChatFeedback.find(match)
        .sort({ createdAt: -1 })
        .limit(10)
        .select(
          "sessionId userId route type score helpful resolved sentiment category comment tags createdAt",
        )
        .lean(),
    ]);

    const overall = overallRows[0] || {
      feedbackCount: 0,
      averageScore: null,
      helpfulCount: 0,
      resolvedCount: 0,
      positiveCount: 0,
      neutralCount: 0,
      negativeCount: 0,
      accuracyCount: 0,
      clarityCount: 0,
      speedCount: 0,
      completenessCount: 0,
      toneCount: 0,
      otherCount: 0,
    };

    const feedbackCount = overall.feedbackCount || 0;
    const helpfulRate =
      feedbackCount > 0 ? overall.helpfulCount / feedbackCount : null;
    const resolutionRate =
      feedbackCount > 0 ? overall.resolvedCount / feedbackCount : null;

    const categories: Record<FeedbackCategory, number> = {
      accuracy: overall.accuracyCount || 0,
      clarity: overall.clarityCount || 0,
      speed: overall.speedCount || 0,
      completeness: overall.completenessCount || 0,
      tone: overall.toneCount || 0,
      other: overall.otherCount || 0,
    };

    const daily = dailyRows.map((row) => {
      const count = row.feedbackCount || 0;
      return {
        date: row._id as string,
        feedbackCount: count,
        averageScore: row.averageScore ?? null,
        helpfulRate: count > 0 ? row.helpfulCount / count : null,
        resolutionRate: count > 0 ? row.resolvedCount / count : null,
        positiveCount: row.positiveCount || 0,
        neutralCount: row.neutralCount || 0,
        negativeCount: row.negativeCount || 0,
      };
    });

    const ratingDistribution = Array.from({ length: 5 }, (_, index) => {
      const score = index + 1;
      const matchRow = ratingRows.find((row) => row._id === score);
      return {
        score,
        count: matchRow?.count || 0,
      };
    });

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        days,
      },
      totals: {
        feedbackCount,
        averageScore: overall.averageScore ?? null,
        helpfulCount: overall.helpfulCount || 0,
        helpfulRate,
        resolvedCount: overall.resolvedCount || 0,
        resolutionRate,
        positiveCount: overall.positiveCount || 0,
        neutralCount: overall.neutralCount || 0,
        negativeCount: overall.negativeCount || 0,
        categories,
      },
      ratingDistribution,
      daily,
      recent: recentRows,
    };
  }

  async getOverview(
    input: MetricsRangeInput = {},
  ): Promise<{
    usage: UsageSummary;
    feedback: FeedbackSummary;
  }> {
    const [usage, feedback] = await Promise.all([
      this.getUsageSummary(input),
      this.getFeedbackSummary(input),
    ]);

    return {
      usage,
      feedback,
    };
  }
}

export const metricsRepository = new MetricsRepository();
