# Project Instructions

Chatbot universitario para la Universidad de Córdoba con Node.js, TypeScript, Gemini AI y MongoDB.

## Project Structure

- `src/config/` - Configuración y prompts de IA
- `src/models/` - Esquemas de MongoDB (Chat, Cache)
- `src/services/` - Servicios de negocio (Gemini, APIs, Query Builder)
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

- Variables de entorno en `.env` (GEMINI_API_KEY, MONGODB_URI)
- TypeScript config en `tsconfig.json`

## APIs Académicas

- `/api/facultades` - Información de facultades
- `/api/programasacademicos` - Programas y carreras
- `/api/listarpensumporprograma` - Materias y pensum

## Key Services

- `AcademusoftService` - Cliente HTTP para APIs académicas
- `QueryBuilderService` - Extracción de entidades con reglas + IA
- `GeminiService` - Generación de respuestas con RAG
- `ChatRepository` - Persistencia en MongoDB
