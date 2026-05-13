import type { NextFunction, Request, RequestHandler, Response } from "express";
import fs from "fs";
import path from "path";
import { logger } from "../utils";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

type AdminAuthMode = "firebase" | "none";

function parseCsv(input: string | undefined): string[] {
  if (!input) return [];
  return input
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getAdminAuthMode(): AdminAuthMode {
  // Seguridad por defecto: proteger /api/admin con Firebase.
  // Para desarrollo local sin auth, definir explícitamente: ADMIN_AUTH_MODE=none
  const raw = (process.env.ADMIN_AUTH_MODE || "firebase").trim().toLowerCase();

  if (raw === "none") return "none";
  return "firebase";
}

function sanitizeBase64(input: string): string {
  // Permite pegar el base64 con espacios, saltos de línea o caracteres tipo `
  return input.replace(/[^A-Za-z0-9+/=]/g, "").trim();
}

function loadServiceAccountFromEnv(): Record<string, unknown> | null {
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (base64 && base64.trim()) {
    const cleaned = sanitizeBase64(base64);
    const json = Buffer.from(cleaned, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  }

  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson && rawJson.trim()) {
    return JSON.parse(rawJson) as Record<string, unknown>;
  }

  const filePath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (filePath && filePath.trim()) {
    const resolved = path.resolve(filePath.trim());
    const json = fs.readFileSync(resolved, "utf8");
    return JSON.parse(json) as Record<string, unknown>;
  }

  return null;
}

let firebaseInitAttempted = false;
let firebaseInitError: Error | null = null;
let warnedDisabledInProd = false;

function ensureFirebaseInitialized(): boolean {
  if (firebaseInitAttempted) return firebaseInitError === null;
  firebaseInitAttempted = true;

  try {
    const serviceAccount = loadServiceAccountFromEnv();
    if (!serviceAccount) {
      throw new Error(
        "Firebase Admin no configurado: define FIREBASE_SERVICE_ACCOUNT_BASE64 (recomendado) o FIREBASE_SERVICE_ACCOUNT_PATH/GOOGLE_APPLICATION_CREDENTIALS",
      );
    }

    if (getApps().length === 0) {
      initializeApp({
        credential: cert(serviceAccount as any),
      });
    }

    firebaseInitError = null;
    return true;
  } catch (error) {
    firebaseInitError = error as Error;
    logger.error("Admin auth: no se pudo inicializar Firebase", {
      error: firebaseInitError.message,
    });
    return false;
  }
}

function isAdmin(decoded: DecodedIdToken): boolean {
  const allowedUids = new Set(parseCsv(process.env.ADMIN_UID_ALLOWLIST));
  const allowedEmails = new Set(
    parseCsv(process.env.ADMIN_EMAIL_ALLOWLIST).map(normalizeEmail),
  );

  const claims: Record<string, unknown> = decoded as unknown as Record<
    string,
    unknown
  >;

  const hasAdminClaim =
    claims.admin === true ||
    claims.isAdmin === true ||
    claims.role === "admin" ||
    claims.roles === "admin";

  if (hasAdminClaim) return true;

  if (allowedUids.size > 0 && allowedUids.has(decoded.uid)) return true;

  if (decoded.email && allowedEmails.size > 0) {
    const emailVerified = (claims.email_verified as boolean | undefined) ?? true;
    if (emailVerified && allowedEmails.has(normalizeEmail(decoded.email))) {
      return true;
    }
  }

  return false;
}

function extractBearerToken(req: Request): string | null {
  const header = req.header("Authorization");
  if (!header) return null;

  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1]?.trim();
  return token ? token : null;
}

export function createAdminAuthMiddleware(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const mode = getAdminAuthMode();
    const isProd = (process.env.NODE_ENV || "development") === "production";

    if (mode === "none") {
      if (isProd && !warnedDisabledInProd) {
        warnedDisabledInProd = true;
        logger.warn(
          "⚠️ Admin auth deshabilitado en producción (ADMIN_AUTH_MODE=none). /api/admin quedará público.",
        );
      }
      return next();
    }

    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({
        error: true,
        code: "UNAUTHORIZED",
        message: "Falta header Authorization: Bearer ID_TOKEN",
      });
    }

    // Firebase mode
    if (!ensureFirebaseInitialized()) {
      return res.status(503).json({
        error: true,
        code: "ADMIN_AUTH_NOT_CONFIGURED",
        message:
          "Acceso admin no disponible: autenticación no configurada en el servidor.",
      });
    }

    try {
      const decoded = await getAuth().verifyIdToken(token, true);

      if (!isAdmin(decoded)) {
        return res.status(403).json({
          error: true,
          code: "FORBIDDEN",
          message: "No tienes permisos de administrador.",
        });
      }

      // Adjuntar información mínima para auditoría/uso futuro
      res.locals.admin = {
        uid: decoded.uid,
        email: decoded.email,
      };

      return next();
    } catch (error) {
      const message = (error as Error).message;
      logger.warn("Admin auth: token inválido", { error: message });
      return res.status(401).json({
        error: true,
        code: "UNAUTHORIZED",
        message: "Token inválido o expirado.",
      });
    }
  };
}
