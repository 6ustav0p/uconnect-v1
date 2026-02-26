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

  // AWS / Textract / S3 Configuration
  aws: {
    region: getEnvVar("AWS_REGION", false) || "us-east-1",
    accessKeyId: getEnvVar("AWS_ACCESS_KEY_ID", false),
    secretAccessKey: getEnvVar("AWS_SECRET_ACCESS_KEY", false),
    sessionToken: getEnvVar("AWS_SESSION_TOKEN", false),
    s3Bucket: getEnvVar("TEXTRACT_S3_BUCKET", false),
    s3Prefix: getEnvVar("TEXTRACT_S3_PREFIX", false) || "pep-uploads",
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

  // Admision Configuration
  admision: {
    simuladorUrl:
      getEnvVar("ADMISION_SIMULADOR_URL", false) ||
      "https://docs.google.com/spreadsheets/d/19qet5I99Jb4Ljs3XuujKvJByFiV5Lbqk/edit?usp=sharing",
    puntajesReferenciaUrl:
      getEnvVar("ADMISION_PUNTAJES_URL", false) ||
      "https://docs.google.com/spreadsheets/d/1gGAAJJyBuJ8qjbkOOppEh0wBlOfRyyue/edit?usp=sharing",
  },

  // Environment
  env: getEnvVar("NODE_ENV", false) || "development",
  isDev: (getEnvVar("NODE_ENV", false) || "development") === "development",
} as const;

export type Config = typeof config;
