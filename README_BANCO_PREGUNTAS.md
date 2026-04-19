# Banco de Preguntas (FAQ) — UConnect

Este documento describe la implementación del **banco de preguntas (FAQ)** en el backend de UConnect: persistencia en MongoDB, endpoints REST y el “early-exit” en el chat para responder FAQs sin invocar IA.

## 1) ¿Qué resuelve?

- Centraliza las preguntas/respuestas frecuentes en **MongoDB** (fuente de verdad).
- Permite:
  - Listar preguntas frecuentes para UI.
  - Buscar preguntas por texto.
  - Resolver automáticamente una pregunta del usuario usando **matching tolerante**.
- Integra el matching en el flujo de chat para responder **antes** del enrutamiento (incluye la ruta de documentos/GPT).

## 2) Persistencia (MongoDB)

- Colección: `faqs`
- Modelo principal: `FaqEntry`
- Campos relevantes:
  - `id`: identificador estable (ej: `q3`).
  - `questions`: variantes humanas de la pregunta (array).
  - `questionsNormalized`: variantes normalizadas (array) para match exacto.
  - `answer`: respuesta.
  - `category`: categoría (ej: “Inscripciones”).
  - `tier`: `featured | faq | archive`.
  - `keywords`: palabras clave para pre-filtrar candidatos.
  - `isActive`: habilita/deshabilita.
  - `hitCount`: contador de uso (se incrementa cuando hay match).

Notas:

- El esquema genera `questionsNormalized` y `keywords` en `pre('validate')`.
- En upserts, también se calculan `questionsNormalized/keywords` a mano para evitar depender de hooks en operaciones `updateOne`.

## 3) Seed inicial

Por ahora no hay CRUD admin; se carga un seed inicial desde la FAQ estática.

- Fuente: `src/config/admission-faq.ts`
- Script: `npm run faqs:seed`
- Qué hace:
  - Conecta a Mongo.
  - Upsertea por `id`.
  - Carga tiers `featured`, `faq` y `archive`.

Requisito:

- `MONGODB_URI` debe apuntar a tu Mongo (en `.env`).

## 4) Matching (cómo decide una respuesta)

Servicio: `FaqService` (`faqService.match(message)`)

Estrategia:

1. Normaliza el mensaje del usuario (`normalizeText`).
2. Intenta match exacto por `questionsNormalized`.
3. Si no hay exacto:
   - Extrae keywords (`extractKeywords`).
   - Busca candidatos por `$in` sobre `keywords`.
   - Si no encuentra candidatos, cae a lista completa activa (para no devolver siempre vacío).
4. Score por candidato:
   - Similaridad por Levenshtein (`calculateSimilarity`).
   - Señal adicional si hay “contains” (query contiene variante o viceversa).
   - Bonus por overlap de keywords.
5. Umbrales:
   - Query corta: exige score más alto.
   - Query normal: umbral base.

Si el score supera el umbral, retorna `{ answer, sources: ["FAQ"], score, ... }` e incrementa `hitCount` (no bloqueante).

## 5) Endpoints REST de FAQ

- `GET /api/faq/questions`
  - Retorna `featured` y `faq` (pensado para UI inicial).
  - Opcional: `GET /api/faq/questions?includeArchive=true` para incluir también `archive` (listar todas).
- `GET /api/faq/search?q=...&limit=...`
  - Retorna top N resultados con `{ id, question, category, tier, score }` (sin `answer`).
- `GET /api/faq/:questionId`
  - Retorna `{ id, answer, ... }` para un `id` específico.

## 6) Integración con el chat (early-exit)

### a) API unificada: `POST /api/chat`

- Antes de inferir ruta (`documents/general`), se intenta `faqService.match()`.
- Si hay match:
  - Se guarda el mensaje del usuario y la respuesta en el historial.
  - Se responde inmediatamente con:
    - `sources: ["FAQ"]`
    - `engine: "local-chat"`

Esto asegura que incluso si la consulta caería en “documents/GPT”, primero se resuelva con FAQ si aplica.

### b) Orquestador: `Chatbot.processMessage()`

- También tiene early-exit de FAQ para cubrir usos fuera del endpoint.

## 7) Variables de entorno

Mínimas para FAQ + chat local:

- `MONGODB_URI`
- (opcional) `OLLAMA_HOST`, `OLLAMA_MODEL`

Para GPT/RAG:

- `OPENAI_API_KEY`
- `OPENAI_VECTOR_STORE_ID`

Nota: si OpenAI no está configurado, el servidor puede iniciar y la ruta `documents` hará fallback si falla GPT.

## 8) Probar con Postman

Archivo listo para importar (todo-en-uno):

- `postman/uconnect-api.postman_collection.json`

Esta colección incluye variables internas (collection variables) como `baseUrl`, `chatSessionId`, etc., para que puedas probar sin importar un environment separado.

Variables incluidas:

- `baseUrl` (por defecto `http://localhost:3005`)
- `chatSessionId` (se llena al crear sesión)
- `faqQuestionId` (por defecto `q3`)
- `faqSearchQuery` (por defecto `pin`)
- `chatMessageFaq`

Requests sugeridos:

1. `GET {{baseUrl}}/api/health`
2. `GET {{baseUrl}}/api/faq/questions`

- (opcional) `GET {{baseUrl}}/api/faq/questions?includeArchive=true` para listar también `archive`

3. `GET {{baseUrl}}/api/faq/search?q={{faqSearchQuery}}&limit=5`
4. `GET {{baseUrl}}/api/faq/{{faqQuestionId}}`
5. `POST {{baseUrl}}/api/chat/session`
   - En Postman (tab Tests):
   - `pm.collectionVariables.set("chatSessionId", pm.response.json().sessionId);`

6. `POST {{baseUrl}}/api/chat`
   - Body:
     - `{ "sessionId": "{{chatSessionId}}", "message": "{{chatMessageFaq}}", "userId": "postman" }`

---

La colección ya trae requests y tests listos (incluye auto-set de `chatSessionId`).
