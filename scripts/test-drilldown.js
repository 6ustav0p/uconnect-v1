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
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function newSession() {
  const r = await postJson("/chat/session", {});
  return r.data.sessionId;
}

async function runScenario(label, turns) {
  console.log(`\n\n=== ${label} ===`);
  const s = await newSession();
  const responses = [];
  for (const msg of turns) {
    const r = await postJson("/gpt/chat", { sessionId: s, message: msg });
    console.log(`\nYo: ${msg}\nBot: ${r.data?.response}`);
    responses.push(r.data?.response || "");
    await sleep(2200);
  }
  return responses;
}

async function main() {
  const r1 = await runScenario(
    "ESCENARIO 1: general -> víctimas -> requisitos -> caso puntual (colegio privado)",
    [
      "¿Qué beneficios de admisión especial hay en la Universidad de Córdoba?",
      "¿Y específicamente para las víctimas del conflicto armado?",
      "¿Cuáles son los requisitos exactos para ese grupo?",
      "¿Y si soy egresado de un colegio privado, aplica igual?",
    ],
  );
  console.log("\n--- Checks Escenario 1 ---");
  console.log(`Turno2 habla de víctimas: ${/v[íi]ctimas/i.test(r1[1])}`);
  console.log(`Turno3 menciona RUV o Ley 1448 (correcto para víctimas): ${/RUV|Registro Único de Víctimas|Ley 1448/i.test(r1[2])}`);
  console.log(`Turno3 NO menciona cabildo/discapacidad (contaminación de otro capítulo): ${/cabildo|discapacidad/i.test(r1[2]) ? "❌ SÍ contaminó" : "✅ limpio"}`);
  console.log(`Turno4 menciona colegio privado + subsidio (parágrafo correcto): ${/subsidio/i.test(r1[3])}`);

  const r2 = await runScenario(
    "ESCENARIO 2 (otro tema, drill-down): general -> deportistas -> requisito puntual (lesión)",
    [
      "¿Qué beneficios de admisión especial hay en la Universidad de Córdoba?",
      "¿Y para los mejores bachilleres deportistas?",
      "¿Qué pasa si el estudiante se lesiona y no puede seguir entrenando?",
    ],
  );
  console.log("\n--- Checks Escenario 2 ---");
  console.log(`Turno2 habla de deportistas: ${/deportist/i.test(r2[1])}`);
  console.log(`Turno3 menciona Comité de Evaluación Deportiva / lesión / incapacidad (Art. 30, correcto): ${/lesi[oó]n|incapacidad|Comité de Evaluaci[oó]n Deportiva/i.test(r2[2])}`);
  console.log(`Turno3 NO se desvía a artista/discapacidad: ${/artista|discapacidad/i.test(r2[2]) ? "❌ se desvió" : "✅ se mantuvo en deportistas"}`);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
