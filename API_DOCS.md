# 🎓 UConnect API - Documentación para Frontend

## Descripción General

API REST para el chatbot de admisiones de la **Universidad de Córdoba**. Proporciona acceso a información académica de programas de pregrado y un asistente conversacional powered by IA (Ollama).

**Base URL:** `http://localhost:3000/api`

---

## 🔐 Autenticación

Actualmente la API no requiere autenticación. Se recomienda implementar JWT para producción.

---

## 📡 Endpoints

### 1. Chat

#### **POST** `/api/chat`

Envía un mensaje al chatbot y recibe una respuesta.

**Request Body:**

```json
{
  "sessionId": "uuid-opcional",
  "message": "¿Qué materias tiene el primer semestre de ingeniería de sistemas?",
  "userId": "usuario-opcional"
}
```

| Campo       | Tipo   | Requerido | Descripción                                                  |
| ----------- | ------ | --------- | ------------------------------------------------------------ |
| `sessionId` | string | No        | UUID de sesión existente. Si no se envía, se crea una nueva. |
| `message`   | string | **Sí**    | Mensaje del usuario (1-1000 caracteres)                      |
| `userId`    | string | No        | Identificador del usuario                                    |

**Response (200):**

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "response": {
    "message": "Las materias del primer semestre de Ingeniería de Sistemas son:\n- ALGEBRA LINEAL (3 créditos)\n- CALCULO I (3 créditos)\n- LÓGICA COMPUTACIONAL (3 créditos)...",
    "sources": ["Datos de Programas Académicos", "Pensum 2018-2"],
    "tokensUsed": {
      "input": 922,
      "output": 154
    }
  }
}
```

**Ejemplo de uso:**

```javascript
const response = await fetch("http://localhost:3000/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sessionId: localStorage.getItem("chatSessionId"),
    message: userInput,
  }),
});

const data = await response.json();
// Guardar sessionId para mantener contexto
localStorage.setItem("chatSessionId", data.sessionId);
```

---

#### **POST** `/api/chat/session`

Crea una nueva sesión de chat.

**Response (201):**

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

#### **GET** `/api/chat/:sessionId/history`

Obtiene el historial de mensajes de una sesión.

**Response (200):**

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "messages": [
    {
      "role": "user",
      "content": "Hola",
      "timestamp": "2026-01-31T15:30:00.000Z"
    },
    {
      "role": "assistant",
      "content": "¡Hola! 👋 Soy UConnect, tu asistente virtual...",
      "timestamp": "2026-01-31T15:30:01.500Z"
    }
  ]
}
```

---

#### **DELETE** `/api/chat/:sessionId`

Finaliza y limpia una sesión de chat.

**Response (200):**

```json
{
  "message": "Sesión finalizada correctamente"
}
```

---

### 2. Datos Académicos

#### **GET** `/api/facultades`

Lista todas las facultades de la universidad.

**Response (200):**

```json
{
  "data": [
    {
      "unid_id": "7",
      "unid_nombre": "FACULTAD DE CIENCIAS AGRICOLAS"
    },
    {
      "unid_id": "12",
      "unid_nombre": "FACULTAD DE CIENCIAS BASICAS"
    }
  ],
  "total": 7
}
```

---

#### **GET** `/api/programas`

Lista programas académicos de **pregrado** (excluye maestrías, doctorados, especializaciones).

**Query Parameters:**

| Parámetro  | Tipo   | Descripción                     |
| ---------- | ------ | ------------------------------- |
| `nombre`   | string | Filtrar por nombre del programa |
| `facultad` | string | Filtrar por nombre de facultad  |

**Ejemplo:** `/api/programas?facultad=ingenierias`

**Response (200):**

```json
{
  "data": [
    {
      "prog_id": "283",
      "prog_nombre": "INGENIERÍA DE SISTEMAS - DIURNA",
      "facultad_id": "31",
      "facultad_nombre": "FACULTAD DE INGENIERIAS"
    },
    {
      "prog_id": "17",
      "prog_nombre": "INGENIERÍA DE SISTEMAS - TARDE-NOCHE",
      "facultad_id": "31",
      "facultad_nombre": "FACULTAD DE INGENIERIAS"
    }
  ],
  "total": 52
}
```

---

#### **GET** `/api/programas/:programaId/pensum`

Obtiene el pensum completo de un programa.

**Response (200):**

```json
{
  "programa": "INGENIERIA DE SISTEMAS",
  "jornada": "TARDE-NOCHE",
  "versionPensum": "2018-2",
  "creditosTotales": "165",
  "semestres": {
    "1": {
      "materias": [
        {
          "codigo": "440101",
          "nombre": "ALGEBRA LINEAL",
          "creditos": "3"
        },
        {
          "codigo": "440102",
          "nombre": "CALCULO I",
          "creditos": "3"
        }
      ],
      "totalCreditos": "17"
    },
    "2": {
      "materias": [...],
      "totalCreditos": "16"
    }
  }
}
```

---

#### **GET** `/api/materias`

Busca materias con filtros.

**Query Parameters:**

| Parámetro  | Tipo   | Descripción               |
| ---------- | ------ | ------------------------- |
| `programa` | string | Nombre del programa       |
| `semestre` | string | Número de semestre (1-10) |
| `nombre`   | string | Nombre de la materia      |
| `jornada`  | string | DIURNA, NOCTURNA, etc.    |

**Ejemplo:** `/api/materias?programa=sistemas&semestre=5`

**Response (200):**

```json
{
  "data": [
    {
      "programa": "INGENIERIA DE SISTEMAS",
      "semestre": "5",
      "materia": "BASES DE DATOS I",
      "codigo_materia": "440501",
      "creditos": "3",
      "jornada": "TARDE-NOCHE"
    }
  ],
  "total": 6
}
```

---

#### **GET** `/api/programas-con-pensum`

Lista los nombres de todos los programas de pregrado que tienen pensum disponible.

**Response (200):**

```json
{
  "data": [
    "ACUICULTURA",
    "ADMINISTRACION EN SALUD",
    "ADMINISTRACIÓN EN FINANZAS Y NEGOCIOS INTERNACIONALES-MJD",
    "BACTERIOLOGÍA",
    "BIOLOGÍA",
    "DERECHO",
    "ENFERMERÍA",
    "INGENIERIA DE SISTEMAS",
    "INGENIERIA INDUSTRIAL"
  ],
  "total": 36
}
```

---

### 3. Sistema

#### **GET** `/api/stats`

Estadísticas del sistema.

**Response (200):**

```json
{
  "facultades": 7,
  "programas": 52,
  "programasConPensum": 36,
  "materiasUnicas": 2108,
  "chatsActivos": 15
}
```

---

#### **GET** `/api/health`

Health check del servicio.

**Response (200):**

```json
{
  "status": "ok",
  "timestamp": "2026-01-31T15:30:00.000Z",
  "services": {
    "database": "connected",
    "ollama": "available"
  }
}
```

---

## ⚠️ Manejo de Errores

Todas las respuestas de error siguen este formato:

```json
{
  "error": true,
  "code": "ERROR_CODE",
  "message": "Descripción legible del error",
  "details": {}
}
```

### Códigos de Error

| HTTP | Código               | Descripción                                  |
| ---- | -------------------- | -------------------------------------------- |
| 400  | `INVALID_REQUEST`    | Request body inválido o parámetros faltantes |
| 400  | `MESSAGE_TOO_LONG`   | Mensaje excede 1000 caracteres               |
| 404  | `SESSION_NOT_FOUND`  | Sesión de chat no encontrada                 |
| 404  | `PROGRAMA_NOT_FOUND` | Programa académico no encontrado             |
| 429  | `RATE_LIMIT`         | Demasiadas solicitudes (máx 30/min)          |
| 500  | `INTERNAL_ERROR`     | Error interno del servidor                   |
| 503  | `OLLAMA_UNAVAILABLE` | Servicio de IA no disponible                 |

---

## 💡 Ejemplos de Integración

### React/Next.js

```typescript
// hooks/useChat.ts
import { useState, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const sendMessage = useCallback(
    async (content: string) => {
      setLoading(true);
      setMessages((prev) => [...prev, { role: "user", content }]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, message: content }),
        });

        const data = await res.json();

        if (data.error) throw new Error(data.message);

        setSessionId(data.sessionId);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.response.message,
          },
        ]);
      } catch (error) {
        console.error("Chat error:", error);
      } finally {
        setLoading(false);
      }
    },
    [sessionId],
  );

  const clearChat = useCallback(() => {
    setMessages([]);
    setSessionId(null);
  }, []);

  return { messages, sendMessage, clearChat, loading };
}
```

### Vue.js

```typescript
// composables/useChat.ts
import { ref } from "vue";

export function useChat() {
  const messages = ref([]);
  const sessionId = ref(null);
  const loading = ref(false);

  async function sendMessage(content: string) {
    loading.value = true;
    messages.value.push({ role: "user", content });

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionId.value,
        message: content,
      }),
    });

    const data = await res.json();
    sessionId.value = data.sessionId;
    messages.value.push({
      role: "assistant",
      content: data.response.message,
    });

    loading.value = false;
  }

  return { messages, sendMessage, loading };
}
```

---

## 🔄 Flujo de Conversación Recomendado

```
1. Usuario abre el chat
   └─> Frontend puede crear sesión con POST /api/chat/session
       o dejar que se cree automáticamente en el primer mensaje

2. Usuario envía mensaje
   └─> POST /api/chat { message: "...", sessionId: "..." }

3. Backend procesa y responde
   └─> Mantiene contexto de la conversación por sessionId

4. Usuario continúa conversando
   └─> Usar el mismo sessionId para mantener contexto
       (ej: "y de décimo semestre?" después de preguntar por un programa)

5. Usuario cierra el chat
   └─> Opcional: DELETE /api/chat/:sessionId
```

---

## 📊 Datos Disponibles

| Recurso              | Cantidad | Descripción                               |
| -------------------- | -------- | ----------------------------------------- |
| Facultades           | 7        | Todas las facultades de la Universidad    |
| Programas Pregrado   | 52       | Carreras de pregrado (excluye postgrados) |
| Programas con Pensum | 36       | Programas con plan de estudios completo   |
| Materias             | 2,108    | Materias únicas en todos los pensum       |

---

## 🚀 Configuración CORS

La API acepta requests desde:

- `http://localhost:3000` (desarrollo)
- `http://localhost:5173` (Vite dev server)
- Configurar `CORS_ORIGIN` en producción

---

## 📝 Notas Importantes

1. **Contexto conversacional**: El chatbot mantiene contexto por sesión. Si el usuario pregunta "materias de sistemas" y luego "y de segundo semestre?", el bot entiende que se refiere a Ing. de Sistemas.

2. **Solo pregrado**: La API solo devuelve información de programas de pregrado. Maestrías, doctorados y especializaciones están filtrados.

3. **Tiempo de respuesta**: Las respuestas del chat pueden tomar 2-5 segundos debido al procesamiento con IA local (Ollama).

4. **Rate limiting**: Máximo 30 requests por minuto por IP para el endpoint de chat.

---

**Última actualización:** Enero 2026  
**Versión API:** 1.0.0
