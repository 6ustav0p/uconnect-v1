# OpenAI Agents Integration - UConnect GPT

## Descripción

Este módulo integra OpenAI Agents con el sistema UConnect para proporcionar respuestas inteligentes a las consultas de estudiantes usando GPT-3.5-turbo y búsqueda vectorial.

## Configuración

### 1. Configurar API Key de OpenAI

Agrega tu API key de OpenAI en el archivo `.env`:

```env
OPENAI_API_KEY=sk-your-openai-api-key-here
```

### 2. Instalar dependencias

```bash
npm install --legacy-peer-deps
```

## Uso

### Ejecución básica

```bash
npm run gpt
```

Este comando ejecutará el agente con una consulta predeterminada: "¿Cuáles son los programas académicos disponibles?"

### Ejecución con consulta personalizada

```bash
npm run gpt "¿Cuáles son los requisitos para ingresar a Ingeniería de Sistemas?"
```

## Arquitectura

### Componentes principales

1. **OpenAI Client**: Cliente configurado con tu API key
2. **UConnect Agent**: Agente GPT configurado con instrucciones específicas para responder dudas estudiantiles
3. **Runner**: Ejecutor de conversaciones del agente
4. **Vector Store Search**: Búsqueda en documentos indexados usando embeddings

### Flujo de ejecución

1. Se recibe una consulta del usuario
2. Se crea un historial de conversación con la consulta
3. El agente GPT procesa la consulta y genera una respuesta
4. Se realiza una búsqueda en el vector store para encontrar documentos relevantes
5. Se retornan los resultados con metadatos (file_id, filename, score)

## Configuración del agente

El agente está configurado con:

- **Model**: gpt-3.5-turbo
- **Temperature**: 1 (respuestas creativas)
- **Top P**: 1
- **Max Tokens**: 2048
- **Instructions**: Asistente especializado en responder dudas estudiantiles sobre documentos

## Vector Store

El sistema utiliza un vector store preconfigurado con ID: `vs_69928e75718081919dfe62e295cf99bf`

Para actualizar o configurar un nuevo vector store:
1. Crea un vector store en OpenAI
2. Sube los documentos relevantes
3. Actualiza el ID del vector store en `src/gpt-agent.ts`

## Dependencias

- `openai@^4.75.0` - SDK oficial de OpenAI
- `@openai/agents@^0.2.0` - Framework de agentes de OpenAI
- `ts-node` - Ejecución de TypeScript en desarrollo

## Estructura del código

```typescript
// src/gpt-agent.ts
├── OpenAI Client (configuración)
├── UConnect Agent (definición del agente)
├── runWorkflow() (función principal)
│   ├── Configuración del runner
│   ├── Ejecución del agente
│   └── Búsqueda vectorial
└── main() (CLI entrypoint)
```

## Notas

- El sistema está integrado con tracing usando `withTrace()` para monitoreo
- Los resultados incluyen scoring de relevancia para cada documento encontrado
- El workflow ID es único y se configura en el metadata del runner
