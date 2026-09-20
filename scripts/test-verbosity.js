const BASE_URL = "http://localhost:3000/api";

async function postJson(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const QUESTIONS = [
  "¿Cuál es el promedio semestral mínimo que debe mantener un estudiante víctima del conflicto armado?",
  "¿Qué porcentaje de asistencia a entrenamientos debe cumplir un deportista becado?",
  "¿Cuáles son los cinco grupos poblacionales beneficiados en el Capítulo III del Acuerdo 062?",
  "¿Qué acuerdos anteriores deroga el Acuerdo 062?",
];

async function main() {
  for (const q of QUESTIONS) {
    const r = await postJson("/gpt/chat", { message: q });
    const response = r.data?.response ?? JSON.stringify(r.data);
    console.log(`\nPREGUNTA: ${q}`);
    console.log(`RESPUESTA (${response.length} chars):\n${response}`);
    console.log("---");
    await sleep(2200);
  }
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
