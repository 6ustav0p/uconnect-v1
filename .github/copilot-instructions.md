# Project Instructions

Chatbot universitario para la Universidad de Cordoba con Node.js, TypeScript, Ollama/GPT y MongoDB.

## Project Structure

- `src/config/` - Configuración y prompts de IA
- `src/models/` - Esquemas de MongoDB (Chat, Cache)
- `src/services/` - Servicios de negocio (chat local, GPT/RAG, PEP, almacenamiento)
- `src/types/` - Tipos TypeScript
- `src/utils/` - Utilidades (logger, text helpers)
- `src/chatbot.ts` - Orquestador principal
- `src/index.ts` - CLI de prueba
- `dist/` - JavaScript compilado

## Development Commands

- `npm run build` - Compilar TypeScript
- `npm run dev` - Desarrollo con hot-reload
- `npm start` - Ejecutar compilado

## Configuration

- Variables de entorno en `.env` (OPENAI_API_KEY, MONGODB_URI, OLLAMA_HOST)
- TypeScript config en `tsconfig.json`

## APIs Académicas

- `/api/facultades` - Informacion de facultades
- `/api/programas` - Programas de pregrado
- `/api/programas/:nombre/pensum` - Materias por programa
- `/api/chat` - Chat unificado con routing backend (local o GPT)

## Key Services

- `LocalDataService` - Consulta de facultades, programas y pensum desde JSON local
- `OllamaService` - Generacion de respuestas del chat local
- `GptAgentService` - Respuestas con GPT y busqueda documental RAG
- `PepRepository` - Persistencia y consulta de perfiles PEP
- `ChatRepository` - Persistencia de sesiones y mensajes
