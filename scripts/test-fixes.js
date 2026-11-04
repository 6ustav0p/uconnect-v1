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

async function newSession() {
  const r = await postJson("/chat/session", {});
  return r.data.sessionId;
}

async function main() {
  console.log("=== TEST 1: Sticky Context Bug (pensum -> tema nuevo) ===");
  const s1 = await newSession();
  const r1a = await postJson("/gpt/chat", {
    sessionId: s1,
    message: "¿Qué materias hay en el segundo semestre de ingeniería de sistemas?",
  });
  console.log("Q1 (pensum):", r1a.data?.response?.slice(0, 150));
  await sleep(2200);
  const r1b = await postJson("/gpt/chat", {
    sessionId: s1,
    message: "¿Hay algún beneficio del Acuerdo 062 para comunidades afro o palenqueras?",
  });
  console.log("\nQ2 (tema nuevo, Acuerdo 062):\n", r1b.data?.response);
  const stillStuckOnPensum = /semestre|créditos|asignatura/i.test(r1b.data?.response || "") &&
    !/palenquer|afrodescend|acuerdo 062|cupo/i.test(r1b.data?.response || "");
  console.log(stillStuckOnPensum ? "\n❌ SIGUE ATRAPADO EN PENSUM" : "\n✅ RESPONDIÓ SOBRE EL TEMA NUEVO");

  await sleep(2200);

  console.log("\n\n=== TEST 2: Follow-up corto legítimo mantiene contexto ===");
  const s2 = await newSession();
  const r2a = await postJson("/gpt/chat", {
    sessionId: s2,
    message: "¿Qué beneficios de admisión especial hay para víctimas del conflicto armado?",
  });
  console.log("Q1:", r2a.data?.response?.slice(0, 150));
  await sleep(2200);
  const r2b = await postJson("/gpt/chat", {
    sessionId: s2,
    message: "¿Y para los indígenas?",
  });
  console.log("\nQ2 (follow-up corto):\n", r2b.data?.response);

  await sleep(2200);

  console.log("\n\n=== TEST 3: Reintento de preguntas que fallaron antes (maxResults=8) ===");
  const retries = [
    "¿Puede un bachiller que ya fue admitido anteriormente en la Universidad de Córdoba postularse a un cupo especial de este acuerdo?",
    "¿Ya está vigente y se puede aplicar hoy el beneficio para veteranos y núcleo familiar de la Ley 1979 de 2019 según este acuerdo, o depende de algo más?",
  ];
  for (const q of retries) {
    const s = await newSession();
    const r = await postJson("/gpt/chat", { sessionId: s, message: q });
    console.log(`\nPREGUNTA: ${q}\nRESPUESTA: ${r.data?.response}\n---`);
    await sleep(2200);
  }
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
