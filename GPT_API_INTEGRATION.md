# Plan de Integración: GPT Agent API

## Resumen

El backend expone un endpoint `/api/gpt/chat` que permite enviar mensajes al agente GPT con RAG (Retrieval-Augmented Generation). Este agente busca en documentos institucionales y responde basándose únicamente en información verificable.

---

## Endpoints

### 1. Chat con GPT Agent

```
POST /api/gpt/chat
Content-Type: application/json
```

#### Request

```typescript
interface GptChatRequest {
  message: string;  // Requerido. Máximo 1000 caracteres
}
```

**Ejemplo:**
```json
{
  "message": "¿Cuál es el perfil del egresado de Ingeniería de Sistemas?"
}
```

#### Response (exitosa - 200)

```typescript
interface GptChatResponse {
  response: string;  // Respuesta del agente GPT
  documents: Array<{
    id: string;       // ID del documento en OpenAI
    filename: string; // Nombre del archivo fuente (ej: "PEP_Ing_Sistemas.pdf")
    score: number;    // Relevancia (0 a 1, donde 1 es máxima relevancia)
  }>;
}
```

**Ejemplo:**
```json
{
  "response": "El perfil del egresado de Ingeniería de Sistemas incluye competencias en desarrollo de software, gestión de proyectos tecnológicos y análisis de sistemas...",
  "documents": [
    {
      "id": "file-abc123",
      "filename": "PEP_Ingenieria_Sistemas_2024.pdf",
      "score": 0.8945
    },
    {
      "id": "file-def456",
      "filename": "Plan_Estudios_Sistemas.pdf",
      "score": 0.7234
    }
  ]
}
```

#### Response (error)

```typescript
interface ErrorResponse {
  error: true;
  code: "INVALID_REQUEST" | "MESSAGE_TOO_LONG" | "RATE_LIMIT" | "INTERNAL_ERROR";
  message: string;
}
```

**Códigos de error:**

| Código | HTTP Status | Descripción |
|--------|-------------|-------------|
| `INVALID_REQUEST` | 400 | El campo `message` no fue enviado o no es string |
| `MESSAGE_TOO_LONG` | 400 | El mensaje excede 1000 caracteres |
| `RATE_LIMIT` | 429 | Demasiadas solicitudes (máx 30/min) |
| `INTERNAL_ERROR` | 500 | Error interno del servidor |

---

### 2. Health Check GPT

```
GET /api/gpt/health
```

#### Response

```typescript
interface GptHealthResponse {
  status: "available" | "unavailable";
  provider: "openai";
}
```

**Ejemplo:**
```json
{
  "status": "available",
  "provider": "openai"
}
```

---

## Implementación Frontend

### Service Layer

```typescript
// services/gptChat.ts

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface GptDocument {
  id: string;
  filename: string;
  score: number;
}

export interface GptResponse {
  response: string;
  documents: GptDocument[];
}

export interface GptError {
  error: true;
  code: string;
  message: string;
}

/**
 * Envía un mensaje al agente GPT
 * @param message - Pregunta del usuario (máx 1000 chars)
 * @returns Respuesta del agente con documentos fuente
 */
export async function sendGptMessage(message: string): Promise<GptResponse> {
  const res = await fetch(`${API_URL}/api/gpt/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || 'Error al procesar mensaje');
  }

  return data;
}

/**
 * Verifica si el servicio GPT está disponible
 */
export async function checkGptHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/gpt/health`);
    const data = await res.json();
    return data.status === 'available';
  } catch {
    return false;
  }
}
```

---

### Custom Hook (React)

```typescript
// hooks/useGptChat.ts

import { useState, useCallback } from 'react';
import { sendGptMessage, GptResponse } from '@/services/gptChat';

interface UseGptChatReturn {
  response: GptResponse | null;
  loading: boolean;
  error: string | null;
  sendMessage: (message: string) => Promise<void>;
  reset: () => void;
}

export function useGptChat(): UseGptChatReturn {
  const [response, setResponse] = useState<GptResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const result = await sendGptMessage(message);
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResponse(null);
    setError(null);
  }, []);

  return { response, loading, error, sendMessage, reset };
}
```

---

### Componente de Chat

```tsx
// components/GptChat.tsx

import { useState, FormEvent } from 'react';
import { useGptChat } from '@/hooks/useGptChat';

export function GptChat() {
  const [message, setMessage] = useState('');
  const { response, loading, error, sendMessage } = useGptChat();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim() || loading) return;

    await sendMessage(message);
    setMessage('');
  };

  return (
    <div className="gpt-chat">
      {/* Input Form */}
      <form onSubmit={handleSubmit} className="chat-form">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Escribe tu pregunta sobre la universidad..."
          maxLength={1000}
          disabled={loading}
          className="chat-input"
        />
        <button 
          type="submit" 
          disabled={loading || !message.trim()}
          className="chat-submit"
        >
          {loading ? 'Procesando...' : 'Enviar'}
        </button>
      </form>

      {/* Character Counter */}
      <span className="char-count">{message.length}/1000</span>

      {/* Error Message */}
      {error && (
        <div className="chat-error">
          <p>❌ {error}</p>
        </div>
      )}

      {/* Response */}
      {response && (
        <div className="chat-response">
          <div className="response-text">
            <p>{response.response}</p>
          </div>

          {/* Document Sources */}
          {response.documents.length > 0 && (
            <div className="response-sources">
              <h4>📄 Fuentes consultadas:</h4>
              <ul>
                {response.documents.map((doc, index) => (
                  <li key={doc.id}>
                    <span className="doc-name">{doc.filename}</span>
                    <span className="doc-score">
                      Relevancia: {(doc.score * 100).toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="chat-loading">
          <p>🔍 Buscando en documentos institucionales...</p>
        </div>
      )}
    </div>
  );
}
```

---

### Estilos CSS (opcional)

```css
/* styles/gpt-chat.css */

.gpt-chat {
  max-width: 600px;
  margin: 0 auto;
  padding: 1rem;
}

.chat-form {
  display: flex;
  gap: 0.5rem;
}

.chat-input {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 1rem;
}

.chat-input:disabled {
  background-color: #f5f5f5;
}

.chat-submit {
  padding: 0.75rem 1.5rem;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
}

.chat-submit:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.char-count {
  display: block;
  text-align: right;
  font-size: 0.75rem;
  color: #666;
  margin-top: 0.25rem;
}

.chat-error {
  background-color: #fee;
  border: 1px solid #fcc;
  border-radius: 8px;
  padding: 1rem;
  margin-top: 1rem;
  color: #c00;
}

.chat-response {
  margin-top: 1rem;
  padding: 1rem;
  background-color: #f8f9fa;
  border-radius: 8px;
}

.response-text {
  margin-bottom: 1rem;
  line-height: 1.6;
}

.response-sources {
  border-top: 1px solid #ddd;
  padding-top: 1rem;
}

.response-sources h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.9rem;
  color: #666;
}

.response-sources ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.response-sources li {
  display: flex;
  justify-content: space-between;
  padding: 0.25rem 0;
  font-size: 0.85rem;
}

.doc-name {
  color: #333;
}

.doc-score {
  color: #666;
}

.chat-loading {
  text-align: center;
  padding: 2rem;
  color: #666;
}
```

---

## Consideraciones Técnicas

| Aspecto | Detalle |
|---------|---------|
| **Rate Limit** | 30 requests por minuto por IP |
| **Máximo mensaje** | 1000 caracteres |
| **Timeout sugerido** | 30 segundos (RAG puede tardar en buscar documentos) |
| **CORS** | Ya configurado en el backend |
| **Stateless** | No requiere sesión, cada request es independiente |
| **Base URL** | `http://localhost:3000` (desarrollo) |

---

## Diferencia con `/api/chat`

El backend tiene dos endpoints de chat con propósitos diferentes:

| Endpoint | Provider | Características | Uso recomendado |
|----------|----------|-----------------|-----------------|
| `POST /api/chat` | Ollama (local) | Chat con historial, sesiones | Conversaciones generales |
| `POST /api/gpt/chat` | OpenAI GPT | RAG con documentos, stateless | Consultas sobre documentos institucionales |

---

## Ejemplo de Flujo Completo

```typescript
// 1. Verificar disponibilidad (opcional)
const isAvailable = await checkGptHealth();
if (!isAvailable) {
  showNotification('El servicio GPT no está disponible');
  return;
}

// 2. Enviar mensaje
try {
  const result = await sendGptMessage('¿Cuáles son los requisitos de grado?');
  
  // 3. Mostrar respuesta
  console.log('Respuesta:', result.response);
  
  // 4. Mostrar fuentes
  result.documents.forEach(doc => {
    console.log(`- ${doc.filename} (${(doc.score * 100).toFixed(0)}% relevante)`);
  });
  
} catch (error) {
  console.error('Error:', error.message);
}
```

---

## Variables de Entorno (Frontend)

```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:3000
```

Para producción:
```env
NEXT_PUBLIC_API_URL=https://api.tudominio.com
```
