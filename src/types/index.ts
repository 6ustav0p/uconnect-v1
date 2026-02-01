// ============================================
// TIPOS PARA DATOS ACADÉMICOS
// ============================================

export interface Facultad {
  unid_id: string;
  unid_nombre: string;
}

export interface ProgramaAcademico {
  prog_id: string;
  prog_nombre: string;
  facultad_id: string;
  facultad_nombre: string;
}

export interface MateriaPensum {
  programa: string;
  unid_nombre: string;
  jornada: string;
  pensum: string;
  numero_de_creditos_pensum: string;
  semestre: string;
  materia: string;
  codigo_materia: string;
  creditos: string;
  total_creditos_semestre: string;
}

// ============================================
// TIPOS PARA PARÁMETROS DE BÚSQUEDA API
// ============================================

export interface FacultadParams {
  codigo?: string;
  nombre?: string;
}

export interface ProgramaParams {
  facultad_id?: string;
  programa_id?: string;
  facultad_nombre?: string;
  programa_nombre?: string;
}

export interface PensumParams {
  materia_codigo?: string;
  materia_nombre?: string;
  programa_nombre?: string;
  semestre?: string;
  pensun?: string;
  lugar_desarrollo?: string;
}

// ============================================
// TIPOS PARA EL CHATBOT
// ============================================

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

export interface ChatSession {
  sessionId: string;
  userId?: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface ExtractedEntities {
  facultades: string[];
  programas: string[];
  materias: string[];
  semestres: string[];
  jornadas: string[];
  intenciones: IntentType[];
  rawQuery: string;
}

export type IntentType =
  | "INFO_FACULTAD"
  | "INFO_PROGRAMA"
  | "INFO_MATERIA"
  | "INFO_PENSUM"
  | "LISTAR_FACULTADES"
  | "LISTAR_PROGRAMAS"
  | "LISTAR_MATERIAS"
  | "LISTAR"
  | "CREDITOS"
  | "JORNADA"
  | "GENERAL"
  | "SALUDO"
  | "DESPEDIDA";

export interface QueryPlan {
  apis: ApiCall[];
  strategy: "sequential" | "parallel";
  maxResults: number;
}

export interface ApiCall {
  endpoint: "facultades" | "programas" | "pensum";
  params: FacultadParams | ProgramaParams | PensumParams;
  priority: number;
}

// ============================================
// TIPOS PARA RESPUESTAS DEL CHATBOT
// ============================================

export interface ChatbotResponse {
  message: string;
  data?: {
    facultades?: Facultad[];
    programas?: ProgramaAcademico[];
    materias?: MateriaPensum[];
  };
  sources: string[];
  tokensUsed?: {
    input: number;
    output: number;
  };
}

export interface AcademicContext {
  facultades: Facultad[];
  programas: ProgramaAcademico[];
  materias: MateriaPensum[];
  summary: string;
  pep?: PepProfile | null;
}

// ============================================
// TIPOS PARA PEP (Perfil de Programa)
// ============================================

export interface PepProfile {
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

// ============================================
// TIPOS PARA CACHÉ
// ============================================

export interface CacheEntry<T> {
  key: string;
  data: T;
  createdAt: Date;
  expiresAt: Date;
  hitCount: number;
}

export interface CacheConfig {
  ttlSeconds: number;
  maxEntries: number;
}
