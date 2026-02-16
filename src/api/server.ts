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
import {
  chatRepository,
  pepRepository,
  pepParserService,
  pepUploadService,
} from "../services";
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
// ADMIN - PEP (Perfil de Programa)
// ============================================

// Parser JSON más grande solo para admin
const adminJsonParser = express.json({ limit: "500kb" });

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

      // Verificar que el programa exista
      const programaExiste = localDataService
        .getProgramas()
        .some((p) => p.prog_id === programaId);

      if (!programaExiste) {
        return res.status(400).json({
          error: true,
          code: "PROGRAMA_NOT_FOUND",
          message: `No existe un programa con ID: ${programaId}`,
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

Admin PEP:
  POST   /api/admin/pep         - Crear/actualizar PEP
  GET    /api/admin/pep/:id     - Obtener PEP por programaId
  GET    /api/admin/peps        - Listar todos los PEPs
  DELETE /api/admin/pep/:id     - Eliminar PEP

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
