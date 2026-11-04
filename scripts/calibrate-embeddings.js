require("dotenv").config();
const { OpenAI } = require("openai");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const PAIRS = [
  {
    label: "Tema totalmente distinto (pensum -> Acuerdo 062)",
    a: "¿Qué materias hay en el segundo semestre de ingeniería de sistemas?",
    b: "¿Hay algún beneficio del Acuerdo 062 para comunidades afro o palenqueras?",
    expect: "BAJA",
  },
  {
    label: "Mismo dominio, subtema distinto (víctimas -> indígenas)",
    a: "¿Qué beneficios de admisión especial hay para víctimas del conflicto armado?",
    b: "¿Y para los indígenas?",
    expect: "MEDIA/ALTA",
  },
  {
    label: "Follow-up ambiguo que depende 100% del contexto (promedio mínimo)",
    a: "¿Qué beneficios de admisión especial hay para víctimas del conflicto armado?",
    b: "¿Cuál es el promedio mínimo que debo mantener?",
    expect: "MEDIA/ALTA (necesita el contexto para saber de qué programa)",
  },
  {
    label: "Cambio de tema abrupto y no relacionado (correo institucional)",
    a: "¿Qué beneficios de admisión especial hay para víctimas del conflicto armado?",
    b: "¿Cómo recupero mi correo institucional?",
    expect: "BAJA",
  },
  {
    label: "Mismo tema, follow-up de semestre (pensum -> pensum)",
    a: "¿Qué materias hay en el segundo semestre de ingeniería de sistemas?",
    b: "¿Y en tercer semestre?",
    expect: "ALTA",
  },
  {
    label: "Mismo dominio, capítulo distinto (deportistas -> artistas)",
    a: "¿Qué requisitos hay para el cupo especial de mejor bachiller deportista?",
    b: "¿Aplica lo mismo para los bachilleres artistas?",
    expect: "MEDIA/ALTA",
  },
];

async function main() {
  const inputs = PAIRS.flatMap((p) => [p.a, p.b]);
  const res = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: inputs,
  });

  console.log("Par | Similitud coseno | Esperado\n");
  PAIRS.forEach((p, i) => {
    const va = res.data[i * 2].embedding;
    const vb = res.data[i * 2 + 1].embedding;
    const sim = cosineSimilarity(va, vb);
    console.log(`${p.label}\n  A: "${p.a}"\n  B: "${p.b}"\n  Similitud: ${sim.toFixed(4)} | Esperado: ${p.expect}\n`);
  });

  console.log("Uso de tokens:", JSON.stringify(res.usage));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
