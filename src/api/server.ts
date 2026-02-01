/**
 * API REST Server para UConnect
 * Expone el chatbot y datos académicos para consumo desde frontend
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { chatbot } from "../chatbot";
import { localDataService } from "../services/local-data.service";
import { chatRepository } from "../services";
import { logger } from "../utils";

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
    methods: ["GET", "POST", "DELETE"],
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

// ============================================
// HEALTH CHECK
// ============================================

app.get("/api/health", async (_req: Request, res: Response) => {
  try {
    const ollamaAvailable = await checkOllamaHealth();

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        database: "connected",
        ollama: ollamaAvailable ? "available" : "unavailable",
      },
    });
  } catch (error) {
    res.status(503).json({
      status: "degraded",
      timestamp: new Date().toISOString(),
      services: {
        database: "unknown",
        ollama: "unknown",
      },
    });
  }
});

async function checkOllamaHealth(): Promise<boolean> {
  try {
    const response = await fetch(
      `${process.env.OLLAMA_HOST || "http://localhost:11434"}/api/tags`,
    );
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================
// ESTADÍSTICAS
// ============================================

app.get("/api/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await chatbot.getStats();
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
app.post("/api/chat/session", (_req: Request, res: Response) => {
  const sessionId = chatbot.createSession();
  res.status(201).json({ sessionId });
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

    // Usar sessionId existente o crear uno nuevo
    const activeSessionId = sessionId || chatbot.createSession();

    // Procesar mensaje
    const response = await chatbot.processMessage(
      activeSessionId,
      message.trim(),
      userId,
    );

    res.json({
      sessionId: activeSessionId,
      response,
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
    const limit = parseInt(req.query.limit as string) || 50;

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
    const { sessionId } = req.params;

    // Aquí podrías limpiar la sesión del contexto si lo necesitas
    // Por ahora solo respondemos OK

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

// ============================================
// DATOS ACADÉMICOS
// ============================================

// Listar facultades
app.get("/api/facultades", (_req: Request, res: Response) => {
  try {
    const facultades = localDataService.getFacultades();

    res.json({
      data: facultades,
      total: facultades.length,
    });
  } catch (error) {
    res.status(500).json({
      error: true,
      code: "INTERNAL_ERROR",
      message: "Error obteniendo facultades",
    });
  }
});

// Listar programas (solo pregrado)
app.get("/api/programas", (req: Request, res: Response) => {
  try {
    const { nombre, facultad } = req.query;

    const programas = localDataService.getProgramas(
      nombre as string | undefined,
      facultad as string | undefined,
    );

    res.json({
      data: programas,
      total: programas.length,
    });
  } catch (error) {
    res.status(500).json({
      error: true,
      code: "INTERNAL_ERROR",
      message: "Error obteniendo programas",
    });
  }
});

// Obtener pensum de un programa
app.get("/api/programas/:nombre/pensum", (req: Request, res: Response) => {
  try {
    const nombre = req.params.nombre as string;
    const pensum = localDataService.getPensumCompleto(
      decodeURIComponent(nombre),
    );

    if (!pensum) {
      return res.status(404).json({
        error: true,
        code: "PROGRAMA_NOT_FOUND",
        message: "Programa no encontrado o sin pensum disponible",
      });
    }

    res.json(pensum);
  } catch (error) {
    res.status(500).json({
      error: true,
      code: "INTERNAL_ERROR",
      message: "Error obteniendo pensum",
    });
  }
});

// Buscar materias
app.get("/api/materias", (req: Request, res: Response) => {
  try {
    const { programa, semestre, nombre, jornada } = req.query;

    const materias = localDataService.getMaterias(
      programa as string | undefined,
      semestre as string | undefined,
      nombre as string | undefined,
      jornada as string | undefined,
    );

    res.json({
      data: materias,
      total: materias.length,
    });
  } catch (error) {
    res.status(500).json({
      error: true,
      code: "INTERNAL_ERROR",
      message: "Error obteniendo materias",
    });
  }
});

// Listar programas con pensum disponible
app.get("/api/programas-con-pensum", (_req: Request, res: Response) => {
  try {
    const programas = localDataService.getProgramasConPensum();

    res.json({
      data: programas,
      total: programas.length,
    });
  } catch (error) {
    res.status(500).json({
      error: true,
      code: "INTERNAL_ERROR",
      message: "Error obteniendo programas con pensum",
    });
  }
});

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

    // Inicializar chatbot (conecta a MongoDB)
    await chatbot.initialize();

    // Iniciar servidor HTTP
    app.listen(PORT, () => {
      console.log(`
🎓 ========================================
   UCONNECT API - Universidad de Córdoba
========================================

✅ Servidor corriendo en: http://localhost:${PORT}
📚 Documentación: API_DOCS.md

Endpoints disponibles:
  POST   /api/chat              - Enviar mensaje al chatbot
  POST   /api/chat/session      - Crear nueva sesión
  GET    /api/chat/:id/history  - Historial de chat
  DELETE /api/chat/:id          - Finalizar sesión
  
  GET    /api/facultades        - Listar facultades
  GET    /api/programas         - Listar programas pregrado
  GET    /api/programas/:n/pensum - Pensum de programa
  GET    /api/materias          - Buscar materias
  
  GET    /api/stats             - Estadísticas
  GET    /api/health            - Health check

CORS habilitado para: ${CORS_ORIGIN}
      `);
    });

    // Graceful shutdown
    process.on("SIGINT", async () => {
      console.log("\n\n⏳ Cerrando servidor...");
      await chatbot.shutdown();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await chatbot.shutdown();
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
