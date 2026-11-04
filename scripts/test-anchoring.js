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

async function runScenario(label, turns, checks) {
  console.log(`\n\n=== ${label} ===`);
  const s = await newSession();
  const responses = [];
  for (const msg of turns) {
    const r = await postJson("/gpt/chat", { sessionId: s, message: msg });
    console.log(`\nYo: ${msg}\nBot: ${r.data?.response}`);
    responses.push(r.data?.response || "");
    await sleep(2200);
  }
  checks(responses);
}

async function main() {
  await runScenario(
    "CASO 1 (de la captura): afro/palenqueras -> requisitos -> corrección",
    [
      "hay algun beneficio para comunidades afro o palenqueras?",
      "si porfavor, que requisitos piden",
      "me refiero a los beneficios de afro",
    ],
    (r) => {
      const mixedDiscapacidad = /discapacidad|movilidad reducida/i.test(r[0]);
      const reqAreDiscapacidad = /diagnóstico|concepto médico/i.test(r[1]);
      const reqAreEtnico = /cabildo|autoridad(es)? (tradicional|indígena)/i.test(r[1]);
      const falseNegative = /(no se menciona|no se especifica|no se establece).*exoneraci[oó]n|exoneraci[oó]n.*(no se menciona|no se especifica)/i.test(r[2]);
      console.log(`\n${mixedDiscapacidad ? "❌" : "✅"} Turno 1 mezcló discapacidad: ${mixedDiscapacidad}`);
      console.log(`${reqAreDiscapacidad ? "❌" : "✅"} Turno 2 dio requisitos de discapacidad: ${reqAreDiscapacidad}`);
      console.log(`${reqAreEtnico ? "✅" : "⚠️"} Turno 2 dio requisitos étnicos (cabildo): ${reqAreEtnico}`);
      console.log(`${falseNegative ? "❌" : "✅"} Turno 3 negó falsamente la exoneración: ${falseNegative}`);
    },
  );

  await runScenario(
    "CASO 2 (par de temas distinto, para probar generalidad): deportistas -> requisitos",
    [
      "que beneficios hay para los mejores bachilleres deportistas?",
      "que requisitos piden",
    ],
    (r) => {
      const mixedArtista = /artist[ae]|talento art[íi]stico/i.test(r[0]);
      const reqAreArtista = /talento art[íi]stico|80%|ochenta por ciento/i.test(r[1]);
      const reqAreDeportista = /prueba de aptitud f[íi]sica|comité de evaluaci[oó]n deportiva|85%/i.test(r[1]);
      console.log(`\n${mixedArtista ? "⚠️" : "✅"} Turno 1 mezcló artistas sin que se pidiera: ${mixedArtista}`);
      console.log(`${reqAreArtista ? "❌" : "✅"} Turno 2 dio requisitos de artista (equivocado): ${reqAreArtista}`);
      console.log(`${reqAreDeportista ? "✅" : "⚠️"} Turno 2 dio requisitos de deportista (correcto): ${reqAreDeportista}`);
    },
  );
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
