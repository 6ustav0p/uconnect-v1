import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function getEnvVar(key: string, required = true): string {
  const value = process.env[key];
  if (!value && required) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || "";
}

export const config = {
  // Ollama AI Configuration
  ollama: {
    host: getEnvVar("OLLAMA_HOST", false) || "http://localhost:11434",
    model: getEnvVar("OLLAMA_MODEL", false) || "glm-4.6:cloud",
    maxOutputTokens: 4096,
    temperature: 0.7,
  },

  // MongoDB Configuration
  mongodb: {
    uri: getEnvVar("MONGODB_URI"),
    dbName: "uconnect",
    collections: {
      chats: "chats",
      sessions: "sessions",
      cache: "cache",
    },
  },

  // Academusoft API Configuration
  academusoft: {
    baseUrl: "http://api-academusoft.appsprod.unicordoba.edu.co/api",
    endpoints: {
      facultades: "/facultades",
      programas: "/programasacademicos",
      pensum: "/listarpensumporprograma",
    },
    timeout: 10000,
    retries: 3,
  },

  // Chatbot Configuration
  chatbot: {
    maxHistoryMessages: 10,
    maxContextTokens: 4000,
    maxApiResults: 50,
    cacheEnabled: true,
    cacheTTLSeconds: 3600, // 1 hora
  },

  // PEP (Perfil de Programa) Configuration
  peps: {
    dir: getEnvVar("PEPS_DIR", false) || "peps",
  },

  // Environment
  env: getEnvVar("NODE_ENV", false) || "development",
  isDev: (getEnvVar("NODE_ENV", false) || "development") === "development",
} as const;

export type Config = typeof config;
