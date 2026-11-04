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
  console.log("=== Reproduciendo la conversación exacta de la captura ===\n");
  const s = await newSession();

  const q1 = "hay algun beneficio para comunidades afro o palenqueras?";
  const r1 = await postJson("/gpt/chat", { sessionId: s, message: q1 });
  console.log(`Yo: ${q1}\nBot: ${r1.data?.response}\n`);
  const mixedDiscapacidad = /discapacidad|movilidad reducida/i.test(r1.data?.response || "");
  console.log(mixedDiscapacidad ? "❌ SIGUE MEZCLANDO DISCAPACIDAD (no preguntado)" : "✅ NO mezcló discapacidad");
  console.log("---\n");
  await sleep(2200);

  const q2 = "si porfavor, que requisitos piden";
  const r2 = await postJson("/gpt/chat", { sessionId: s, message: q2 });
  console.log(`Yo: ${q2}\nBot: ${r2.data?.response}\n`);
  const wrongChapterReqs = /diagnóstico|concepto médico|discapacidad/i.test(r2.data?.response || "");
  const rightChapterReqs = /cabildo|autoridad(es)? (tradicional|indígena)/i.test(r2.data?.response || "");
  console.log(wrongChapterReqs ? "❌ Dio requisitos del capítulo de discapacidad (equivocado)" : "✅ No dio requisitos de discapacidad");
  console.log(rightChapterReqs ? "✅ Mencionó el aval del cabildo/autoridad (correcto para étnicos)" : "⚠️  No mencionó el aval del cabildo explícitamente");
  console.log("---\n");
  await sleep(2200);

  const q3 = "me refiero a los beneficios de afro";
  const r3 = await postJson("/gpt/chat", { sessionId: s, message: q3 });
  console.log(`Yo: ${q3}\nBot: ${r3.data?.response}\n`);
  const falseNegative = /no se menciona|no se especifica|no se establece/i.test(r3.data?.response || "") &&
    /exoneraci[oó]n/i.test(r3.data?.response || "");
  console.log(falseNegative ? "❌ Sigue diciendo (falso) que la exoneración no aplica a afro/palenquera" : "✅ Ya no niega la exoneración para afro/palenquera");
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
