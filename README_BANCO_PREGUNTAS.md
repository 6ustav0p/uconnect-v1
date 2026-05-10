# Banco de Preguntas (FAQ) — UConnect (Vector Store)

Este documento describe la implementación del **banco de preguntas (FAQ)** en el backend de UConnect usando **OpenAI Vector Store** como fuente de verdad (KB), más el “early-exit” en el chat para responder FAQs sin invocar IA.

## 1) Fuente de verdad: FAQ KB en Vector Store

- Fuente: un archivo **JSON** adjunto al Vector Store configurado en `OPENAI_VECTOR_STORE_ID`.
- Recomendación: subir el archivo con `attributes.kind = "faq_kb"`.
- Selección: el backend usa el archivo más reciente con `kind=faq_kb` y `status=completed`.
- Caché: snapshot en memoria con TTL (~5 minutos) y refresh automático.

### Formato soportado

Se aceptan dos formas (para facilitar migración):

**A) Preferida**

```json
{
  "version": 1,
  "entries": [
    {
      "id": "q1",
      "tier": "featured",
      "category": "Inscripciones",
      "questions": ["...", "..."],
      "answer": "..."
    }
  ]
}
```

**B) Compatibilidad (legacy)**

```json
{
  "featured": [
    { "id": "q1", "question": "...", "answer": "...", "category": "..." }
  ],
  "faq": [
    { "id": "q4", "question": "...", "answer": "...", "category": "..." }
  ],
  "archive": [
    { "id": "q6", "question": "...", "answer": "...", "category": "..." }
  ]
}
```

## 2) Cargar / actualizar el KB

### Opción 1 — CLI (recomendado)

- `npm run faqs:upload-kb`

Sube un archivo `uconnect-faq-kb.json` generado desde `src/config/admission-faq.ts` y lo etiqueta con `kind=faq_kb`.

### Opción 2 — API (admin)

- `POST /api/admin/vector-store/files?kind=faq_kb`
  - `multipart/form-data`
  - campo: `file`

Para inspeccionar IDs y atributos:

- `GET /api/admin/vector-store/vector-files`

### Override (opcional)

Si necesitas forzar un archivo específico:

- `FAQ_KB_VECTOR_STORE_FILE_ID=<vector_store_file_id>`

## 2.1) Editar FAQs (Admin CRUD)

Además de “subir un archivo”, el backend expone endpoints **admin** para **crear/editar/eliminar** preguntas.

Importante:

- Estos endpoints **no modifican el archivo existente** en el Vector Store (OpenAI no permite editar contenido in-place).
- Cada operación genera y sube un **nuevo** `FAQ KB` (JSON) etiquetado con `attributes.kind="faq_kb"`.
- El runtime refresca el snapshot automáticamente después de guardar.

Endpoints:

- `GET /api/admin/faq-kb`
  - Retorna el KB actual: metadata del archivo + `entries`.
  - Query opcional: `forceRefresh=true`.
- `POST /api/admin/faq-kb/entries`
  - Crea una FAQ.
  - Body: `{ tier, category, question|questions, answer, id?, source? }`.
- `PATCH /api/admin/faq-kb/entries/:id`
  - Edita una FAQ existente.
  - Body: patch parcial `{ tier?, category?, question?|questions?, answer?, source?, isActive? }`.
- `DELETE /api/admin/faq-kb/entries/:id`
  - Desactiva una FAQ (`isActive=false`) y sube un KB nuevo.
  - Para reactivar: `PATCH` con `{ "isActive": true }`.

Nota sobre `FAQ_KB_VECTOR_STORE_FILE_ID`:

- Si defines este override en `.env`, el runtime usará **siempre** ese archivo fijo.
- Para usar CRUD admin sin confusiones, se recomienda **no** usar el override (o actualizarlo al nuevo ID).

## 3) Matching (cómo decide una respuesta)

Servicio: `FaqService` (`faqService.match(message)`).

Estrategia:

1. Normaliza el mensaje (`normalizeText`).
2. Match exacto por pregunta normalizada.
3. Si no hay exacto:
   - extrae keywords (`extractKeywords`)
   - prefiltra candidatos por overlap de keywords
4. Score:
   - similitud por Levenshtein (`calculateSimilarity`)
   - señal extra por “contains”
   - bonus por overlap de keywords
5. Umbrales por longitud/query corta.

## 4) Endpoints REST de FAQ

- `GET /api/faq/questions`
  - Por defecto retorna `featured`, `faq` y `archive`.
  - `includeArchive=false` para excluir `archive`.
  - `503 FAQ_KB_UNAVAILABLE` si el KB no está disponible.
- `GET /api/faq/search?q=...&limit=...`
  - Retorna top N con `{ id, question, category, tier, score }` (sin `answer`).
  - `503 FAQ_KB_UNAVAILABLE` si el KB no está disponible.
- `GET /api/faq/:questionId`
  - Retorna `{ id, answer, cached: true, timestamp }`.
  - `404 QUESTION_NOT_FOUND`.
  - `503 FAQ_KB_UNAVAILABLE` si el KB no está disponible.

## 5) Integración con el chat (early-exit)

- `POST /api/chat` y `Chatbot.processMessage()` consultan `faqService.match()` antes del enrutamiento.
- Si hay match: responde con `sources: ["FAQ"]` y evita invocar GPT.

Nota: si el KB no está disponible, el match falla silenciosamente y el chat continúa (no rompe la conversación).

## 6) Variables de entorno

Para FAQ KB:

- `OPENAI_API_KEY`
- `OPENAI_VECTOR_STORE_ID`
- (opcional) `FAQ_KB_VECTOR_STORE_FILE_ID`

Mongo sigue siendo requerido para historial de chat (`MONGODB_URI`), pero **FAQ ya no depende de Mongo**.

## 7) Probar con Postman

- `postman/uconnect-api.postman_collection.json`
