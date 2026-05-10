# Frontend — Implementación Banco de Preguntas (FAQ) + Chat (UConnect)

Este archivo está pensado para **copiarse al repo del frontend**. Es una guía autocontenida para implementar el módulo de FAQ y su integración con el chat, usando el backend ya existente (Node/Express + OpenAI Vector Store para FAQ KB).

> Objetivo: implementar el frontend sin necesitar acceso al código del backend.

---

## 0) Suposiciones y alcance (MVP)

### Alcance

- **FAQ (banco de preguntas):**
  - Listar preguntas disponibles (`featured`, `faq`, `archive`) para UI.
  - Buscar por texto (top N resultados con score).
  - Ver la respuesta de una pregunta por `id`.
- **Chat unificado:**
  - Crear sesión.
  - Enviar mensajes.
  - Ver historial.
  - (Opcional de UI) Botones de “preguntas sugeridas”.

### Fuera de alcance (por ahora)

- Autenticación/roles.
- Mostrar `sources` por mensaje en historial (el endpoint de historial no lo trae).

---

## 1) Configuración del frontend

### Variable de entorno

Necesitas una variable con la URL base del backend.

Nombre sugerido (ajústalo al framework):

- Vite: `VITE_API_BASE_URL`
- Next.js: `NEXT_PUBLIC_API_BASE_URL`
- CRA: `REACT_APP_API_BASE_URL`

Valor típico en local:

- `http://localhost:3000` (default) o el que tengas en `PORT`

### Recomendación de dev proxy (si aplica)

Si el frontend corre en otro puerto y hay CORS incómodo, configura un proxy en dev (según el stack) o usa la URL absoluta.

---

## 2) Contrato de API (exacto)

Todos los errores del backend siguen este patrón:

```json
{ "error": true, "code": "SOME_CODE", "message": "..." }
```

### 2.1 FAQ

#### A) Listar preguntas

`GET /api/faq/questions`

Opcional:

- `GET /api/faq/questions?includeArchive=false` para excluir `archive` (UI inicial corta).

**200 OK**

```json
{
  "featured": [{ "id": "q1", "question": "...", "category": "..." }],
  "faq": [{ "id": "q4", "question": "...", "category": "..." }],
  "archive": [{ "id": "q6", "question": "...", "category": "..." }],
  "total": 21
}
```

**503** `FAQ_KB_UNAVAILABLE`

Notas:

- Por defecto este endpoint **sí retorna** `archive`.
- Si la UI necesita una lista corta (solo `featured` + `faq`), usar `includeArchive=false`.

#### B) Buscar preguntas por texto

`GET /api/faq/search?q=...&limit=...`

Query params:

- `q` (string, **requerido**, máx 200 chars)
- `limit` (number, opcional; el backend lo interpreta y clampa internamente)

**200 OK**

```json
{
  "query": "pin",
  "results": [
    {
      "id": "q3",
      "question": "¿Cuál es el valor del PIN o derecho de inscripción?",
      "category": "Inscripciones",
      "tier": "featured",
      "score": 0.97
    }
  ],
  "total": 1
}
```

**400**

- `INVALID_REQUEST` si falta `q`
- `QUERY_TOO_LONG` si `q.length > 200`

**503** `FAQ_KB_UNAVAILABLE`

Notas importantes:

- `results` **no incluye** `answer`.

#### C) Obtener respuesta por id

`GET /api/faq/:questionId`

**200 OK**

```json
{
  "id": "q3",
  "answer": "...",
  "cached": true,
  "timestamp": "2026-04-18T12:34:56.000Z"
}
```

**404** `QUESTION_NOT_FOUND`

**503** `FAQ_KB_UNAVAILABLE`

Notas importantes:

- Esta respuesta **no incluye** `question`, `category`, `tier`.
  - Si la UI necesita mostrar el texto de la pregunta, debes conservarlo desde el listado/búsqueda.

---

### 2.2 Chat

#### A) Crear sesión

`POST /api/chat/session`

**201 Created**

```json
{
  "sessionId": "<string>",
  "suggestedQuestions": ["...", "...", "..."]
}
```

Notas:

- `suggestedQuestions` son strings (preguntas guiadas), útiles para botones rápidos.
- Fuente principal: tier `featured` del KB (Vector Store) — toma las primeras 3.
- Fallback: si el KB no está disponible, devuelve el listado estático `ADMISSION_GUIDED_QUESTIONS`.

#### B) Enviar mensaje

`POST /api/chat`

Body:

```json
{
  "sessionId": "<string | null>",
  "message": "<string>",
  "userId": "<string | null>"
}
```

Validaciones:

- `message` requerido y string.
- `message.length <= 1000`.

**200 OK**

```json
{
  "sessionId": "<string>",
  "response": {
    "message": "...",
    "sources": ["FAQ"],
    "tokensUsed": { "input": 0, "output": 0 },
    "engine": "local-chat",
    "route": "general"
  }
}
```

Notas:

- Si el backend detecta que la pregunta coincide con una FAQ, responde con:
  - `sources: ["FAQ"]`
  - `engine: "local-chat"`
  - `route: "general"`
- Si cae a ruta “documents” (GPT/RAG), la forma puede variar:
  - `engine: "gpt-rag"`
  - `sources` serán nombres de documentos
  - `tokensUsed` puede venir ausente

**400**

- `INVALID_REQUEST` (si falta `message`)
- `MESSAGE_TOO_LONG`

---

## 3) Admin — CRUD de FAQs (edición)

Estos endpoints permiten crear/editar/eliminar preguntas del banco.

Notas importantes:

- Cada operación **sube un nuevo KB** al Vector Store (no hay edición in-place del archivo).
- Puede tardar algunos segundos (polling hasta `completed`).
- Actualmente el backend **no tiene autenticación**; en producción, proteger con un admin token/JWT.

### 3.1 Obtener KB actual

`GET /api/admin/faq-kb`

Opcional:

- `GET /api/admin/faq-kb?forceRefresh=true`

**200 OK**

```json
{
  "file": { "vectorStoreFileId": "file-...", "createdAt": 1234567890 },
  "loadedAt": "2026-05-10T12:34:56.000Z",
  "entries": [
    {
      "id": "q3",
      "tier": "featured",
      "category": "Inscripciones",
      "questions": ["¿Cuál es el valor del PIN o derecho de inscripción?"],
      "answer": "...",
      "isActive": true,
      "source": { "title": "...", "url": "..." }
    }
  ],
  "total": 21
}
```

### 3.2 Crear FAQ

`POST /api/admin/faq-kb/entries`

Body:

```json
{
  "tier": "faq",
  "category": "Inscripciones",
  "question": "¿Cómo edito una FAQ desde el admin?",
  "answer": "..."
}
```

También puedes enviar `questions: string[]` en vez de `question`.

**201 Created**

```json
{
  "message": "FAQ creada correctamente",
  "file": { "vectorStoreFileId": "file-...", "createdAt": 1234567890 },
  "entry": {
    "id": "q_...",
    "tier": "faq",
    "category": "...",
    "questions": ["..."],
    "answer": "...",
    "isActive": true
  }
}
```

### 3.3 Editar FAQ

`PATCH /api/admin/faq-kb/entries/:id`

Body (patch parcial):

```json
{
  "answer": "Respuesta actualizada...",
  "tier": "archive"
}
```

**200 OK**

```json
{
  "message": "FAQ actualizada correctamente",
  "file": { "vectorStoreFileId": "file-...", "createdAt": 1234567890 },
  "entry": {
    "id": "q3",
    "tier": "archive",
    "category": "...",
    "questions": ["..."],
    "answer": "...",
    "isActive": true
  }
}
```

Errores:

- `404 QUESTION_NOT_FOUND`
- `400 INVALID_REQUEST`
- `503 FAQ_KB_UNAVAILABLE`

### 3.4 Eliminar FAQ

`DELETE /api/admin/faq-kb/entries/:id`

Nota:

- Es un _soft delete_: la entry queda con `isActive=false`.
- Para “restaurar”, usar `PATCH` con `{ "isActive": true }`.

**204 No Content**

**500** `INTERNAL_ERROR`

#### C) Historial

`GET /api/chat/:sessionId/history?limit=50`

**200 OK**

```json
{
  "sessionId": "<string>",
  "messages": [
    { "role": "user", "content": "...", "timestamp": "2026-04-18T..." },
    { "role": "assistant", "content": "...", "timestamp": "2026-04-18T..." }
  ]
}
```

**404** `SESSION_NOT_FOUND`

**500** `INTERNAL_ERROR`

Notas:

- El historial **no trae** `sources` ni `engine` por mensaje. Solo texto + timestamp.

---

## 3) Tipos TypeScript recomendados (frontend)

```ts
export type ApiError = {
  error: true;
  code: string;
  message: string;
};

// FAQ
export type FaqListItem = {
  id: string;
  question: string;
  category: string;
};

export type FaqQuestionsResponse = {
  featured: FaqListItem[];
  faq: FaqListItem[];
  archive?: FaqListItem[]; // puede omitirse cuando includeArchive=false
  total: number;
};

export type FaqSearchResult = {
  id: string;
  question: string;
  category: string;
  tier: string; // "featured" | "faq" | "archive" (no asumir exhaustivo)
  score: number; // 0..1
};

export type FaqSearchResponse = {
  query: string;
  results: FaqSearchResult[];
  total: number;
};

export type FaqAnswerResponse = {
  id: string;
  answer: string;
  cached: true;
  timestamp: string;
};

// Chat
export type ChatSessionResponse = {
  sessionId: string;
  suggestedQuestions: string[];
};

export type ChatTokensUsed = { input: number; output: number };

export type ChatResponsePayload = {
  message: string;
  sources: string[];
  tokensUsed?: ChatTokensUsed; // opcional (gpt-rag puede no traerlo)
  engine: "local-chat" | "gpt-rag" | string;
  route: "general" | "documents" | string;
};

export type ChatSendResponse = {
  sessionId: string;
  response: ChatResponsePayload;
};

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

export type ChatHistoryResponse = {
  sessionId: string;
  messages: ChatHistoryMessage[];
};
```

---

## 4) Diseño de UI y flujos (lo mínimo para implementar bien)

### 4.1 Flujo de inicio

1. Resolver `apiBaseUrl` desde env.
2. Crear sesión de chat:
   - `POST /api/chat/session`
   - Guardar `sessionId` en estado (y opcionalmente en `localStorage`).
3. Cargar FAQ inicial:

- `GET /api/faq/questions` (lista completa)
- o `GET /api/faq/questions?includeArchive=false` (lista corta)

Estados a manejar:

- `loadingSession`, `loadingFaqList`.
- Errores: mostrar mensaje simple (con `code` y `message` si viene).

### 4.2 FAQ — UI recomendada

- **Featured**: renderizar como botones (3 típicamente).
  - Al click tienes dos opciones:
    1. Si quieres “modo FAQ rápido”: llamar `GET /api/faq/:id` y mostrar `answer`.
    2. Si quieres “integrarlo al chat”: enviar el texto al `POST /api/chat` (con `sessionId`) y mostrar la respuesta como un mensaje del asistente.
- **FAQ selector** (tier `faq`): lista/dropdown.
  - Click → `GET /api/faq/:id`.
- **Search**:
  - Input + botón o input con búsqueda al escribir.
  - Llamar `GET /api/faq/search?q=...&limit=5`.
  - Mostrar resultados (question + category + score).
  - Click en resultado → `GET /api/faq/:id`.

Importante:

- Como `GET /api/faq/:id` no trae `question/category`, cuando muestres el detalle conserva el objeto seleccionado para renderizar el título.

### 4.3 Chat — UI recomendada

- Lista de mensajes (user/assistant).
- Input + enviar.
- Al enviar:
  1. Agregar mensaje user optimista.
  2. `POST /api/chat`.
  3. Agregar respuesta assistant.

Tratamiento de `sources`:

- Si `sources` incluye `"FAQ"`, mostrar un badge pequeño tipo “FAQ”.
- Si no, mostrar “Documentos” o nada (según UI), pero no inventar links.

Historial:

- Para re-hidratar, usar `GET /api/chat/:sessionId/history`.
- Ten presente que ese historial trae solo `{ role, content, timestamp }`.

---

## 5) Checklist de implementación (pasos concretos)

1. **Explorar el repo frontend**

- Identificar framework (Vite/Next/etc.), routing y estilo (Tailwind/otros).

2. **Configurar API base URL**

- Crear helper `getApiBaseUrl()` y/o `.env`.

3. **Implementar cliente HTTP**

- Wrapper `apiFetch(path, options)`:
  - agrega `Content-Type: application/json` cuando aplique
  - parsea JSON
  - si `!res.ok`, intenta parsear `ApiError` y lo lanza/retorna

4. **Implementar módulo FAQ (servicios)**

- `faqApi.listQuestions({ includeArchive?: boolean })` (o similar)
- `faqApi.search(q, limit)`
- `faqApi.getAnswer(id)`

5. **Implementar módulo Chat (servicios)**

- `chatApi.createSession()`
- `chatApi.sendMessage({ sessionId, message, userId })`
- `chatApi.getHistory(sessionId, limit)`

6. **Implementar UI (componentes)**

- `FaqFeatured` (botones)
- `FaqSelector` (lista)
- `FaqSearch` (input + resultados)
- `FaqAnswerPanel` (respuesta)
- `Chat` (messages + input)

7. **Integración final**

- Unificar estado de `sessionId`.
- Definir comportamiento de click FAQ:
  - Opción A: mostrar panel de respuesta (GET /api/faq/:id)
  - Opción B: enviarlo al chat (POST /api/chat)

8. **Smoke tests manuales (sin Postman)**

- `GET {baseUrl}/api/faq/questions`
- `GET {baseUrl}/api/faq/questions?includeArchive=false`
- `GET {baseUrl}/api/faq/search?q=pin&limit=5`
- `GET {baseUrl}/api/faq/q3`
- `POST {baseUrl}/api/chat/session`
- `POST {baseUrl}/api/chat` con una pregunta que exista en FAQ

---

## 6) Riesgos / gotchas

- Si el FAQ KB no está cargado/configurado, los endpoints de FAQ pueden responder `503 FAQ_KB_UNAVAILABLE`.
- Por defecto `GET /api/faq/questions` retorna también `archive`; para una lista corta usar `includeArchive=false`.
- `GET /api/faq/:id` no retorna el texto de la pregunta.
- El historial de chat no incluye fuentes por mensaje.
- `tokensUsed` puede faltar cuando la respuesta viene de GPT/RAG.

---

## 7) Definición de “listo” (DoD)

- FAQ:
  - Lista carga y renderiza `featured` + `faq` (+ `archive` por defecto, o lista corta con `includeArchive=false`).
  - Search muestra resultados relevantes y permite ver respuesta.
  - Detalle muestra `answer` (y el título desde estado local).
- Chat:
  - Sesión se crea y se reutiliza.
  - Enviar mensaje funciona y renderiza la respuesta.
  - Si la respuesta viene de FAQ, se marca visualmente (badge/label).
