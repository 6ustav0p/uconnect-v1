/**
 * FAQ de Admisión Cacheadas
 * - featured: 3 preguntas siempre visibles
 * - faq: 5 preguntas adicionales en selector
 * - archive: preguntas adicionales con respuestas para búsqueda
 */

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export const ADMISSION_FAQ: {
  featured: FAQItem[];
  faq: FAQItem[];
  archive: FAQItem[];
} = {
  featured: [
    {
      id: "q1",
      category: "Inscripciones",
      question:
        "¿Cuándo se abren las inscripciones para los programas de pregrado?",
      answer:
        "Las inscripciones para los programas de pregrado están sujetas al inicio de la respectiva convocatoria. Para el periodo académico 2026-1, el inicio del proceso de inscripción es del 27 de octubre de 2025 al 28 de diciembre de 2025, según el Acuerdo N°035 que aprueba el calendario académico de pregrado.",
    },
    {
      id: "q2",
      category: "Inscripciones",
      question:
        "¿Dónde puedo realizar el proceso de inscripción a la Universidad de Córdoba?",
      answer:
        "El proceso de inscripción lo realizas a través de la página web institucional en el apartado de admisiones e inscripciones: https://www.unicordoba.edu.co/index.php/admisiones-y-registro/inscripciones/. El proceso es 100% virtual y no requiere de intermediarios.",
    },
    {
      id: "q3",
      category: "Inscripciones",
      question: "¿Cuál es el valor del PIN o derecho de inscripción?",
      answer:
        "El valor del derecho de inscripción para el periodo 2026-1 es de $142.350.",
    },
  ],

  faq: [
    {
      id: "q4",
      category: "Inscripciones",
      question: "¿Qué documentos necesito para realizar la inscripción?",
      answer:
        "Durante el proceso de inscripción a los programas de pregrado, solo se requerirá cargar soportes documentales. Si te inscriberás bajo las circunscripciones definidas en el Acuerdo 062 de 2020 (grupos poblacionales especiales), verifica qué documentación adicional es necesaria.",
    },
    {
      id: "q5",
      category: "Inscripciones",
      question: "¿Cómo sé si mi inscripción quedó correctamente registrada?",
      answer:
        "Una vez llenes el formulario, recibirás un token a tu correo con el que podrás descargar el volante de pago de la inscripción y verás toda la información que suministraste.",
    },
    {
      id: "q9",
      category: "Requisitos de Admisión",
      question: "¿Cuál es el puntaje mínimo del examen Saber 11 para ingresar?",
      answer:
        "La Universidad de Córdoba no toma el puntaje general del ICFES, sino el promedio de cada asignatura evaluada, ya que cada carrera tiene su propio peso por área. Los puntajes de referencia que se publican corresponden a un cálculo basado en dichas ponderaciones y no al puntaje global.",
    },
    {
      id: "q14",
      category: "Resultados y Matrícula",
      question: "¿Dónde puedo consultar los resultados de admisión?",
      answer:
        "La lista de admitidos se publica en la página web oficial de la universidad, en el micrositio de admisiones (sección admitidos). Allí visualizarás la lista y podrás buscar tu número de documento para saber si fuiste admitido.",
    },
    {
      id: "q16",
      category: "Resultados y Matrícula",
      question:
        "¿Cuáles son los pasos para realizar la matrícula académica y financiera?",
      answer:
        "Los estudiantes de primer semestre pueden descargar el volante de liquidación en la plataforma académica academusoft (usando tipo y número de documento). La matrícula académica la realiza la oficina de admisiones y registro en primer semestre; en segundo semestre el estudiante la realiza de forma autónoma. Usuario y contraseña: https://hermesoft.unicordoba.edu.co/unicordoba/hermesoft/vortal/general/paswords/apl_gen.jsp",
    },
    {
      id: "q26",
      category: "Puntajes y Ponderación",
      question:
        "¿Dónde encuentro los puntajes de referencia y el simulador de ponderado de la Universidad de Córdoba?",
      answer:
        "Puedes consultar y descargar las herramientas oficiales para calcular tu puntaje ponderado y observar los históricos mediante los siguientes enlaces:\n- Simulador de promedio ponderado / Puntajes Históricos (Archivo 1): https://drive.google.com/uc?export=download&id=1gGAAJJyBuJ8qjbkOOppEh0wBlOfRyyue\n- Simulador de promedio ponderado / Puntajes Históricos (Archivo 2): https://drive.google.com/uc?export=download&id=19qet5I99Jb4Ljs3XuujKvJByFiV5Lbqk\nDescárgalos y ábrelos con Excel para usar su funcionalidad completa.",
    },
  ],

  archive: [
    {
      id: "q6",
      category: "Inscripciones",
      question: "¿Puedo inscribirme a más de un programa académico?",
      answer:
        "No, el aspirante solo podrá inscribirse y participar en un solo programa durante el periodo académico.",
    },
    {
      id: "q7",
      category: "Inscripciones",
      question:
        "¿Qué debo hacer si cometí un error al diligenciar el formulario de inscripción?",
      answer:
        "Si cometiste un error al momento de realizar la inscripción, puedes modificar esa información con el token en el ítem 'modificar datos de inscripción'. Si no recibiste el token, debes enviar una solicitud de token al correo de admisiones y registro: admisiones@unicordoba.edu.co",
    },
    {
      id: "q8",
      category: "Inscripciones",
      question:
        "¿Qué sucede si no puedo finalizar mi inscripción dentro de las fechas establecidas?",
      answer:
        "Si no finalizas el proceso de inscripción dentro de las fechas establecidas, no se tendrá en cuenta para el proceso de admisión.",
    },
    {
      id: "q10",
      category: "Requisitos de Admisión",
      question:
        "¿Se tienen en cuenta otras pruebas o criterios además del Saber 11?",
      answer:
        "El programa en Licenciatura en Educación Artística es el único que realiza una prueba de admisión que vale el 60% del promedio y las pruebas ICFES el 40% para escoger a los estudiantes.",
    },
    {
      id: "q11",
      category: "Requisitos de Admisión",
      question: "¿Qué debo hacer si presenté el ICFES hace varios años?",
      answer:
        "Puedes revisar el simulador de promedios y consultar los pesos por área en la página de la universidad en el ítem 'Puntajes de Referencias'. Ahí encontrarás el histórico de puntajes de referencia y los pesos asignados a cada programa.",
    },
    {
      id: "q12",
      category: "Requisitos de Admisión",
      question:
        "¿Existen cupos especiales para comunidades indígenas, afrodescendientes o víctimas del conflicto?",
      answer:
        "Sí, existe el Acuerdo 062 de 2020 que reglamenta un cupo especial para cada comunidad en los diferentes programas ofertados durante cada periodo académico.",
    },
    {
      id: "q15",
      category: "Resultados y Matrícula",
      question: "¿Qué debo hacer si fui admitido en la universidad?",
      answer:
        "Los aspirantes admitidos recibirán la CIRCULAR PROCESO DE ADMISIÓN PREGRADO en su correo, con el cronograma para realizar las diferentes actividades que deben desarrollar hasta legalizar la matrícula.",
    },
    {
      id: "q17",
      category: "Resultados y Matrícula",
      question:
        "¿Qué ocurre si no realizo la matrícula dentro de las fechas establecidas?",
      answer:
        "Si no realizas el pago de la matrícula dentro del tiempo requerido, pierdes el cupo y este se asigna al segundo llamado.",
    },
    {
      id: "q18",
      category: "Resultados y Matrícula",
      question: "¿Puedo aplazar mi ingreso si fui admitido?",
      answer:
        "Los estudiantes admitidos no pueden cancelar o aplazar semestre ya que no cuentan con promedio de permanencia y el sistema académico no les permitirá reingresar.",
    },
    {
      id: "q19",
      category: "Costos y Financiación",
      question: "¿Cuánto cuesta estudiar en la Universidad de Córdoba?",
      answer:
        "El valor de la matrícula no es igual para todos los estudiantes, ya que cada uno tiene diferente información como estrato, si es egresado de institución pública o privada, entre otros aspectos que afectan el cálculo.",
    },
    {
      id: "q21",
      category: "Costos y Financiación",
      question:
        "¿Existen becas o programas de apoyo económico para estudiantes?",
      answer:
        "La universidad cuenta con 'matrícula 0', una política pública de gratuidad que cubre hasta el 100% del valor de la matrícula neta para estudiantes que cumplen ciertos requisitos. Los estudiantes pagan solo los derechos pecuniarios.",
    },
    {
      id: "q24",
      category: "Programas Académicos",
      question: "¿Qué programas de pregrado ofrece la Universidad de Córdoba?",
      answer:
        "Los programas académicos ofertados los puedes encontrar en el micrositio de admisiones en el apartado de estudiantes de pregrado, específicamente en el ítem 'oferta académica'.",
    },
    {
      id: "q25",
      category: "Programas Académicos",
      question: "En qué sedes o lugares de desarrollo se ofertan los programas",
      answer:
        "Los lugares de desarrollo con los que cuenta la universidad son: Montería, Lorica, Sahagún, Berástegui y Montelíbano.",
    },
  ],
};

/**
 * Servicio para buscar respuestas en caché
 */
export function getFAQAnswer(questionId: string): string | null {
  for (const section of [
    ADMISSION_FAQ.featured,
    ADMISSION_FAQ.faq,
    ADMISSION_FAQ.archive,
  ]) {
    const item = section.find((q) => q.id === questionId);
    if (item) return item.answer;
  }
  return null;
}

/**
 * Get featured questions for the initial greeting
 */
export function getFeaturedQuestions(): string[] {
  return ADMISSION_FAQ.featured.map((q) => q.question);
}

/**
 * Get featured + FAQ questions combined for selector
 */
export function getAvailableQuestions() {
  return {
    featured: ADMISSION_FAQ.featured.map((q) => ({
      id: q.id,
      question: q.question,
    })),
    faq: ADMISSION_FAQ.faq.map((q) => ({
      id: q.id,
      question: q.question,
    })),
  };
}
