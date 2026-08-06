/**
 * API REST Server para UConnect
 * Expone el chatbot y datos académicos para consumo desde frontend
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { randomUUID } from "crypto";
import {
  database,
  chatRepository,
  metricsRepository,
  pepRepository,
  pepParserService,
  pepUploadService,
  gptAgentService,
  gptVectorStoreService,
  faqService,
  faqKbAdminService,
} from "../services";
import { logger } from "../utils";
import multer from "multer";
import { ADMISSION_GUIDED_QUESTIONS } from "../config/prompts";
import { createAdminAuthMiddleware } from "./admin-auth";

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

// ============================================
// MIDDLEWARE
// ============================================

// Seguridad básica
app.use(helmet());

// CORS
app.use(
  cors({
    origin: CORS_ORIGIN,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Parse JSON
app.use(express.json({ limit: "10kb" }));

// Rate limiting para el chat (30 req/min)
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30,
  message: {
    error: true,
    code: "RATE_LIMIT",
    message: "Demasiadas solicitudes. Intenta de nuevo en un minuto.",
  },
});

// Logging de requests
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`, {
    query: req.query,
    ip: req.ip,
  });
  next();
});

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
});

// ============================================
// HEALTH CHECK
// ============================================

app.get("/api/health", async (_req: Request, res: Response) => {
  const dbConnected = database.getConnectionStatus();
  try {
    const gptAvailable = await gptAgentService.isAvailable();

    res.json({
      status: dbConnected ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        database: dbConnected ? "connected" : "disconnected",
        gpt: gptAvailable ? "available" : "unavailable",
      },
    });
  } catch (error) {
    res.status(503).json({
      status: "degraded",
      timestamp: new Date().toISOString(),
      services: {
        database: "unknown",
        gpt: "unknown",
      },
    });
  }
});

function normalizeOptionalId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeMetricsDays(value: unknown, fallback = 30): number {
  if (typeof value !== "string" && typeof value !== "number") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(Math.max(Math.trunc(parsed), 1), 365);
}

function normalizeFeedbackCategory(
  value: unknown,
): import("../models").FeedbackCategory {
  const allowed = new Set([
    "accuracy",
    "clarity",
    "speed",
    "completeness",
    "tone",
    "other",
  ]);

  if (typeof value !== "string") return "other";

  const normalized = value.trim().toLowerCase();
  return allowed.has(normalized) ? (normalized as import("../models").FeedbackCategory) : "other";
}

function parseBooleanLike(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "si", "sí"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return undefined;
}

async function trackConversationTurnSafe(input: {
  sessionId: string;
  userId?: string;
  route: "faq" | "documents" | "general";
  tokensUsed?: { input: number; output: number };
  responseTimeMs?: number;
}) {
  try {
    await metricsRepository.trackConversationTurn(input);
  } catch (error) {
    logger.warn("No se pudieron registrar métricas de conversación", {
      error: (error as Error).message,
      sessionId: input.sessionId,
    });
  }
}

async function ensureSessionMetricsSafe(
  sessionId: string,
  userId?: string,
) {
  try {
    await metricsRepository.ensureSession(sessionId, userId);
  } catch (error) {
    logger.warn("No se pudieron inicializar métricas de sesión", {
      error: (error as Error).message,
      sessionId,
    });
  }
}

// ============================================
// ESTADÍSTICAS
// ============================================

app.get("/api/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await chatRepository.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: true,
      code: "INTERNAL_ERROR",
      message: "Error obteniendo estadísticas",
    });
  }
});

// ============================================
// CHAT ENDPOINTS
// ============================================

// Crear nueva sesión
async function getSuggestedQuestionsSafe(): Promise<string[]> {
  try {
    const featured = await faqService.listByTier("featured");
    const questions = featured
      .map((q) => q.question)
      .filter(Boolean)
      .slice(0, 3);

    return questions.length > 0 ? questions : ADMISSION_GUIDED_QUESTIONS;
  } catch {
    return ADMISSION_GUIDED_QUESTIONS;
  }
}

app.post("/api/chat/session", async (_req: Request, res: Response) => {
  const sessionId = randomUUID();
  const userId = sessionId;
  await chatRepository.getOrCreateChat(sessionId, userId);
  await ensureSessionMetricsSafe(sessionId, userId);
  const suggestedQuestions = await getSuggestedQuestionsSafe();
  res.status(201).json({
    sessionId,
    userId,
    suggestedQuestions,
  });
});

// Enviar mensaje al chat
app.post("/api/chat", chatLimiter, async (req: Request, res: Response) => {
  try {
    const { sessionId, message, userId } = req.body;

    // Validaciones
    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: true,
        code: "INVALID_REQUEST",
        message: "El campo 'message' es requerido",
      });
    }

    if (message.length > 1000) {
      return res.status(400).json({
        error: true,
        code: "MESSAGE_TOO_LONG",
        message: "El mensaje no puede exceder 1000 caracteres",
      });
    }

    const requestedSessionId = normalizeOptionalId(sessionId);
    const requestedUserId = normalizeOptionalId(userId);

    const activeSessionId =
      requestedSessionId || requestedUserId || randomUUID();
    const activeUserId = requestedUserId || activeSessionId;

    await chatRepository.getOrCreateChat(activeSessionId, activeUserId);
    await ensureSessionMetricsSafe(activeSessionId, activeUserId);
    const trimmedMessage = message.trim();
    const startedAt = Date.now();

    const faqMatch = await faqService.match(trimmedMessage);
    if (faqMatch) {
      await chatRepository.addMessage(activeSessionId, "user", trimmedMessage);
      await chatRepository.addMessage(
        activeSessionId,
        "assistant",
        faqMatch.answer,
        {
          sources: ["FAQ"],
        },
      );

      await trackConversationTurnSafe({
        sessionId: activeSessionId,
        userId: activeUserId,
        route: "faq",
        responseTimeMs: Date.now() - startedAt,
        tokensUsed: { input: 0, output: 0 },
      });

      return res.json({
        sessionId: activeSessionId,
        userId: activeUserId,
        response: {
          message: faqMatch.answer,
          tokensUsed: { input: 0, output: 0 },
          engine: "local-chat",
          route: "general",
        },
      });
    }

    const history = await chatRepository.getHistory(
      activeSessionId,
      10,
    );
    const gptResult = await gptAgentService.processQuery(trimmedMessage, {
      sessionId: activeSessionId,
      history,
    });

    await chatRepository.addMessage(activeSessionId, "user", trimmedMessage);
    await chatRepository.addMessage(
      activeSessionId,
      "assistant",
      gptResult.response,
      {
        sources: gptResult.documents.map((doc) => doc.filename),
      },
    );

    await trackConversationTurnSafe({
      sessionId: activeSessionId,
      userId: activeUserId,
      route: "documents",
      responseTimeMs: Date.now() - startedAt,
      tokensUsed: { input: 0, output: 0 },
    });

    res.json({
      sessionId: activeSessionId,
      userId: activeUserId,
      response: {
        message: gptResult.response,
        engine: "gpt-rag",
        route: "documents",
      },
    });
  } catch (error) {
    logger.error("Error en /api/chat", { error: (error as Error).message });

    res.status(500).json({
      error: true,
      code: "INTERNAL_ERROR",
      message: "Error procesando el mensaje. Intenta de nuevo.",
    });
  }
});

// Obtener historial de chat
app.get("/api/chat/:sessionId/history", async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId as string;
    const limitRaw = Array.isArray(req.query.limit)
      ? req.query.limit[0]
      : req.query.limit;
    const limit = parseInt(limitRaw as string) || 50;

    const messages = await chatRepository.getHistory(sessionId, limit);

    if (!messages || messages.length === 0) {
      return res.status(404).json({
        error: true,
        code: "SESSION_NOT_FOUND",
        message: "Sesión no encontrada o sin mensajes",
      });
    }

    res.json({
      sessionId,
      messages,
    });
  } catch (error) {
    logger.error("Error en /api/chat/:sessionId/history", {
      error: (error as Error).message,
    });

    res.status(500).json({
      error: true,
      code: "INTERNAL_ERROR",
      message: "Error obteniendo historial",
    });
  }
});

// Finalizar sesión
app.delete("/api/chat/:sessionId", async (req: Request, res: Response) => {
  try {
    const sessionId = Array.isArray(req.params.sessionId)
      ? req.params.sessionId[0]
      : req.params.sessionId;

    await metricsRepository.closeSession(sessionId);

    res.json({
      message: "Sesión finalizada correctamente",
    });
  } catch (error) {
    res.status(500).json({
      error: true,
      code: "INTERNAL_ERROR",
      message: "Error finalizando sesión",
    });
  }
});

app.post(
  "/api/chat/:sessionId/feedback",
  async (req: Request, res: Response) => {
    try {
      const sessionParam = Array.isArray(req.params.sessionId)
        ? req.params.sessionId[0]
        : req.params.sessionId;
      const sessionId = String(sessionParam || "").trim();
      if (!sessionId) {
        return res.status(400).json({
          error: true,
          code: "INVALID_REQUEST",
          message: "El parámetro 'sessionId' es requerido",
        });
      }

      const userId = normalizeOptionalId(req.body?.userId);
      const scoreRaw = req.body?.score ?? req.body?.rating;
      const score =
        typeof scoreRaw === "number"
          ? scoreRaw
          : typeof scoreRaw === "string"
            ? Number(scoreRaw)
            : undefined;
      const helpful = parseBooleanLike(req.body?.helpful);
      const resolved = parseBooleanLike(req.body?.resolved) ?? false;
      const comment =
        typeof req.body?.comment === "string"
          ? req.body.comment.trim()
          : undefined;
      const category = normalizeFeedbackCategory(req.body?.category);
      const tags = Array.isArray(req.body?.tags)
        ? req.body.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean)
        : [];
      const routeRaw = req.body?.route;
      const providedRoute =
        typeof routeRaw === "string" &&
        ["faq", "documents", "general"].includes(routeRaw.trim().toLowerCase())
          ? (routeRaw.trim().toLowerCase() as "faq" | "documents" | "general")
          : undefined;
      const sessionMetric = await metricsRepository.findSessionMetric(sessionId);
      const route = providedRoute ?? sessionMetric?.lastRoute ?? "general";
      const effectiveUserId = userId || sessionMetric?.userId;

      const hasCommentSignal = typeof comment === "string" && comment.length > 0;
      if (
        typeof score !== "number" &&
        typeof helpful !== "boolean" &&
        !hasCommentSignal &&
        typeof req.body?.resolved !== "boolean" &&
        typeof req.body?.resolved !== "string"
      ) {
        return res.status(400).json({
          error: true,
          code: "INVALID_REQUEST",
          message:
            "Debes enviar al menos una señal de feedback: 'score', 'helpful', 'resolved' o 'comment'",
        });
      }

      if (typeof score === "number" && (score < 1 || score > 5)) {
        return res.status(400).json({
          error: true,
          code: "INVALID_REQUEST",
          message: "El campo 'score' debe estar entre 1 y 5",
        });
      }

      if (comment && comment.length > 1000) {
        return res.status(400).json({
          error: true,
          code: "COMMENT_TOO_LONG",
          message: "El comentario no puede exceder 1000 caracteres",
        });
      }

      const feedback = await metricsRepository.recordFeedback({
        sessionId,
        userId: effectiveUserId,
        route,
        score,
        helpful,
        resolved,
        category,
        comment,
        tags,
      });

      res.status(201).json({
        message: "Feedback registrado correctamente",
        data: feedback,
      });
    } catch (error) {
      logger.error("Error en POST /api/chat/:sessionId/feedback", {
        error: (error as Error).message,
      });
      res.status(500).json({
        error: true,
        code: "INTERNAL_ERROR",
        message: "Error registrando feedback",
      });
    }
  },
);

// ============================================
// FAQ ENDPOINTS (Banco de preguntas)
// ============================================

// Listar preguntas frecuentes disponibles (featured + faq)
app.get("/api/faq/questions", async (req: Request, res: Response) => {
  try {
    const includeArchiveRaw = req.query.includeArchive;
    const includeArchiveValue = Array.isArray(includeArchiveRaw)
      ? includeArchiveRaw[0]
      : includeArchiveRaw;
    const includeArchive =
      includeArchiveValue === undefined
        ? true
        : includeArchiveValue === "true" || includeArchiveValue === "1";

    const [featured, faq, archive] = await Promise.all([
      faqService.listByTier("featured"),
      faqService.listByTier("faq"),
      includeArchive ? faqService.listByTier("archive") : Promise.resolve([]),
    ]);

    res.json(
      includeArchive
        ? {
            featured,
            faq,
            archive,
            total: featured.length + faq.length + archive.length,
          }
        : {
            featured,
            faq,
            total: featured.length + faq.length,
          },
    );
  } catch (error) {
    logger.error("Error en GET /api/faq/questions", {
      error: (error as Error).message,
    });
    res.status(503).json({
      error: true,
      code: "FAQ_KB_UNAVAILABLE",
      message:
        "Banco de preguntas no disponible. Verifica configuración de OpenAI y el archivo FAQ KB en el Vector Store.",
    });
  }
});

// Buscar preguntas frecuentes por texto (retorna top N con score)
app.get("/api/faq/search", async (req: Request, res: Response) => {
  try {
    const q = req.query.q;

    if (!q || typeof q !== "string") {
      return res.status(400).json({
        error: true,
        code: "INVALID_REQUEST",
        message: "El parámetro 'q' es requerido",
      });
    }

    if (q.length > 200) {
      return res.status(400).json({
        error: true,
        code: "QUERY_TOO_LONG",
        message: "El parámetro 'q' no puede exceder 200 caracteres",
      });
    }

    const limitRaw = req.query.limit;
    const limit = typeof limitRaw === "string" ? parseInt(limitRaw, 10) : 5;

    const results = await faqService.search(q, limit);

    res.json({
      query: q,
      results,
      total: results.length,
    });
  } catch (error) {
    logger.error("Error en GET /api/faq/search", {
      error: (error as Error).message,
    });

    res.status(503).json({
      error: true,
      code: "FAQ_KB_UNAVAILABLE",
      message:
        "Banco de preguntas no disponible. Verifica configuración de OpenAI y el archivo FAQ KB en el Vector Store.",
    });
  }
});

// Obtener respuesta de una pregunta FAQ por id
app.get("/api/faq/:questionId", async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;
    const id = Array.isArray(questionId) ? questionId[0] : questionId;

    const faq = await faqService.findById(id);

    if (!faq) {
      return res.status(404).json({
        error: true,
        code: "QUESTION_NOT_FOUND",
        message: `No se encontró respuesta para la pregunta: ${id}`,
      });
    }

    res.json({
      id,
      answer: faq.answer,
      cached: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error en GET /api/faq/:questionId", {
      error: (error as Error).message,
    });
    res.status(503).json({
      error: true,
      code: "FAQ_KB_UNAVAILABLE",
      message:
        "Banco de preguntas no disponible. Verifica configuración de OpenAI y el archivo FAQ KB en el Vector Store.",
    });
  }
});

// ============================================
// GPT AGENT ENDPOINT (RAG con OpenAI)
// ============================================

// Enviar mensaje al GPT Agent
app.post("/api/gpt/chat", chatLimiter, async (req: Request, res: Response) => {
  try {
    const { message, sessionId, userId } = req.body;

    // Validaciones
    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: true,
        code: "INVALID_REQUEST",
        message: "El campo 'message' es requerido",
      });
    }

    if (message.length > 1000) {
      return res.status(400).json({
        error: true,
        code: "MESSAGE_TOO_LONG",
        message: "El mensaje no puede exceder 1000 caracteres",
      });
    }

    const requestedSessionId = normalizeOptionalId(sessionId);
    const requestedUserId = normalizeOptionalId(userId);
    const activeSessionId =
      requestedSessionId || requestedUserId || randomUUID();
    const activeUserId = requestedUserId || activeSessionId;
    const trimmedMessage = message.trim();

    await chatRepository.getOrCreateChat(activeSessionId, activeUserId);
    await ensureSessionMetricsSafe(activeSessionId, activeUserId);
    const history = await chatRepository.getHistory(activeSessionId, 10);
    const startedAt = Date.now();

    // Procesar con GPT Agent
    const result = await gptAgentService.processQuery(trimmedMessage, {
      sessionId: activeSessionId,
      history,
    });

    await chatRepository.addMessage(activeSessionId, "user", trimmedMessage);
    await chatRepository.addMessage(
      activeSessionId,
      "assistant",
      result.response,
      {
        sources: result.documents.map((doc) => doc.filename),
      },
    );

    await trackConversationTurnSafe({
      sessionId: activeSessionId,
      userId: activeUserId,
      route: "documents",
      responseTimeMs: Date.now() - startedAt,
      tokensUsed: { input: 0, output: 0 },
    });

    res.json({
      sessionId: activeSessionId,
      userId: activeUserId,
      response: result.response,
    });
  } catch (error) {
    logger.error("Error en /api/gpt/chat", { error: (error as Error).message });

    res.status(500).json({
      error: true,
      code: "INTERNAL_ERROR",
      message: "Error procesando el mensaje con GPT. Intenta de nuevo.",
    });
  }
});

// Verificar disponibilidad de GPT
app.get("/api/gpt/health", async (_req: Request, res: Response) => {
  try {
    const available = await gptAgentService.isAvailable();
    res.json({
      status: available ? "available" : "unavailable",
      provider: "openai",
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      provider: "openai",
    });
  }
});

// ============================================
// ADMIN - PEP (Perfil de Programa)
// ============================================

// Proteger todo /api/admin/* (auth + rol admin)
app.use("/api/admin", createAdminAuthMiddleware());

app.get("/api/admin/metrics/usage", async (req: Request, res: Response) => {
  try {
    const days = normalizeMetricsDays(req.query.days, 30);
    const usage = await metricsRepository.getUsageSummary({ days });
    res.json(usage);
  } catch (error) {
    logger.error("Error en GET /api/admin/metrics/usage", {
      error: (error as Error).message,
    });
    res.status(500).json({
      error: true,
      code: "INTERNAL_ERROR",
      message: "Error obteniendo métricas de uso",
    });
  }
});

app.get("/api/admin/metrics/feedback", async (req: Request, res: Response) => {
  try {
    const days = normalizeMetricsDays(req.query.days, 30);
    const feedback = await metricsRepository.getFeedbackSummary({ days });
    res.json(feedback);
  } catch (error) {
    logger.error("Error en GET /api/admin/metrics/feedback", {
      error: (error as Error).message,
    });
    res.status(500).json({
      error: true,
      code: "INTERNAL_ERROR",
      message: "Error obteniendo métricas de feedback",
    });
  }
});

app.get("/api/admin/metrics", async (req: Request, res: Response) => {
  try {
    const days = normalizeMetricsDays(req.query.days, 30);
    const overview = await metricsRepository.getOverview({ days });
    res.json(overview);
  } catch (error) {
    logger.error("Error en GET /api/admin/metrics", {
      error: (error as Error).message,
    });
    res.status(500).json({
      error: true,
      code: "INTERNAL_ERROR",
      message: "Error obteniendo métricas",
    });
  }
});

// Parser JSON más grande solo para admin
const adminJsonParser = express.json({ limit: "500kb" });

// Parser para FAQ admin (respuestas pueden ser largas)
const adminFaqJsonParser = express.json({ limit: "200kb" });

// Crear o actualizar PEP (texto plano -> parseado a JSON)
app.post(
  "/api/admin/pep",
  adminJsonParser,
  async (req: Request, res: Response) => {
    try {
      const { programaId, programaNombre, contenido } = req.body;

      // Validaciones
      if (!programaId || typeof programaId !== "string") {
        return res.status(400).json({
          error: true,
          code: "INVALID_REQUEST",
          message: "El campo 'programaId' es requerido",
        });
      }

      if (!programaNombre || typeof programaNombre !== "string") {
        return res.status(400).json({
          error: true,
          code: "INVALID_REQUEST",
          message: "El campo 'programaNombre' es requerido",
        });
      }

      if (!contenido || typeof contenido !== "string") {
        return res.status(400).json({
          error: true,
          code: "INVALID_REQUEST",
          message: "El campo 'contenido' (texto plano del PEP) es requerido",
        });
      }

      // Parsear texto a JSON
      const pepProfile = pepParserService.parse(
        contenido,
        programaId,
        programaNombre,
      );

      // Guardar en MongoDB
      const saved = await pepRepository.upsert(pepProfile);

      logger.info("PEP guardado", {
        programaId,
        programaNombre,
      });

      res.status(201).json({
        message: "PEP guardado correctamente",
        data: saved,
      });
    } catch (error) {
      logger.error("Error en POST /api/admin/pep", {
        error: (error as Error).message,
      });

      res.status(500).json({
        error: true,
        code: "INTERNAL_ERROR",
        message: "Error guardando PEP",
      });
    }
  },
);

// Obtener PEP por programaId
app.get("/api/admin/pep/:programaId", async (req: Request, res: Response) => {
  try {
    const { programaId } = req.params;

    // Asegurar que programaId sea string
    const id = Array.isArray(programaId) ? programaId[0] : programaId;
    const pep = await pepRepository.findByProgramaId(id);

    if (!pep) {
      return res.status(404).json({
        error: true,
        code: "PEP_NOT_FOUND",
        message: `No existe PEP para el programa: ${programaId}`,
      });
    }

    res.json({ data: pep });
  } catch (error) {
    logger.error("Error en GET /api/admin/pep/:programaId", {
      error: (error as Error).message,
    });

    res.status(500).json({
      error: true,
      code: "INTERNAL_ERROR",
      message: "Error obteniendo PEP",
    });
  }
});

// Listar todos los PEPs
app.get("/api/admin/peps", async (_req: Request, res: Response) => {
  try {
    const peps = await pepRepository.findAll();

    res.json({
      data: peps,
      total: peps.length,
    });
  } catch (error) {
    logger.error("Error en GET /api/admin/peps", {
      error: (error as Error).message,
    });

    res.status(500).json({
      error: true,
      code: "INTERNAL_ERROR",
      message: "Error obteniendo PEPs",
    });
  }
});

// Eliminar PEP
app.delete(
  "/api/admin/pep/:programaId",
  async (req: Request, res: Response) => {
    try {
      const { programaId } = req.params;

      // Asegurar que programaId sea string
      const id = Array.isArray(programaId) ? programaId[0] : programaId;
      const deleted = await pepRepository.deleteByProgramaId(id);

      if (!deleted) {
        return res.status(404).json({
          error: true,
          code: "PEP_NOT_FOUND",
          message: `No existe PEP para el programa: ${programaId}`,
        });
      }

      logger.info("PEP eliminado", { programaId });

      res.json({
        message: "PEP eliminado correctamente",
      });
    } catch (error) {
      logger.error("Error en DELETE /api/admin/pep/:programaId", {
        error: (error as Error).message,
      });

      res.status(500).json({
        error: true,
        code: "INTERNAL_ERROR",
        message: "Error eliminando PEP",
      });
    }
  },
);

// ============================================
// ADMIN - PEP UPLOADS (Textract + S3)
// ============================================

// Inicializar carga masiva (genera URLs pre-firmadas)
app.post(
  "/api/admin/pep-uploads/init",
  adminJsonParser,
  async (req: Request, res: Response) => {
    try {
      const { files } = req.body;

      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({
          error: true,
          code: "INVALID_REQUEST",
          message: "El campo 'files' debe ser un array con al menos 1 archivo",
        });
      }

      for (const file of files) {
        if (!file?.fileName || !file?.contentType) {
          return res.status(400).json({
            error: true,
            code: "INVALID_REQUEST",
            message: "Cada archivo debe incluir 'fileName' y 'contentType'",
          });
        }
      }

      const result = await pepUploadService.initUpload(files);

      res.status(201).json({
        message: "Upload inicializado",
        data: result,
      });
    } catch (error) {
      logger.error("Error en POST /api/admin/pep-uploads/init", {
        error: (error as Error).message,
      });

      res.status(500).json({
        error: true,
        code: "INTERNAL_ERROR",
        message: "Error inicializando upload",
      });
    }
  },
);

// Completar carga masiva (asigna programaId y dispara procesamiento)
app.post(
  "/api/admin/pep-uploads/complete",
  adminJsonParser,
  async (req: Request, res: Response) => {
    try {
      const { uploadId, mappings } = req.body;

      if (!uploadId || typeof uploadId !== "string") {
        return res.status(400).json({
          error: true,
          code: "INVALID_REQUEST",
          message: "El campo 'uploadId' es requerido",
        });
      }

      if (!Array.isArray(mappings) || mappings.length === 0) {
        return res.status(400).json({
          error: true,
          code: "INVALID_REQUEST",
          message: "El campo 'mappings' debe ser un array con al menos 1 item",
        });
      }

      const upload = await pepUploadService.completeUpload(uploadId, mappings);

      res.json({
        message: "Procesamiento iniciado",
        data: upload,
      });
    } catch (error) {
      logger.error("Error en POST /api/admin/pep-uploads/complete", {
        error: (error as Error).message,
      });

      res.status(500).json({
        error: true,
        code: "INTERNAL_ERROR",
        message: "Error completando upload",
      });
    }
  },
);

// Consultar estado de carga masiva
app.get(
  "/api/admin/pep-uploads/:uploadId",
  async (req: Request, res: Response) => {
    try {
      const { uploadId } = req.params;

      // Asegurar que uploadId sea string
      const id = Array.isArray(uploadId) ? uploadId[0] : uploadId;
      const upload = await pepUploadService.getUpload(id);

      if (!upload) {
        return res.status(404).json({
          error: true,
          code: "UPLOAD_NOT_FOUND",
          message: `No existe upload con ID: ${uploadId}`,
        });
      }

      res.json({ data: upload });
    } catch (error) {
      logger.error("Error en GET /api/admin/pep-uploads/:uploadId", {
        error: (error as Error).message,
      });

      res.status(500).json({
        error: true,
        code: "INTERNAL_ERROR",
        message: "Error obteniendo estado del upload",
      });
    }
  },
);

// ============================================
// ADMIN - GPT VECTOR STORE
// ============================================

// ============================================
// ADMIN - FAQ KB (CRUD)
// ============================================

// Obtener el KB actual (entries) + metadata del archivo seleccionado
app.get("/api/admin/faq-kb", async (req: Request, res: Response) => {
  try {
    const forceRefreshRaw = req.query.forceRefresh;
    const forceRefreshValue = Array.isArray(forceRefreshRaw)
      ? forceRefreshRaw[0]
      : forceRefreshRaw;
    const forceRefresh =
      forceRefreshValue === "true" || forceRefreshValue === "1";

    const kb = await faqKbAdminService.getKb({ forceRefresh });
    res.json(kb);
  } catch (error) {
    logger.error("Error en GET /api/admin/faq-kb", {
      error: (error as Error).message,
    });

    res.status(503).json({
      error: true,
      code: "FAQ_KB_UNAVAILABLE",
      message:
        "Banco de preguntas no disponible. Verifica configuración de OpenAI y el archivo FAQ KB en el Vector Store.",
    });
  }
});

// Crear una nueva FAQ entry (sube un KB nuevo)
app.post(
  "/api/admin/faq-kb/entries",
  adminFaqJsonParser,
  async (req: Request, res: Response) => {
    try {
      const { tier, category, question, questions, answer, id, source } =
        req.body || {};

      const created = await faqKbAdminService.createEntry({
        id,
        tier,
        category,
        question,
        questions,
        answer,
        source,
      });

      res.status(201).json({
        message: "FAQ creada correctamente",
        file: created.file,
        entry: created.entry,
      });
    } catch (error) {
      const message = (error as Error).message;
      logger.error("Error en POST /api/admin/faq-kb/entries", {
        error: message,
      });

      // Errores de validación/negocio -> 400
      const isValidation =
        message.includes("requerido") ||
        message.includes("Debe") ||
        message.includes("debe") ||
        message.includes("Ya existe") ||
        message.includes("tier");

      res.status(isValidation ? 400 : 503).json({
        error: true,
        code: isValidation ? "INVALID_REQUEST" : "FAQ_KB_UNAVAILABLE",
        message: isValidation
          ? message
          : "Banco de preguntas no disponible. Verifica configuración de OpenAI y el archivo FAQ KB en el Vector Store.",
      });
    }
  },
);

// Actualizar una FAQ entry por id (sube un KB nuevo)
app.patch(
  "/api/admin/faq-kb/entries/:id",
  adminFaqJsonParser,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const safeId = Array.isArray(id) ? id[0] : id;

      const { tier, category, question, questions, answer, source, isActive } =
        req.body || {};

      const updated = await faqKbAdminService.updateEntry(safeId, {
        tier,
        category,
        question,
        questions,
        answer,
        source,
        isActive,
      });

      res.json({
        message: "FAQ actualizada correctamente",
        file: updated.file,
        entry: updated.entry,
      });
    } catch (error) {
      const message = (error as Error).message;
      logger.error("Error en PATCH /api/admin/faq-kb/entries/:id", {
        error: message,
      });

      const isNotFound = message.includes("No existe una FAQ");
      const isValidation =
        isNotFound ||
        message.includes("requerido") ||
        message.includes("Debe") ||
        message.includes("debe") ||
        message.includes("tier");

      if (isNotFound) {
        return res.status(404).json({
          error: true,
          code: "QUESTION_NOT_FOUND",
          message,
        });
      }

      res.status(isValidation ? 400 : 503).json({
        error: true,
        code: isValidation ? "INVALID_REQUEST" : "FAQ_KB_UNAVAILABLE",
        message: isValidation
          ? message
          : "Banco de preguntas no disponible. Verifica configuración de OpenAI y el archivo FAQ KB en el Vector Store.",
      });
    }
  },
);

// Eliminar una FAQ entry por id (soft delete: isActive=false; sube un KB nuevo)
app.delete(
  "/api/admin/faq-kb/entries/:id",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const safeId = Array.isArray(id) ? id[0] : id;
      await faqKbAdminService.deleteEntry(safeId);
      res.status(204).send();
    } catch (error) {
      const message = (error as Error).message;
      logger.error("Error en DELETE /api/admin/faq-kb/entries/:id", {
        error: message,
      });

      const isNotFound = message.includes("No existe una FAQ");
      if (isNotFound) {
        return res.status(404).json({
          error: true,
          code: "QUESTION_NOT_FOUND",
          message,
        });
      }

      res.status(503).json({
        error: true,
        code: "FAQ_KB_UNAVAILABLE",
        message:
          "Banco de preguntas no disponible. Verifica configuración de OpenAI y el archivo FAQ KB en el Vector Store.",
      });
    }
  },
);

// Listar vector store files (incluye status + attributes)
app.get(
  "/api/admin/vector-store/vector-files",
  async (_req: Request, res: Response) => {
    try {
      const files = await gptVectorStoreService.listVectorStoreFiles();
      res.json({
        data: files,
        total: files.length,
      });
    } catch (error) {
      logger.error("Error en GET /api/admin/vector-store/vector-files", {
        error: (error as Error).message,
      });
      res.status(500).json({
        error: true,
        code: "INTERNAL_ERROR",
        message: "Error listando vector store files",
      });
    }
  },
);

// Listar archivos en el Vector Store
app.get(
  "/api/admin/vector-store/files",
  async (_req: Request, res: Response) => {
    try {
      const files = await gptVectorStoreService.listFiles();
      res.json({
        data: files,
        total: files.length,
      });
    } catch (error) {
      logger.error("Error en GET /api/admin/vector-store/files", {
        error: (error as Error).message,
      });
      res.status(500).json({
        error: true,
        code: "INTERNAL_ERROR",
        message: "Error listando archivos del Vector Store",
      });
    }
  },
);

// Subir un archivo al Vector Store
app.post(
  "/api/admin/vector-store/files",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: true,
          code: "INVALID_REQUEST",
          message:
            "No se ha subido ningún archivo. Asegúrate de usar el campo 'file'.",
        });
      }

      const kindRaw = req.query.kind ?? req.body.kind;
      const kindValue = Array.isArray(kindRaw) ? kindRaw[0] : kindRaw;
      const kind = typeof kindValue === "string" ? kindValue.trim() : "";

      const fileObject = await gptVectorStoreService.uploadAndPoll(
        req.file.buffer,
        req.file.originalname,
        kind ? { attributes: { kind } } : undefined,
      );

      res.status(201).json({
        message: "Archivo subido y procesado correctamente.",
        kind: kind || undefined,
        data: fileObject,
      });
    } catch (error) {
      logger.error("Error en POST /api/admin/vector-store/files", {
        error: (error as Error).message,
      });
      res.status(500).json({
        error: true,
        code: "INTERNAL_ERROR",
        message: "Error subiendo archivo al Vector Store.",
      });
    }
  },
);

// Eliminar un archivo del Vector Store
app.delete(
  "/api/admin/vector-store/files/:fileId",
  async (req: Request, res: Response) => {
    try {
      const { fileId } = req.params;
      const id = Array.isArray(fileId) ? fileId[0] : fileId;
      await gptVectorStoreService.deleteFile(id);
      res.status(204).send();
    } catch (error) {
      logger.error("Error en DELETE /api/admin/vector-store/files/:fileId", {
        error: (error as Error).message,
      });
      res.status(500).json({
        error: true,
        code: "INTERNAL_ERROR",
        message: "Error eliminando archivo del Vector Store.",
      });
    }
  },
);

// ============================================
// 404 HANDLER
// ============================================

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: true,
    code: "NOT_FOUND",
    message: "Endpoint no encontrado",
  });
});

// ============================================
// ERROR HANDLER
// ============================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("Error no manejado", { error: err.message, stack: err.stack });

  res.status(500).json({
    error: true,
    code: "INTERNAL_ERROR",
    message: "Error interno del servidor",
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

async function startServer() {
  try {
    console.log("\n🚀 Iniciando UConnect API Server...\n");

    // Inicializar conexión a MongoDB para repositorios de chat/FAQ.
    await database.connect();

    // Iniciar servidor HTTP
    app.listen(PORT, () => {
      console.log(`
🎓 ========================================
   UCONNECT API - Universidad de Córdoba
========================================

✅ Servidor corriendo en: http://localhost:${PORT}
📚 Chat y FAQ: vector store + GPT

Endpoints disponibles:
  POST   /api/chat              - Enviar mensaje al chat GPT + vector store
  POST   /api/chat/session      - Crear nueva sesión
  GET    /api/chat/:id/history  - Historial de chat
  DELETE /api/chat/:id          - Finalizar sesión

FAQ (Preguntas Frecuentes Cacheadas):
  GET    /api/faq/questions     - Listar preguntas (featured + selector)
  GET    /api/faq/search        - Buscar preguntas por texto
  GET    /api/faq/:id           - Obtener respuesta cacheada

GPT Agent (OpenAI RAG):
  POST   /api/gpt/chat          - Enviar mensaje al GPT Agent
  GET    /api/gpt/health        - Estado del servicio GPT
  
Admin:
  GET    /api/stats             - Estadísticas
  GET    /api/health            - Health check
  POST   /api/admin/pep         - Crear/actualizar PEP
  GET    /api/admin/faq-kb       - Ver KB (admin)
  POST   /api/admin/faq-kb/entries - Crear FAQ (admin)
  PATCH  /api/admin/faq-kb/entries/:id - Editar FAQ (admin)
  DELETE /api/admin/faq-kb/entries/:id - Eliminar FAQ (admin)
  POST   /api/admin/vector-store/files - Subir documento
  GET    /api/admin/vector-store/files - Listar documentos
  DELETE /api/admin/vector-store/files/:id - Eliminar documento

CORS habilitado para: ${CORS_ORIGIN}
      `);
    });

    // Graceful shutdown
    process.on("SIGINT", async () => {
      console.log("\n\n⏳ Cerrando servidor...");
      await database.disconnect();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await database.disconnect();
      process.exit(0);
    });
  } catch (error) {
    logger.error("Error iniciando servidor", {
      error: (error as Error).message,
    });
    process.exit(1);
  }
}

// Ejecutar si es el archivo principal
startServer();

export { app };
