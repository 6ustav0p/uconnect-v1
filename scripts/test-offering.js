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

async function main() {
  console.log("=== CASO DEL INFORME: interés en posgrado -> qué programas hay -> aclaración posgrado ===\n");
  const s = await newSession();

  const turns = [
    "quiero ingresar a un posgrado",
    "¿qué programas hay?",
    "me refiero a programas de posgrado",
  ];
  const responses = [];
  for (const msg of turns) {
    const r = await postJson("/gpt/chat", { sessionId: s, message: msg });
    console.log(`Yo: ${msg}\nBot: ${r.data?.response}\n---\n`);
    responses.push(r.data?.response || "");
    await sleep(2200);
  }

  const t2MixedAcuerdo = /acuerdo\s*062|cupo especial|exoneraci[oó]n|comunidad(es)? (afro|ind[ií]gena)|discapacidad/i.test(responses[1]);
  const t3Evasive = /visita(r)? (la|directamente la)?\s*p[aá]gina web|contacta(r)? (con|a) la (oficina|coordinaci[oó]n)/i.test(responses[2]);
  const t3Honest = /no (dispongo|tengo|cuento con)|actualmente no/i.test(responses[2]);

  console.log("--- Checks ---");
  console.log(`Turno2 confundió con Acuerdo 062 (cupos especiales): ${t2MixedAcuerdo ? "❌ SÍ" : "✅ no"}`);
  console.log(`Turno3 fue evasivo (manda a página web sin más): ${t3Evasive ? "❌ SÍ" : "✅ no"}`);
  console.log(`Turno3 fue honesto sobre la falta de datos de posgrado: ${t3Honest ? "✅ sí" : "⚠️ no quedó claro"}`);

  console.log("\n\n=== Control: pregunta genérica de pregrado (no debe romperse) ===\n");
  const s2 = await newSession();
  const r = await postJson("/gpt/chat", { sessionId: s2, message: "¿qué carreras hay en la Universidad de Córdoba?" });
  console.log(`Bot: ${r.data?.response}\n`);
  const listedReal = /ingenier[íi]a|licenciatura|administraci[oó]n/i.test(r.data?.response || "");
  console.log(`Listó programas reales de pregrado: ${listedReal ? "✅ sí" : "❌ no"}`);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
