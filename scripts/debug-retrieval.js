require("dotenv").config();
const { OpenAI } = require("openai");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function main() {
  const query = process.argv[2] || "hay algun beneficio para comunidades afro o palenqueras?";
  const res = await client.vectorStores.search(process.env.OPENAI_VECTOR_STORE_ID, {
    query,
    max_num_results: 8,
  });

  console.log(`Query: "${query}"\n`);
  res.data.forEach((r, i) => {
    const snippet = (r.content?.[0]?.text || "").replace(/\s+/g, " ").slice(0, 220);
    console.log(`#${i + 1} [score=${r.score.toFixed(4)}] ${r.filename}`);
    console.log(`   "${snippet}..."\n`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
