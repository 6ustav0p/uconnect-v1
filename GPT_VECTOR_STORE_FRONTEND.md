# Plan de Implementación Frontend: Gestión de Archivos para GPT

Este documento detalla los pasos para crear una interfaz de usuario que permita gestionar los archivos del *Vector Store* de OpenAI, utilizando los nuevos endpoints del backend.

## Nuevo: Chat guiado para aspirantes

El backend ahora devuelve preguntas sugeridas para guiar a estudiantes en el proceso de inscripción. El frontend no debe decidir si una pregunta va a GPT o a Ollama; solo debe mostrar las sugerencias y enviar el mensaje al endpoint unificado `/api/chat`.

### Contrato de sesión

Cuando el frontend crea una sesión con `POST /api/chat/session`, la respuesta incluye:

```json
{
  "sessionId": "string",
  "suggestedQuestions": [
    "¿Cómo es el proceso de inscripción para aspirantes?",
    "¿Qué documentos necesito para inscribirme?",
    "¿Qué debo hacer después de la preinscripción o de obtener el token?"
  ]
}
```

### Comportamiento esperado en la UI

1. Mostrar esas 3 preguntas como botones cuando se abra el chat o cuando el bot salude.
2. Al pulsar un botón, enviar ese texto tal cual al endpoint `POST /api/chat`.
3. No duplicar lógica de ruteo en frontend: el backend ya separa PEP/documental vs. materias/pensum.
4. Si el backend devuelve `suggestedQuestions` en una respuesta de saludo, reutilizar esa lista para refrescar los botones.

## Paso a paso para implementar el chat guiado en frontend

### Paso 1: Crear el contrato de sesión

Cuando el usuario abra el chat, el frontend debe llamar a `POST /api/chat/session`. Esa respuesta debe guardarse en estado local o global porque trae el `sessionId` y las preguntas sugeridas.

Respuesta esperada:

```json
{
  "sessionId": "abc123",
  "suggestedQuestions": [
    "¿Cómo es el proceso de inscripción para aspirantes?",
    "¿Qué documentos necesito para inscribirme?",
    "¿Qué debo hacer después de la preinscripción o de obtener el token?"
  ]
}
```

### Paso 2: Pintar las 3 preguntas como botones

En el componente del chat, agrega un bloque de botones debajo del mensaje inicial o del saludo del bot. Cada botón debe usar el texto exacto del array `suggestedQuestions`.

Reglas de UI:

1. Si existe `suggestedQuestions`, mostrarlas como botones.
2. Si el usuario envía un mensaje manual, los botones pueden seguir visibles o reemplazarse por otras sugerencias del backend.
3. No crear lógica separada para decidir si el mensaje va a GPT o a Ollama.

### Paso 3: Enviar el texto al endpoint unificado

Cuando el usuario pulse una sugerencia, el frontend debe enviar ese texto a `POST /api/chat` igual que si lo hubiera escrito manualmente.

Ejemplo de payload:

```json
{
  "sessionId": "abc123",
  "message": "¿Cómo es el proceso de inscripción para aspirantes?"
}
```

### Paso 4: Mostrar la respuesta y refrescar sugerencias

La respuesta del backend puede incluir:

```json
{
  "sessionId": "abc123",
  "response": {
    "message": "...",
    "engine": "local-chat | gpt-rag",
    "route": "general | documents",
    "sources": ["..."]
  }
}
```

La UI debe:

1. Agregar el mensaje del bot al historial.
2. Si la respuesta trae `suggestedQuestions`, actualizar los botones.
3. Si no trae sugerencias, mantener las anteriores o usar el set inicial.

### Paso 5: Separar visualmente los dos tipos de ayuda

La interfaz puede ayudar al usuario con microcopys simples:

1. PEP y preguntas documentales: se responderán con GPT.
2. Materias, semestres, créditos y pensum: se responderán con el motor local.
3. El frontend solo muestra el resultado, no decide la ruta.

### Paso 6: Prueba rápida de la UI

Antes de integrar con la pantalla final, valida estos 3 casos:

1. Abrir el chat y ver los 3 botones.
2. Hacer clic en un botón y confirmar que la conversación avanza.
3. Enviar una pregunta de PEP y verificar que el backend responde con el motor documental.

## Requisitos Previos

1.  El servidor backend de UConnect debe estar corriendo (`npm run dev`).
2.  El archivo `.env` del backend debe tener las variables `OPENAI_API_KEY` y `OPENAI_VECTOR_STORE_ID` configuradas.
3.  La interfaz se construirá asumiendo un framework moderno como React, Vue o Svelte, pero los ejemplos de código usarán la API `fetch` nativa, que es fácilmente adaptable.

---

## Paso 1: Crear el Servicio de API en el Frontend

Es una buena práctica encapsular las llamadas a la API en un único lugar. Crea un archivo como `src/services/vectorStoreApi.js`.

```javascript
const API_BASE_URL = "http://localhost:3000/api/admin/vector-store";

/**
 * Obtiene la lista de archivos del Vector Store.
 * @returns {Promise<Array>} Una lista de objetos de archivo.
 */
export async function listFiles() {
  const response = await fetch(`${API_BASE_URL}/files`);
  if (!response.ok) {
    throw new Error("Error al obtener la lista de archivos.");
  }
  const result = await response.json();
  return result.data;
}

/**
 * Sube un nuevo archivo al Vector Store.
 * @param {File} file - El objeto File del input.
 * @returns {Promise<Object>} El objeto del archivo creado.
 */
export async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/files`, {
    method: "POST",
    body: formData,
    // No incluyas 'Content-Type', el navegador lo establece automáticamente para FormData.
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || "Error al subir el archivo.");
  }
  
  return response.json();
}

/**
 * Elimina un archivo del Vector Store.
 * @param {string} fileId - El ID del archivo a eliminar.
 * @returns {Promise<void>}
 */
export async function deleteFile(fileId) {
  const response = await fetch(`${API_BASE_URL}/files/${fileId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Error al eliminar el archivo.");
  }
}
```

---

## Paso 2: Crear el Componente de Gestión de Archivos

Ahora, crea el componente principal que usará este servicio. A continuación, un ejemplo conceptual en React.

**Componente: `VectorStoreManager.jsx`**

Este componente tendrá tres responsabilidades principales:
1.  Mostrar la lista de archivos existentes.
2.  Permitir la subida de un nuevo archivo.
3.  Permitir la eliminación de archivos.

```jsx
import React, { useState, useEffect } from "react";
import { listFiles, uploadFile, deleteFile } from "./services/vectorStoreApi";

function VectorStoreManager() {
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Función para cargar los archivos
  const fetchFiles = async () => {
    try {
      setIsLoading(true);
      const fileList = await listFiles();
      setFiles(fileList);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Cargar archivos al montar el componente
  useEffect(() => {
    fetchFiles();
  }, []);

  // Manejador para la subida de archivos
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      setError(null);
      await uploadFile(file);
      // Refrescar la lista de archivos después de una subida exitosa
      await fetchFiles(); 
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      // Limpiar el input para poder subir el mismo archivo de nuevo
      event.target.value = null; 
    }
  };

  // Manejador para eliminar un archivo
  const handleDeleteFile = async (fileId) => {
    if (!window.confirm("¿Estás seguro de que quieres eliminar este archivo?")) {
      return;
    }
    
    try {
      setError(null);
      // Opcional: Deshabilitar el botón mientras se elimina
      // setFiles(files.map(f => f.id === fileId ? { ...f, deleting: true } : f));
      await deleteFile(fileId);
      // Refrescar la lista de archivos
      await fetchFiles();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h2>Gestión de Archivos del Asistente GPT</h2>

      {/* Sección de Subida */}
      <div>
        <h3>Subir Nuevo Documento</h3>
        <input type="file" onChange={handleFileUpload} disabled={uploading} accept=".pdf,.txt,.md,.docx" />
        {uploading && <p>Subiendo y procesando archivo... Esto puede tardar un momento.</p>}
      </div>

      {/* Mensajes de Estado */}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {/* Lista de Archivos */}
      <h3>Archivos en el Vector Store</h3>
      {isLoading ? (
        <p>Cargando archivos...</p>
      ) : (
        <ul>
          {files.length === 0 && <p>No hay archivos en el Vector Store.</p>}
          {files.map((file) => (
            <li key={file.id}>
              <span>{file.filename}</span>
              <small> (ID: {file.id}) - Creado: {new Date(file.created_at * 1000).toLocaleString()}</small>
              <button onClick={() => handleDeleteFile(file.id)} style={{ marginLeft: '10px' }}>
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default VectorStoreManager;
```

---

## Paso 3: Integrar el Componente en la Aplicación

Finalmente, importa y renderiza el componente `VectorStoreManager` en la sección de administración de tu aplicación.

```jsx
// En tu archivo principal de la sección de admin, por ejemplo: AdminPage.jsx

import React from "react";
import VectorStoreManager from "./components/VectorStoreManager";

function AdminPage() {
  return (
    <div>
      <h1>Panel de Administración</h1>
      <hr />
      <VectorStoreManager />
      {/* Otros componentes de administración... */}
    </div>
  );
}

export default AdminPage;
```

## Consideraciones Adicionales

*   **Estilos**: El ejemplo no incluye CSS. Deberás aplicar estilos para que coincida con el diseño de tu aplicación.
*   **Gestión de Estado Avanzada**: Para aplicaciones más complejas, considera usar una librería de gestión de estado (como Redux, Zustand o el Context API de React) para manejar el estado de la carga, los archivos y los errores de forma global.
*   **Feedback al Usuario**: Mejora la experiencia del usuario mostrando indicadores de carga más visuales (spinners, barras de progreso) y notificaciones de éxito/error (toasts).
*   **Seguridad**: Asegúrate de que la página de administración que contiene este componente esté protegida y solo sea accesible para usuarios autorizados.

Con estos pasos, tendrás una interfaz funcional para gestionar la base de conocimiento de tu asistente GPT directamente desde tu aplicación.
