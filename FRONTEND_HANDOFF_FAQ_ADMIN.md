# Handoff Frontend — FAQ (KB) + Chat + Admin CRUD (UConnect)

**Fecha:** 2026-05-10

Este archivo está pensado para **copiarse al repo del frontend** para que el equipo (y Copilot) tenga contexto claro de:

1. Qué cambió en el backend.
2. Qué tiene que implementar el frontend para que funcione correctamente.
3. Cómo probarlo (smoke tests).

---

## 1) Resumen de cambios (backend)

### 1.1 FAQ ya NO vive en Mongo ni en código

- El banco de preguntas (FAQ) ahora es un **KB JSON** alojado en **OpenAI Vector Store**.
- El backend construye un **snapshot en memoria con TTL (~5 min)** y expone endpoints públicos para listar/buscar/consultar.

### 1.2 Editar FAQ = subir un KB nuevo

OpenAI Vector Store **no permite editar el contenido in-place**. Por eso:

- El CRUD admin **crea/actualiza/desactiva** preguntas construyendo un **nuevo JSON KB**.
- Luego lo **sube al Vector Store** (`attributes.kind = "faq_kb"`).
- El backend fuerza refresh del snapshot para que el cambio se vea en los endpoints públicos.

### 1.3 `suggestedQuestions` ahora viene del KB (tier `featured`)

- `POST /api/chat/session` devuelve `suggestedQuestions` usando **las primeras 3** preguntas del tier `featured`.
- Fallback: si el KB no está disponible, devuelve la lista estática `ADMISSION_GUIDED_QUESTIONS`.

---

## 2) Configuración requerida en el frontend

Define una variable con la URL base del backend, por ejemplo:

- Vite: `VITE_API_BASE_URL=http://localhost:3000`
- Next: `NEXT_PUBLIC_API_BASE_URL=http://localhost:3000`

> Nota: en backend el puerto default es `3000` (o el que esté en `PORT`).

---

## 3) Contrato de endpoints (lo que el frontend debe consumir)

> Para el contrato completo (responses, errores, ejemplos), ver también: `README_FRONTEND_FAQ.md` (copiar a front si quieres).

### 3.1 FAQ (público)

1. **Listar preguntas**

- `GET /api/faq/questions`
- Opcional: `GET /api/faq/questions?includeArchive=false` (para lista corta, sin archive)

2. **Buscar**

- `GET /api/faq/search?q=<texto>&limit=<n>`
- IMPORTANTE: el query param es **`q`** (no `query`).

3. **Obtener respuesta por id**

- `GET /api/faq/:id`

> Gotcha: este endpoint no trae el texto de la pregunta; el front debe conservarlo desde el listado/búsqueda.

### 3.2 Chat (público)

1. **Crear sesión**

- `POST /api/chat/session`
- Respuesta incluye `suggestedQuestions: string[]`.

2. **Enviar mensaje**

- `POST /api/chat`
- Body: `{ sessionId, message, userId? }`
- Si hace match con FAQ, responde con `sources: ["FAQ"]`.

### 3.3 Admin — CRUD FAQ KB (edición)

Estos endpoints son para una pantalla de administración.

1. Ver KB actual (incluye inactivos)

- `GET /api/admin/faq-kb`
- Opcional: `GET /api/admin/faq-kb?forceRefresh=true`

2. Crear FAQ

- `POST /api/admin/faq-kb/entries`
- Body: `{ tier, category, question|questions, answer, id?, source? }`

3. Editar FAQ (patch parcial)

- `PATCH /api/admin/faq-kb/entries/:id`
- Body: `{ tier?, category?, question?|questions?, answer?, source?, isActive? }`

4. Eliminar FAQ (soft delete)

- `DELETE /api/admin/faq-kb/entries/:id`
- Esto NO borra; deja `isActive=false`.
- Para “restaurar”: `PATCH` con `{ "isActive": true }`.

> Importante: actualmente estos endpoints no tienen auth; si el frontend es público, hay que protegerlos (token/JWT o backend-only).

---

## 4) Qué debe implementar el frontend (MVP)

### 4.1 UI FAQ (usuario final)

- Vista inicial:
  - Llamar `GET /api/faq/questions?includeArchive=false`.
  - Renderizar:
    - `featured` como 3 botones/cards.
    - `faq` como lista/selector.
- Vista de búsqueda:
  - Input + debounce.
  - Llamar `GET /api/faq/search?q=...`.
  - Mostrar resultados con `score`.
- Vista detalle/respuesta:
  - Al click en un item, llamar `GET /api/faq/:id` y mostrar `answer`.

### 4.2 UI Chat

- Al iniciar:
  - `POST /api/chat/session` y guardar `sessionId`.
  - Renderizar `suggestedQuestions` como quick actions.
- Al enviar:
  - `POST /api/chat`.
  - Si `sources` contiene `FAQ`, opcional mostrar badge “FAQ”.

### 4.3 UI Admin FAQ (edición)

Pantalla admin simple:

- Tabla con columnas sugeridas:
  - `id`, `tier`, `category`, `questions[0]`, `isActive`.
- Acciones:
  - **Create** (modal o drawer): tier/category/question(s)/answer.
  - **Edit**: patch parcial.
  - **Disable**: DELETE (soft).
  - **Restore**: PATCH `{ isActive: true }`.

UX obligatoria por cómo persiste:

- Mostrar **loading** (puede tardar varios segundos) porque cada operación:
  - genera un JSON KB
  - lo sube al Vector Store
  - hace polling hasta `completed`
  - refresca snapshot

---

## 5) Errores y estados que el frontend debe manejar

- `503 FAQ_KB_UNAVAILABLE`:
  - mostrar mensaje tipo “FAQ no disponible, intenta más tarde”.
- `404 QUESTION_NOT_FOUND` en `GET /api/faq/:id`.
- Validaciones:
  - búsqueda sin `q` => `400 INVALID_REQUEST`
  - `q` demasiado largo => `400 QUERY_TOO_LONG`

---

## 6) Smoke tests (manuales)

Con backend corriendo en `http://localhost:3000`:

1. **Suggested questions dinámicas**

- `POST /api/chat/session`
- Ver que `suggestedQuestions` coincide con las 3 primeras `featured`.

2. **CRUD admin refleja en público**

- Crear una FAQ en tier `featured`.
- Volver a llamar `POST /api/chat/session` => debe aparecer en `suggestedQuestions`.
- Desactivar (DELETE) una featured => dejará de aparecer.

3. **Búsqueda**

- `GET /api/faq/search?q=pin&limit=5`

---

## 7) Nota para seguridad (pendiente)

Antes de producción:

- Proteger `/api/admin/faq-kb*` (token/JWT, IP allowlist, o backend-only).
- Si se añade auth, el frontend debe enviar `Authorization: Bearer <token>`.
