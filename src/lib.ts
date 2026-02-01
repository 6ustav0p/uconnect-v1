// ============================================
// UCONNECT - Chatbot Universidad de Córdoba
// ============================================

// Exportar chatbot principal
export { chatbot, Chatbot } from "./chatbot";

// Exportar servicios
export {
  localDataService,
  ollamaService,
  database,
  chatRepository,
} from "./services";

// Exportar tipos
export * from "./types";

// Exportar configuración
export { config } from "./config";

// Exportar utilidades
export { logger } from "./utils";
