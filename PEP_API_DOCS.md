# API Admin PEP - Documentación para Frontend

## Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/admin/pep` | Crear/actualizar PEP |
| `GET` | `/api/admin/pep/:programaId` | Obtener PEP por ID |
| `GET` | `/api/admin/peps` | Listar todos los PEPs |
| `DELETE` | `/api/admin/pep/:programaId` | Eliminar PEP |

---

## POST `/api/admin/pep`

Crea o actualiza un PEP. El backend parsea el texto plano y lo convierte a JSON estructurado.

**Request:**
```json
{
  "programaId": "123",
  "programaNombre": "INGENIERIA DE SISTEMAS",
  "contenido": "# Resumen\nEl programa forma profesionales en TI...\n\n# Perfil Profesional\n- Análisis de sistemas\n- Desarrollo de software\n\n# Misión\nFormar ingenieros íntegros..."
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `programaId` | string | Sí | ID del programa (de `/api/programas`) |
| `programaNombre` | string | Sí | Nombre del programa |
| `contenido` | string | Sí | Texto plano del PEP con secciones |

**Response (201):**
```json
{
  "message": "PEP guardado correctamente",
  "data": {
    "programaId": "123",
    "programaNombre": "INGENIERIA DE SISTEMAS",
    "resumen": "El programa forma profesionales en TI...",
    "perfilProfesional": "Análisis de sistemas. Desarrollo de software.",
    "mision": "Formar ingenieros íntegros...",
    "historia": "",
    "perfilOcupacional": "",
    "vision": "",
    "objetivos": [],
    "competencias": [],
    "camposOcupacionales": [],
    "lineasInvestigacion": [],
    "requisitosIngreso": "",
    "requisitosGrado": "",
    "fuente": "Carga manual",
    "actualizadoEn": "2026-02-01T18:00:00.000Z"
  }
}
```

**Errores:**
- `400` - Campo requerido faltante o programa no existe
- `500` - Error interno

---

## GET `/api/admin/pep/:programaId`

Obtiene un PEP por ID de programa.

**Response (200):**
```json
{
  "data": {
    "programaId": "123",
    "programaNombre": "INGENIERIA DE SISTEMAS",
    "resumen": "...",
    "historia": "...",
    "perfilProfesional": "...",
    "perfilOcupacional": "...",
    "mision": "...",
    "vision": "...",
    "objetivos": ["...", "..."],
    "competencias": ["...", "..."],
    "camposOcupacionales": ["...", "..."],
    "lineasInvestigacion": ["...", "..."],
    "requisitosIngreso": "...",
    "requisitosGrado": "...",
    "fuente": "Carga manual",
    "actualizadoEn": "2026-02-01T18:00:00.000Z"
  }
}
```

**Errores:**
- `404` - PEP no encontrado
- `500` - Error interno

---

## GET `/api/admin/peps`

Lista todos los PEPs guardados.

**Response (200):**
```json
{
  "data": [
    { "programaId": "123", "programaNombre": "INGENIERIA DE SISTEMAS", "resumen": "...", ... },
    { "programaId": "456", "programaNombre": "MEDICINA", "resumen": "...", ... }
  ],
  "total": 2
}
```

---

## DELETE `/api/admin/pep/:programaId`

Elimina un PEP.

**Response (200):**
```json
{
  "message": "PEP eliminado correctamente"
}
```

**Errores:**
- `404` - PEP no encontrado
- `500` - Error interno

---

## Formato del Texto (contenido)

El parser detecta secciones automáticamente usando headings. Formatos soportados:

- Markdown: `# Sección` o `## Sección`
- Texto simple: `Sección:` (línea que termina en `:`)

### Secciones Reconocidas

| Sección | Aliases |
|---------|---------|
| Resumen | resumen, sinopsis, descripcion |
| Historia | historia, historico, antecedentes, origen |
| Perfil Profesional | perfil profesional, perfil del egresado |
| Perfil Ocupacional | perfil ocupacional, campo laboral, oportunidades laborales |
| Misión | mision, misión |
| Visión | vision, visión |
| Objetivos | objetivos, objetivos generales, metas |
| Competencias | competencias, habilidades |
| Campos Ocupacionales | campos ocupacionales, sectores de trabajo |
| Líneas de Investigación | lineas de investigacion, grupos de investigacion |
| Requisitos de Ingreso | requisitos de ingreso, prerrequisitos |
| Requisitos de Grado | requisitos de grado, criterios de egreso |

### Ejemplo de Texto

```
# Resumen
El programa de Ingeniería de Sistemas forma profesionales integrales 
capaces de diseñar, desarrollar e implementar soluciones tecnológicas.

# Historia
El programa fue creado en 1985 como respuesta a la demanda regional 
de profesionales en tecnología.

# Perfil Profesional
- Capacidad de análisis y diseño de sistemas
- Desarrollo de software de calidad
- Gestión de proyectos tecnológicos
- Liderazgo en equipos de desarrollo

# Perfil Ocupacional
- Desarrollador de software
- Arquitecto de sistemas
- Gerente de proyectos TI
- Consultor tecnológico

# Misión
Formar ingenieros de sistemas con sólida formación científica y 
tecnológica, comprometidos con el desarrollo regional.

# Visión
Ser reconocidos como el mejor programa de Ingeniería de Sistemas 
de la región Caribe para el año 2030.

# Objetivos
- Formar profesionales éticos y competentes
- Fomentar la investigación y la innovación
- Contribuir al desarrollo tecnológico regional

# Competencias
- Pensamiento analítico y crítico
- Resolución de problemas complejos
- Comunicación efectiva
- Trabajo en equipo

# Campos Ocupacionales
- Sector público
- Sector privado
- Emprendimiento tecnológico
- Academia e investigación

# Líneas de Investigación
- Inteligencia Artificial
- Ingeniería de Software
- Redes y Telecomunicaciones
- Seguridad Informática

# Requisitos de Ingreso
Título de bachiller, pruebas Saber 11, y aprobar proceso de admisión.

# Requisitos de Grado
Completar todos los créditos, proyecto de grado o pasantía, y 
certificar nivel B1 de inglés.
```

---

## TypeScript Types

```typescript
interface PepProfile {
  programaId: string;
  programaNombre: string;
  resumen: string;
  historia?: string;
  perfilProfesional?: string;
  perfilOcupacional?: string;
  mision?: string;
  vision?: string;
  objetivos?: string[];
  competencias?: string[];
  camposOcupacionales?: string[];
  lineasInvestigacion?: string[];
  requisitosIngreso?: string;
  requisitosGrado?: string;
  fuente?: string;
  actualizadoEn?: Date;
}

interface CreatePepRequest {
  programaId: string;
  programaNombre: string;
  contenido: string; // Texto plano con secciones
}

interface ApiResponse<T> {
  data: T;
  message?: string;
  total?: number;
}

interface ApiError {
  error: true;
  code: string;
  message: string;
}
```

---

## Ejemplos de Implementación

### React Hook

```typescript
import { useState, useCallback } from 'react';

const API_BASE = 'http://localhost:3000';

export function usePepAdmin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savePep = useCallback(async (
    programaId: string, 
    programaNombre: string, 
    contenido: string
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/pep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programaId, programaNombre, contenido }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.message);
      return data.data;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const getPep = useCallback(async (programaId: string) => {
    const res = await fetch(`${API_BASE}/api/admin/pep/${programaId}`);
    const data = await res.json();
    if (data.error) return null;
    return data.data;
  }, []);

  const getAllPeps = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/admin/peps`);
    const data = await res.json();
    return data.data || [];
  }, []);

  const deletePep = useCallback(async (programaId: string) => {
    const res = await fetch(`${API_BASE}/api/admin/pep/${programaId}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (data.error) throw new Error(data.message);
    return true;
  }, []);

  return { savePep, getPep, getAllPeps, deletePep, loading, error };
}
```

### Componente de Formulario

```tsx
import { useState, useEffect } from 'react';
import { usePepAdmin } from './usePepAdmin';

interface Programa {
  prog_id: string;
  prog_nombre: string;
}

export function PepForm() {
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [selectedPrograma, setSelectedPrograma] = useState<Programa | null>(null);
  const [contenido, setContenido] = useState('');
  const { savePep, getPep, loading, error } = usePepAdmin();

  // Cargar programas
  useEffect(() => {
    fetch('http://localhost:3000/api/programas')
      .then(res => res.json())
      .then(data => setProgramas(data.data || []));
  }, []);

  // Cargar PEP existente al seleccionar programa
  useEffect(() => {
    if (selectedPrograma) {
      getPep(selectedPrograma.prog_id).then(pep => {
        if (pep) {
          // Reconstruir texto desde JSON (opcional)
          setContenido(`# Resumen\n${pep.resumen || ''}\n\n# Perfil Profesional\n${pep.perfilProfesional || ''}`);
        } else {
          setContenido('');
        }
      });
    }
  }, [selectedPrograma, getPep]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPrograma) return;

    try {
      await savePep(
        selectedPrograma.prog_id,
        selectedPrograma.prog_nombre,
        contenido
      );
      alert('PEP guardado correctamente');
    } catch (e) {
      alert('Error: ' + (e as Error).message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Programa:
        <select 
          value={selectedPrograma?.prog_id || ''} 
          onChange={e => {
            const p = programas.find(p => p.prog_id === e.target.value);
            setSelectedPrograma(p || null);
          }}
        >
          <option value="">Seleccionar programa...</option>
          {programas.map(p => (
            <option key={p.prog_id} value={p.prog_id}>
              {p.prog_nombre}
            </option>
          ))}
        </select>
      </label>

      <label>
        Contenido PEP (texto plano):
        <textarea
          value={contenido}
          onChange={e => setContenido(e.target.value)}
          rows={20}
          placeholder="# Resumen&#10;Descripción del programa...&#10;&#10;# Perfil Profesional&#10;- Competencia 1&#10;- Competencia 2"
        />
      </label>

      <button type="submit" disabled={loading || !selectedPrograma}>
        {loading ? 'Guardando...' : 'Guardar PEP'}
      </button>

      {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
  );
}
```

---

## Notas

- El parser es determinista (no usa IA), así que no consume tokens.
- Las listas se detectan con bullets (`-`, `•`, `*`, números) o separadas por `;`.
- Si una sección no se encuentra, el campo queda vacío o como array vacío.
- El campo `resumen` se trunca a 1200 caracteres máximo.
- Los campos de texto se truncan a 300-500 caracteres según el tipo.
