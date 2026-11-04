const BASE_URL = "http://localhost:3000/api";
const DELAY_MS = 2200; // stay under the 30 req/min chatLimiter

const QUESTIONS = [
  {
    id: 1,
    q: "¿Cuál es el promedio semestral mínimo que debe mantener un estudiante beneficiario del programa de víctimas del conflicto armado para no perder el beneficio?",
    expect: "3.5",
  },
  {
    id: 2,
    q: "¿Qué porcentaje mínimo debe obtener un aspirante en la prueba de talento artístico para ganar el cupo especial de mejor bachiller artista?",
    expect: "80% (igual o superior)",
  },
  {
    id: 3,
    q: "¿Qué porcentaje de asistencia a entrenamientos debe cumplir un deportista becado para mantener la exoneración de matrícula?",
    expect: "85%",
  },
  {
    id: 4,
    q: "¿Cuántos cupos adicionales se otorgan a hijos de docentes de la universidad según el Acuerdo 062?",
    expect: "TRAMPA: no existe ese beneficio en el documento, no debe inventarlo",
  },
  {
    id: 5,
    q: "¿El Acuerdo 062 aplica para programas de posgrado o solo de pregrado?",
    expect: "Solo pregrado",
  },
  {
    id: 6,
    q: "Si un aspirante es víctima del conflicto armado pero proviene de un colegio privado y NO recibió subsidio, ¿puede acceder a la exoneración de matrícula de este programa?",
    expect: "No, el parágrafo exige haber gozado de subsidio (y estrato 1 o 2) si viene de colegio privado",
  },
  {
    id: 7,
    q: "¿Cuáles son los cinco grupos poblacionales beneficiados en el Capítulo III del Acuerdo 062?",
    expect: "Indígena, Afrodescendiente, Rrom, Raizal, Palenquero (uno de cada uno)",
  },
  {
    id: 8,
    q: "Sumando todos los cupos especiales adicionales que otorga el Acuerdo 062 por cada programa académico de pregrado (víctimas, desmovilizados, los 5 grupos étnicos, discapacidad, mejor bachiller Saber 11, mejor bachiller deportista, mejor bachiller artista y veteranos/núcleo familiar), ¿cuántos cupos adicionales totales se otorgan por programa?",
    expect: "12 cupos (1+1+5+1+1+1+1+1)",
  },
  {
    id: 9,
    q: "¿Qué acuerdos anteriores deroga expresamente el Acuerdo 062 de 2020?",
    expect: "Acuerdo 038 de 2000, Acuerdo 016 de 2008 y Acuerdo 104 de 2008",
  },
  {
    id: 10,
    q: "¿Quién preside el Comité de Evaluación Deportiva y quién preside el Comité de Evaluación Artística?",
    expect: "En ambos casos el Jefe de Bienestar Universitario (o su delegado en el deportivo)",
  },
  {
    id: 11,
    q: "Según el Acuerdo 062, ¿hasta qué edad se considera parte del núcleo familiar a los hijos de un miembro de la Fuerza Pública fallecido en servicio activo?",
    expect: "25 años",
  },
  {
    id: 12,
    q: "¿En qué capítulo se regula el ingreso de excombatientes de las FARC-EP?",
    expect: "Capítulo II - Desmovilizados",
  },
  {
    id: 13,
    q: "¿Es cierto que todos los programas de admisión especial del Acuerdo 062 exigen el mismo promedio mínimo para mantener el beneficio? ¿Cuál es ese promedio?",
    expect: "Sí, 3.5 en todos los capítulos",
  },
  {
    id: 14,
    q: "¿En qué fecha fue promulgado el Acuerdo 062 y quiénes lo firmaron?",
    expect: "24 de julio de 2020; José Maximiliano Gómez Torres (Presidente) y Cely Figueroa Banda (Secretaria)",
  },
  {
    id: 15,
    q: "¿El Acuerdo 062 contempla algún beneficio especial para aspirantes afectados por la pandemia de COVID-19?",
    expect: "TRAMPA: no se menciona nada de COVID-19 en el documento",
  },
  {
    id: 16,
    q: "¿Es cierto que el Acuerdo 062 otorga 3 cupos semestrales por programa para víctimas del conflicto armado?",
    expect: "FALSO, es 1 cupo semestral, debe corregir la premisa",
  },
  {
    id: 17,
    q: "¿Puede un bachiller que ya fue admitido anteriormente en la Universidad de Córdoba postularse a un cupo especial de este acuerdo?",
    expect: "No (Artículo 46)",
  },
  {
    id: 18,
    q: "¿Pueden acogerse a estos programas especiales los bachilleres con antecedentes penales?",
    expect: "No, salvo delitos culposos (Artículo 48)",
  },
  {
    id: 19,
    q: "¿Ya está vigente y se puede aplicar hoy el beneficio para veteranos y núcleo familiar de la Ley 1979 de 2019 según este acuerdo, o depende de algo más?",
    expect: "Depende de que se expida la reglamentación de la Ley 1979 de 2019 (parágrafo art. 42)",
  },
  {
    id: 20,
    q: "¿Cómo se decide quién obtiene el cupo cuando hay varios aspirantes elegibles dentro del mismo grupo étnico (por ejemplo varios indígenas)?",
    expect: "Se otorga a quien tenga el mayor puntaje en Saber 11 o pruebas del Estado",
  },
  {
    id: 21,
    q: "¿Qué porcentaje de la matrícula cubre el beneficio para las víctimas del conflicto armado, el 50% o el 100%?",
    expect: "Ninguno de los dos como '%': es exoneración total del pago de matrícula (100%, pero debe explicarlo como exoneración total, no como un descuento parcial)",
  },
  {
    id: 22,
    q: "¿Los veteranos de la fuerza pública deben pagar derechos de inscripción o están exonerados también de ese pago?",
    expect: "Deben pagar derechos de inscripción; solo la matrícula queda exonerada",
  },
  {
    id: 23,
    q: "¿Qué significa la sigla RUV mencionada en el acuerdo?",
    expect: "Registro Único de Víctimas",
  },
  {
    id: 24,
    q: "¿Cuál es el costo actual de la matrícula para el programa de Ingeniería de Sistemas según este acuerdo?",
    expect: "TRAMPA: el acuerdo no establece costos de matrícula por programa, no debe inventar una cifra",
  },
  {
    id: 25,
    q: "¿Qué dice exactamente el artículo 60 del Acuerdo 062?",
    expect: "TRAMPA: el acuerdo solo llega hasta el artículo 49, no existe artículo 60",
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ask(question) {
  const res = await fetch(`${BASE_URL}/gpt/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: question }),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, data };
}

async function main() {
  console.log(`Probando ${QUESTIONS.length} preguntas difíciles sobre Acuerdo 062 vs ${BASE_URL} ...\n`);
  const results = [];
  for (const item of QUESTIONS) {
    const r = await ask(item.q);
    const answer = r.data?.response ?? JSON.stringify(r.data);
    results.push({ ...item, status: r.status, answer });
    console.log(`\n### #${item.id} [status=${r.status}]`);
    console.log(`PREGUNTA: ${item.q}`);
    console.log(`ESPERADO: ${item.expect}`);
    console.log(`RESPUESTA: ${answer}`);
    await sleep(DELAY_MS);
  }

  console.log("\n\n=== JSON COMPLETO (para análisis posterior) ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error("ERROR FATAL", e);
  process.exit(1);
});
