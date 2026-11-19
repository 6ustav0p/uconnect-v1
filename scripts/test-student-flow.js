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

const TURNS = [
  {
    message: "Hola, ¿qué carreras de ingeniería ofrece la Universidad?",
    expected: /ingenier[ií]a|programa/i,
    forbidden: /acuerdo\s*062|discapacidad/i,
  },
  {
    message: "¿Y cuáles están disponibles en Montería?",
    expected: /monter[ií]a|ingenier[ií]a/i,
    forbidden: /no tengo esa informaci[oó]n/i,
  },
  {
    message: "Quiero el pensum de Ingeniería de Sistemas, ¿qué materias tiene?",
    expected: /pensum|semestre|programaci[oó]n/i,
    forbidden: /acuerdo\s*062|v[ií]ctima/i,
  },
  {
    message: "¿Y cuántos créditos son?",
    expected: /cr[eé]ditos|160/i,
    forbidden: /no tengo esa informaci[oó]n/i,
  },
  {
    message: "También quiero saber cuáles son los requisitos para ingresar.",
    expected: /requisito|admisi[oó]n|inscripci[oó]n/i,
    forbidden: /pensum de|programaci[oó]n|no tengo esa informaci[oó]n/i,
  },
  {
    message: "Soy víctima del conflicto armado, ¿qué beneficio tendría?",
    expected: /v[ií]ctima|beneficio|cupo|exoner/i,
    forbidden: /afro|ind[ií]gena|deportista/i,
  },
  {
    message: "¿Qué documentos me pedirían?",
    expected: /document|registro|certificado|requisito|v[ií]ctima/i,
    forbidden: /pensum de|programaci[oó]n/i,
  },
  {
    message: "Cambiando de tema, ¿qué maestrías ofrece la universidad?",
    expected: /maestr[ií]a|posgrado|doctorado/i,
    forbidden: /pensum de ingenier[ií]a|acuerdo\s*062/i,
  },
  {
    message: "¿Qué puntaje debo sacar para entrar a Ingeniería de Sistemas?",
    expected: /puntaje|ponderado|simulador|referencia/i,
    forbidden: /pensum de ingenier[ií]a|semestre|maestr[ií]a/i,
  },
  {
    message: "¿Qué clima hará mañana en Montería?",
    expected: /no tengo|informaci[oó]n|clima|meteorolog/i,
    forbidden: /maestr[ií]a|pensum de|programaci[oó]n/i,
  },
];

async function main() {
  const session = await postJson("/chat/session", {});
  const sessionId = session.data?.sessionId;
  if (session.status !== 201 || !sessionId) {
    throw new Error(`No se pudo crear la sesión: ${JSON.stringify(session.data)}`);
  }

  let failures = 0;
  for (const [index, turn] of TURNS.entries()) {
    const result = await postJson("/chat", {
      sessionId,
      message: turn.message,
    });
    const response = result.data?.response?.message || "";
    const passed =
      result.status === 200 &&
      turn.expected.test(response) &&
      !turn.forbidden.test(response);
    if (!passed) failures += 1;

    console.log(
      `${passed ? "✅" : "❌"} Turno ${index + 1}: ${turn.message}\n${response.slice(0, 650)}\n---`,
    );
  }

  console.log(`\nFlujo de estudiante: ${TURNS.length - failures}/${TURNS.length} turnos aprobados.`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error("ERROR", error);
  process.exitCode = 1;
});