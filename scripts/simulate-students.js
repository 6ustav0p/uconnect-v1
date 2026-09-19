const BASE_URL = "https://socrates.unicordoba.edu.co/api-uconnect";
const STUDENTS = 50;
const CHAT_DELAY_MS = 2200; // stay under the 30 req/min rate limit on /api/chat

const FAQ_QUESTIONS = [
  "¿Cuándo se abren las inscripciones para los programas de pregrado?",
  "¿Dónde puedo realizar el proceso de inscripción a la Universidad de Córdoba?",
  "¿Cuál es el valor del PIN o derecho de inscripción?",
  "¿Qué documentos necesito para realizar la inscripción?",
  "¿Cómo sé si mi inscripción quedó correctamente registrada?",
  "¿Cuál es el puntaje mínimo del examen Saber 11 para ingresar?",
  "¿Dónde puedo consultar los resultados de admisión?",
  "¿Cuáles son los pasos para realizar la matrícula académica y financiera?",
];

const GENERIC_QUESTIONS = [
  "¿Qué carreras de ingeniería ofrecen?",
  "¿Hay descuentos por estrato bajo?",
  "¿Puedo cambiarme de programa después de inscribirme?",
  "¿El examen de admisión tiene costo aparte?",
  "¿Cuántos semestres dura enfermería?",
  "¿Tienen residencias universitarias?",
  "¿Hay becas para deportistas?",
  "¿Cómo contacto a bienestar universitario?",
  "¿Puedo validar materias de otra universidad?",
  "¿Ofrecen programas nocturnos?",
];

const CATEGORIES = ["accuracy", "clarity", "speed", "completeness", "tone", "other"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore non-JSON */
  }
  return { status: res.status, data };
}

async function simulateStudent(i) {
  const summary = { student: i, session: null, chat1: null, chat2: null, feedback: null };

  const sessionRes = await postJson("/chat/session", {});
  summary.session = sessionRes.status;
  if (sessionRes.status !== 201 || !sessionRes.data?.sessionId) {
    return summary;
  }
  const sessionId = sessionRes.data.sessionId;

  const faqQuestion = FAQ_QUESTIONS[i % FAQ_QUESTIONS.length];
  await sleep(CHAT_DELAY_MS);
  const chat1Res = await postJson("/chat", { sessionId, message: faqQuestion });
  summary.chat1 = { status: chat1Res.status, engine: chat1Res.data?.response?.engine };

  const genericQuestion = GENERIC_QUESTIONS[i % GENERIC_QUESTIONS.length];
  await sleep(CHAT_DELAY_MS);
  const chat2Res = await postJson("/chat", { sessionId, message: genericQuestion });
  summary.chat2 = { status: chat2Res.status, engine: chat2Res.data?.response?.engine };

  const score = 1 + (i % 5); // cycles 1..5 so we get a spread of ratings
  const helpful = score >= 3;
  const category = CATEGORIES[i % CATEGORIES.length];
  const feedbackRes = await postJson(`/chat/${sessionId}/feedback`, {
    score,
    helpful,
    resolved: helpful,
    category,
    comment: i % 4 === 0 ? "Respuesta clara, gracias." : undefined,
  });
  summary.feedback = feedbackRes.status;

  return summary;
}

async function main() {
  console.log(`Simulando ${STUDENTS} estudiantes contra ${BASE_URL} ...`);
  const results = [];
  for (let i = 0; i < STUDENTS; i++) {
    const r = await simulateStudent(i);
    results.push(r);
    console.log(
      `#${i + 1}/${STUDENTS} session=${r.session} chat1=${JSON.stringify(r.chat1)} chat2=${JSON.stringify(r.chat2)} feedback=${r.feedback}`,
    );
  }

  const ok = (v) => v === 200 || v === 201;
  const sessions = results.filter((r) => ok(r.session)).length;
  const chat1Ok = results.filter((r) => ok(r.chat1?.status)).length;
  const chat2Ok = results.filter((r) => ok(r.chat2?.status)).length;
  const feedbackOk = results.filter((r) => ok(r.feedback)).length;

  console.log("\n=== RESUMEN ===");
  console.log(`Sesiones creadas: ${sessions}/${STUDENTS}`);
  console.log(`Chat FAQ ok: ${chat1Ok}/${STUDENTS}`);
  console.log(`Chat genérico ok: ${chat2Ok}/${STUDENTS}`);
  console.log(`Feedback ok: ${feedbackOk}/${STUDENTS}`);

  const failures = results.filter(
    (r) => !ok(r.session) || !ok(r.chat1?.status) || !ok(r.chat2?.status) || !ok(r.feedback),
  );
  if (failures.length > 0) {
    console.log("\n=== FALLOS ===");
    console.log(JSON.stringify(failures, null, 2));
  }
}

main().catch((e) => {
  console.error("ERROR FATAL", e);
  process.exit(1);
});
