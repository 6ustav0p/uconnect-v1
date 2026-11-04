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
        "Para la convocatoria vigente de pregrado 2027-I, las inscripciones están abiertas del 15 de octubre al 27 de noviembre de 2026. Consulta el calendario oficial de la Universidad de Córdoba: https://www.unicordoba.edu.co/admisiones-y-registro/",
    },
    {
      id: "q2",
      category: "Inscripciones",
      question:
        "¿Dónde puedo realizar el proceso de inscripción a la Universidad de Córdoba?",
      answer:
        "La inscripción se realiza de forma virtual desde el portal oficial de Admisiones y Registro: https://www.unicordoba.edu.co/admisiones-y-registro/. Usa únicamente los canales institucionales y no entregues tus datos a intermediarios.",
    },
    {
      id: "q3",
      category: "Inscripciones",
      question: "¿Cuál es el valor del PIN o derecho de inscripción?",
      answer:
        "Para la convocatoria de pregrado 2027-I, el PIN o derecho de inscripción tiene un valor de $175.100. Verifica siempre el valor publicado por la Universidad en la convocatoria vigente antes de realizar el pago.",
    },
  ],

  faq: [
    {
      id: "q4",
      category: "Inscripciones",
      question: "¿Qué documentos necesito para realizar la inscripción?",
      answer:
        "Debes cargar los documentos solicitados en la convocatoria vigente. Si te inscribes por una circunscripción o cupo especial, revisa los soportes adicionales exigidos para esa modalidad.",
    },
    {
      id: "q5",
      category: "Inscripciones",
      question: "¿Cómo sé si mi inscripción quedó correctamente registrada?",
      answer:
        "Al completar el formulario, revisa la confirmación enviada al correo registrado y conserva el token o comprobante generado por el sistema. Estos datos permiten consultar o modificar la información cuando el sistema lo habilite.",
    },
    {
      id: "q9",
      category: "Requisitos de Admisión",
      question: "¿Cuál es el puntaje mínimo del examen Saber 11 para ingresar?",
      answer:
        "La selección se realiza con la metodología de ponderación definida para cada programa. Consulta los criterios, las áreas y los puntajes de referencia publicados para la convocatoria vigente; un puntaje histórico no garantiza la admisión.",
    },
    {
      id: "q14",
      category: "Resultados y Matrícula",
      question: "¿Dónde puedo consultar los resultados de admisión?",
      answer:
        "Los resultados se publican en el portal oficial de Admisiones y Registro. Para la convocatoria vigente de pregrado 2027-I, el listado de admitidos está programado para el 22 de diciembre de 2026. Consulta allí la lista y sigue las instrucciones oficiales: https://www.unicordoba.edu.co/admisiones-y-registro/",
    },
    {
      id: "q26",
      category: "Puntajes y Ponderación",
      question:
        "¿Dónde encuentro los puntajes de referencia y el simulador de ponderado de la Universidad de Córdoba?",
      answer:
        "Puedes consultar y descargar las herramientas oficiales para calcular el puntaje ponderado y revisar los puntajes históricos:\n- Simulador de promedio ponderado / Puntajes históricos (Archivo 1): https://drive.google.com/uc?export=download&id=1gGAAJJyBuJ8qjbkOOppEh0wBlOfRyyue\n- Simulador de promedio ponderado / Puntajes históricos (Archivo 2): https://drive.google.com/uc?export=download&id=19qet5I99Jb4Ljs3XuujKvJByFiV5Lbqk\nDescarga los archivos y ábrelos con Excel para utilizar todas sus funcionalidades. Los puntajes históricos son orientativos y no garantizan la admisión en una convocatoria futura.",
    },
  ],

  archive: [
    {
      id: "q6",
      category: "Inscripciones",
      question: "¿Puedo inscribirme a más de un programa académico?",
      answer:
        "La inscripción está sujeta a las condiciones de la convocatoria vigente. Verifica allí cuántos programas puedes seleccionar y las restricciones aplicables.",
    },
    {
      id: "q7",
      category: "Inscripciones",
      question:
        "¿Qué debo hacer si cometí un error al diligenciar el formulario de inscripción?",
      answer:
        "Si la convocatoria permite modificar los datos, utiliza la opción habilitada en el sistema con el token de inscripción. Si no tienes el token o no puedes realizar el cambio, contacta a Admisiones y Registro mediante los canales publicados en el portal oficial.",
    },
    {
      id: "q8",
      category: "Inscripciones",
      question:
        "¿Qué sucede si no puedo finalizar mi inscripción dentro de las fechas establecidas?",
      answer:
        "Una inscripción incompleta o realizada después del cierre de la convocatoria no participa en el proceso de admisión, salvo que la Universidad publique una instrucción diferente.",
    },
    {
      id: "q10",
      category: "Requisitos de Admisión",
      question:
        "¿Se tienen en cuenta otras pruebas o criterios además del Saber 11?",
      answer:
        "Algunos programas o modalidades pueden tener requisitos o pruebas adicionales. Revisa la convocatoria vigente y la información específica del programa al que deseas ingresar.",
    },
    {
      id: "q12",
      category: "Requisitos de Admisión",
      question:
        "¿Existen cupos especiales para comunidades indígenas, afrodescendientes o víctimas del conflicto?",
      answer:
        "Pueden existir cupos o modalidades especiales regulados por la normativa institucional, como el Acuerdo 062 de 2020. Verifica en cada convocatoria los grupos habilitados, los requisitos y los documentos exigidos.",
    },
    {
      id: "q15",
      category: "Resultados y Matrícula",
      question: "¿Qué debo hacer si fui admitido en la universidad?",
      answer:
        "Revisa el correo registrado y la circular o instrucciones oficiales del proceso de admisión. Allí se indican los documentos, pasos y plazos para legalizar la matrícula.",
    },
    {
      id: "q16",
      category: "Resultados y Matrícula",
      question:
        "¿Cuáles son los pasos para realizar la matrícula académica y financiera?",
      answer:
        "Sigue las instrucciones de matrícula publicadas para tu convocatoria en las plataformas institucionales. El procedimiento puede variar según se trate de un estudiante nuevo o antiguo; consulta allí la liquidación, los medios de pago y la forma de registrar las asignaturas.",
    },
    {
      id: "q17",
      category: "Resultados y Matrícula",
      question:
        "¿Qué ocurre si no realizo la matrícula dentro de las fechas establecidas?",
      answer:
        "El incumplimiento de los plazos puede ocasionar la pérdida del cupo o impedir la formalización de la matrícula. Verifica las consecuencias y las alternativas en la convocatoria o comunicación oficial.",
    },
    {
      id: "q18",
      category: "Resultados y Matrícula",
      question: "¿Puedo aplazar mi ingreso si fui admitido?",
      answer:
        "La posibilidad de aplazar el ingreso depende de la normativa y de las condiciones de la convocatoria vigente. Solicita orientación a Admisiones y Registro antes de que termine el plazo de matrícula.",
    },
    {
      id: "q19",
      category: "Costos y Financiación",
      question: "¿Cuánto cuesta estudiar en la Universidad de Córdoba?",
      answer:
        "El valor de la matrícula y de otros derechos depende de la liquidación individual y de las condiciones vigentes. Consulta el valor que genere la plataforma institucional; no tomes como referencia valores de periodos anteriores.",
    },
    {
      id: "q21",
      category: "Costos y Financiación",
      question:
        "¿Existen becas o programas de apoyo económico para estudiantes?",
      answer:
        "La Universidad puede aplicar programas de gratuidad o apoyos económicos sujetos a requisitos. Consulta la convocatoria y las condiciones vigentes para saber si cumples los criterios. Estos beneficios no necesariamente cubren todos los derechos pecuniarios.",
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
