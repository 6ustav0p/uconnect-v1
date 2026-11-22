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

const FLOWS = [
  {
    name: "académico y admisión",
    turns: [
      {
        message: "¿Qué carreras de ingeniería hay en la universidad?",
        expected: /ingenier[ií]a|programa/i,
        forbidden: /no tengo esa informaci[oó]n|acuerdo\s*062|v[ií]ctima/i,
      },
      {
        message: "¿Me das el pensum de Ingeniería de Sistemas?",
        expected: /pensum de ingenier[ií]a de sistemas|semestre/i,
        forbidden: /maestr[ií]a|acuerdo\s*062|v[ií]ctima/i,
      },
      {
        message: "¿Qué beneficio hay para una persona víctima del conflicto?",
        expected: /v[ií]ctima|RUV|beneficio|cupo/i,
        forbidden: /pensum de ingenier[ií]a|programaci[oó]n I|maestr[ií]a/i,
      },
      {
        message: "¿Qué puntaje debo sacar para entrar a sistemas?",
        expected: /puntaje|ponderado|simulador|referencia/i,
        forbidden: /pensum de ingenier[ií]a|maestr[ií]a|RUV/i,
      },
      {
        message: "Ahora sí, ¿qué maestrías ofrecen?",
        expected: /maestr[ií]a|posgrado|doctorado/i,
        forbidden: /pensum de ingenier[ií]a|puntaje|RUV/i,
      },
      {
        message: "¿Y qué clima hará mañana?",
        expected: /no tengo|informaci[oó]n|clima|meteorolog/i,
        forbidden: /maestr[ií]a|pensum de|puntaje|RUV/i,
      },
    ],
  },
  {
    name: "grupos de admisión",
    turns: [
      {
        message: "¿Qué beneficios tienen las víctimas?",
        expected: /v[ií]ctima|RUV|cupo|exoner/i,
        forbidden: /ind[ií]gena|afro|pensum/i,
      },
      {
        message: "¿Y para los indígenas?",
        expected: /ind[ií]gena|cabildo|cupo/i,
        forbidden: /v[ií]ctima|RUV/i,
      },
      {
        message: "¿Qué requisitos piden?",
        expected: /requisito|cabildo|aval|document/i,
        forbidden: /v[ií]ctima|RUV|pensum|no tengo esa informaci[oó]n/i,
      },
      {
        message: "Mejor dime cómo recupero mi correo institucional.",
        expected: /no tengo|correo|Admisiones|informaci[oó]n/i,
        forbidden: /cabildo|RUV|cupo|ind[ií]gena/i,
      },
    ],
  },
];

async function main() {
  let failures = 0;

  for (const flow of FLOWS) {
    const session = await postJson("/chat/session", {});
    const sessionId = session.data?.sessionId;
    if (session.status !== 201 || !sessionId) {
      throw new Error(`No se pudo crear sesión para ${flow.name}`);
    }

    console.log(`\n=== ${flow.name} ===`);
    for (const [index, turn] of flow.turns.entries()) {
      const result = await postJson("/chat", { sessionId, message: turn.message });
      const response = result.data?.response?.message || "";
      const passed =
        result.status === 200 &&
        turn.expected.test(response) &&
        !turn.forbidden.test(response);
      if (!passed) failures += 1;

      console.log(
        `${passed ? "✅" : "❌"} ${index + 1}. ${turn.message}\n${response.slice(0, 420)}\n---`,
      );
    }
  }

  const total = FLOWS.reduce((sum, flow) => sum + flow.turns.length, 0);
  console.log(`\nCambios de contexto: ${total - failures}/${total} turnos aprobados.`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error("ERROR", error);
  process.exitCode = 1;
});
