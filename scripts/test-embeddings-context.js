const BASE_URL = "http://localhost:3000/api";

async function postJson(path, body) {
  const start = Date.now();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  const elapsedMs = Date.now() - start;
  return { status: res.status, data, elapsedMs };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function newSession() {
  const r = await postJson("/chat/session", {});
  return r.data.sessionId;
}

async function main() {
  const timings = [];

  console.log("=== TEST A: Sticky Context (pensum -> tema nuevo) ===");
  const sA = await newSession();
  const a1 = await postJson("/gpt/chat", {
    sessionId: sA,
    message: "¿Qué materias hay en el segundo semestre de ingeniería de sistemas?",
  });
  timings.push({ label: "A1 (sin historial)", ms: a1.elapsedMs });
  console.log(`Q1 [${a1.elapsedMs}ms]:`, a1.data?.response?.slice(0, 100));
  await sleep(2200);

  const a2 = await postJson("/gpt/chat", {
    sessionId: sA,
    message: "¿Hay algún beneficio del Acuerdo 062 para comunidades afro o palenqueras?",
  });
  timings.push({ label: "A2 (con embeddings check)", ms: a2.elapsedMs });
  console.log(`\nQ2 [${a2.elapsedMs}ms]:\n`, a2.data?.response);
  const stuck = /semestre|créditos/i.test(a2.data?.response || "") && !/palenquer|afro|062|cupo/i.test(a2.data?.response || "");
  console.log(stuck ? "❌ SIGUE ATRAPADO" : "✅ RESPONDIÓ TEMA NUEVO");
  await sleep(2200);

  console.log("\n\n=== TEST B: Caso real del informe (correo institucional tras pregunta de admisión) ===");
  const sB = await newSession();
  const b1 = await postJson("/gpt/chat", {
    sessionId: sB,
    message: "¿Qué beneficios de admisión especial hay para víctimas del conflicto armado?",
  });
  timings.push({ label: "B1 (sin historial)", ms: b1.elapsedMs });
  console.log(`Q1 [${b1.elapsedMs}ms]:`, b1.data?.response?.slice(0, 100));
  await sleep(2200);

  const b2 = await postJson("/gpt/chat", {
    sessionId: sB,
    message: "¿Cómo recupero mi correo institucional?",
  });
  timings.push({ label: "B2 (con embeddings check)", ms: b2.elapsedMs });
  console.log(`\nQ2 [${b2.elapsedMs}ms]:\n`, b2.data?.response);
  const assumedCareer = /ingenier[íi]a|programa de (?!admisión)/i.test(b2.data?.response || "");
  console.log(assumedCareer ? "❌ ASUMIÓ UNA CARRERA SIN QUE SE MENCIONARA" : "✅ NO ASUMIÓ CARRERA/TEMA VIEJO");
  await sleep(2200);

  console.log("\n\n=== TEST C: Follow-up corto legítimo (víctimas -> indígenas) ===");
  const sC = await newSession();
  const c1 = await postJson("/gpt/chat", {
    sessionId: sC,
    message: "¿Qué beneficios de admisión especial hay para víctimas del conflicto armado?",
  });
  timings.push({ label: "C1 (sin historial)", ms: c1.elapsedMs });
  await sleep(2200);
  const c2 = await postJson("/gpt/chat", { sessionId: sC, message: "¿Y para los indígenas?" });
  timings.push({ label: "C2 (con embeddings check)", ms: c2.elapsedMs });
  console.log(`Q2 [${c2.elapsedMs}ms]:\n`, c2.data?.response);
  const gotIndigenas = /indígena/i.test(c2.data?.response || "");
  console.log(gotIndigenas ? "✅ RESPONDIÓ SOBRE INDÍGENAS" : "❌ NO CAMBIÓ DE TEMA");

  console.log("\n\n=== RESUMEN DE TIEMPOS ===");
  timings.forEach((t) => console.log(`${t.label}: ${t.ms}ms`));
  const withHistory = timings.filter((t) => t.label.includes("con embeddings"));
  const withoutHistory = timings.filter((t) => t.label.includes("sin historial"));
  const avg = (arr) => arr.reduce((s, t) => s + t.ms, 0) / arr.length;
  console.log(`\nPromedio SIN historial (sin embeddings, va directo): ${avg(withoutHistory).toFixed(0)}ms`);
  console.log(`Promedio CON historial (pasa por el chequeo de embeddings): ${avg(withHistory).toFixed(0)}ms`);
  console.log(`Diferencia estimada atribuible al chequeo de embeddings: ${(avg(withHistory) - avg(withoutHistory)).toFixed(0)}ms`);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
