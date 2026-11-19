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

const CASES = [
  {
    group: "oferta",
    query: "que puedo estudiar en lorica",
    expected: /oferta acad[eé]mica de pregrado|ingenier[ií]a|licenciatura/i,
  },
  {
    group: "oferta",
    query: "me dices la oferta de monter[ií]a",
    expected: /oferta acad[eé]mica de pregrado|ingenier[ií]a|licenciatura/i,
  },
  {
    group: "pensum",
    query: "cual es la malla curricular de sistemas",
    expected: /pensum de ingenier[ií]a de sistemas|semestre 1/i,
  },
  {
    group: "pensum",
    query: "que se ve en primero de ingenieria industrial",
    expected: /pensum|semestre 1|c[aá]lculo/i,
  },
  {
    group: "beneficios",
    query: "que ayudas hay para afro",
    expected: /afro|palenquer|beneficio|cupo/i,
  },
  {
    group: "beneficios",
    query: "hay descuentos para v[ií]ctimas",
    expected: /v[ií]ctima|beneficio|cupo|exoner/i,
  },
  {
    group: "posgrado",
    query: "que masters tienen",
    expected: /maestr[ií]a|posgrado|doctorado/i,
  },
];

async function main() {
  let failures = 0;

  for (const testCase of CASES) {
    const result = await postJson("/gpt/chat", { message: testCase.query });
    const response = result.data?.response || "";
    const unavailable = /no tengo esa informaci[oó]n|no encuentro esa informaci[oó]n/i.test(
      response,
    );
    const passed =
      result.status === 200 && !unavailable && testCase.expected.test(response);
    if (!passed) failures += 1;

    console.log(
      `${passed ? "✅" : "❌"} [${testCase.group}] ${testCase.query}\n${response.slice(0, 500)}\n---`,
    );
  }

  console.log(`\nResultado: ${CASES.length - failures}/${CASES.length} consultas coloquiales pasaron.`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error("ERROR", error);
  process.exitCode = 1;
});