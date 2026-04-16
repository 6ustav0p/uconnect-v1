# FAQ Sistema de Preguntas Frecuentes Cacheadas

## Descripción

Se implementó un sistema eficiente de preguntas frecuentes (FAQ) con respuestas **pre-cacheadas** para evitar latencia en las respuestas. El sistema se divide en tres niveles:

### Niveles de Preguntas

1. **Featured (3 preguntas)** - Siempre visibles
   - Se muestran automáticamente al crear una sesión de chat
   - Son las másfrecuentes e importantes para aspirantes
   - Se presentan como botones de "acceso rápido"

2. **FAQ Selector (5 preguntas adicionales)** - Selector/dropdown
   - Preguntas complementarias de alto valor
   - Se cargan en un dropdown o selector para exploración
   - Ordenadas por categoría (Inscripciones, Admisión, Matrícula, etc.)

3. **Archive (14 preguntas)** - Almacenadas para búsqueda futura
   - Respuestas ya cacheadas pero no mostradas por defecto
   - Disponibles para búsqueda y extensión del FAQ
   - Base para futuras mejoras de IA/búsqueda fuzzy

**Total: 22 preguntas cacheadas** (3 featured + 5 FAQ + 14 archive)

---

## APIs Disponibles

### 1. Obtener Lista de Preguntas
```http
GET /api/faq/questions
```

**Respuesta:**
```json
{
  "featured": [
    {
      "id": "q1",
      "question": "¿Cuándo se abren las inscripciones para los programas de pregrado?",
      "category": "Inscripciones"
    },
    { ... 2 más }
  ],
  "faq": [
    {
      "id": "q4",
      "question": "¿Qué documentos necesito para realizar la inscripción?",
      "category": "Inscripciones"
    },
    { ... 4 más }
  ],
  "total": 8
}
```

---

### 2. Obtener Respuesta Cacheada
```http
GET /api/faq/:questionId
```

**Ejemplo:**
```http
GET /api/faq/q1
```

**Respuesta:**
```json
{
  "id": "q1",
  "answer": "Las inscripciones para los programas de pregrado estásujetas al inicio de la respectiva convocatoria. Para el periodo académico 2026-1, el inicio del proceso de inscripción es del 27 de octubre de 2025 al 28 de diciembre de 2025, según el Acuerdo N°035 que aprueba el calendario académico de pregrado.",
  "cached": true,
  "timestamp": "2026-04-14T05:48:27.070Z"
}
```

**Tiempo de respuesta:** ⚡ < 50ms (respuesta directa, sin procesamiento)

---

## Implementación Frontend

### Flujo Recomendado

1. **Al iniciar sesión:**
   ```javascript
   // Obtener preguntas disponibles
   const { featured, faq } = await fetch('/api/faq/questions').then(r => r.json());
   
   // Mostrar 3 botones con featured
   renderFeaturedButtons(featured);
   
   // Mostrar dropdown/selector con FAQ
   renderFAQSelector(faq);
   ```

2. **Cuando el usuario hace clic en una pregunta:**
   ```javascript
   // Obtener respuesta cacheada (muy rápido)
   const answer = await fetch(`/api/faq/${questionId}`).then(r => r.json());
   
   // Mostrar respuesta al usuario
   displayMessage(answer.answer);
   ```

---

## Preguntas FEATURED (Siempre Visibles)

| ID  | Pregunta | Categoría |
|-----|----------|-----------|
| q1  | ¿Cuándo se abren las inscripciones para los programas de pregrado? | Inscripciones |
| q2  | ¿Dónde puedo realizar el proceso de inscripción a la Universidad de Córdoba? | Inscripciones |
| q3  | ¿Cuál es el valor del PIN o derecho de inscripción? | Inscripciones |

---

## Preguntas FAQ Selector (5 seleccionables)

| ID  | Pregunta | Categoría |
|-----|----------|-----------|
| q4  | ¿Qué documentos necesito para realizar la inscripción? | Inscripciones |
| q5  | ¿Cómo sé si mi inscripción quedó correctamente registrada? | Inscripciones |
| q9  | ¿Cuál es el puntaje mínimo del examen Saber 11 para ingresar? | Requisitos de Admisión |
| q14 | ¿Dónde puedo consultar los resultados de admisión? | Resultados y Matrícula |
| q16 | ¿Cuáles son los pasos para realizar la matrícula académica y financiera? | Resultados y Matrícula |

---

## Ventajas del Enfoque Cacheado

✅ **Respuestas Instantáneas** - Sin procesamiento del chatbot  
✅ **Menor Carga de Servidor** - No usa Ollama/GPT  
✅ **UX Mejorada** - Información officialés verificada  
✅ **Escalable** - Añade nuevas preguntas sin código  
✅ **Consistente** - Respuestas siempre iguales  
✅ **Offline-friendly** - Se puede cachear en frontend  

---

## Arquitectura

### Ubicación de Datos

- **Código:** [src/config/admission-faq.ts](src/config/admission-faq.ts)
- **Prompts:** [src/config/prompts.ts](src/config/prompts.ts) - importa las featured
- **Endpoints:** [src/api/server.ts](src/api/server.ts) - `GET /api/faq/*`

### Flujo de Datos

```
Frontend
   ↓
GET /api/faq/questions (lista)
   ↓
GET /api/faq/{id} (respuesta indexada)
   ↓
admission-faq.ts (búsqueda O(1) por ID)
   ↓
Respuesta cacheada inmediata
```

---

## Mejoras Futuras

- 📱 **Móvil-first UI** - Botones grandes, responsive
- 🔍 **Búsqueda Fuzzy** - Búsqueda en texto de preguntas
- 📊 **Analytics** - Qué preguntas se consultan más
- 🤖 **Fallback a GPT** - Si pregunta no está en FAQ, usar GPT
- 🌍 **Multiidioma** - Soporte para English
- ♿ **A11y** - Accesibilidad mejorada (ARIA labels, etc.)

---

## Testing

### Verificar que FAQ funciona:

```bash
# Listar preguntas
curl http://localhost:3000/api/faq/questions | jq '.featured, .faq'

# Obtener respuesta específica
curl http://localhost:3000/api/faq/q1 | jq '.answer'
```

### Benchmark (timing):

```bash
# Debe ser < 50ms
time curl http://localhost:3000/api/faq/q1
```

---

## Control de Versión

- **Archivo Base:** `src/config/admission-faq.ts` (NO EDITABLEDIRECTAMENTE)
- **Proceso de Actualización:**
  1. Editar respuestas en `admission-faq.ts`
  2. Compilar: `npm run build`
  3. Reiniciar: `npm run api`
  4. Validar con curl o frontend

---

## Contacto & Soporte

Para agregar nuevas preguntas del FAQ o modificar respuestas, contacta al equipo de admin.

**Última actualización:** Abril 14, 2026  
**Versión:** 1.0 (Sistema cacheado)
