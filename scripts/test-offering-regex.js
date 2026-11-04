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

const CASES = [
  { q: "dime las carreras de lorca", expectRoute: "offering" },
  { q: "programas que hay en montelibano", expectRoute: "offering" },
  { q: "que carreras hay en sahgun", expectRoute: "offering" },
  { q: "¿qué beneficios de admisión especial hay?", expectRoute: "other" },
  { q: "hay algun beneficio para comunidades afro o palenqueras?", expectRoute: "other" },
  { q: "materias del primer semestre de ingenieria de sistemas", expectRoute: "pensum" },
  { q: "cual es el perfil profesional del programa de ingenieria de sistemas", expectRoute: "pep" },
];

async function main() {
  for (const c of CASES) {
    const r = await postJson("/gpt/chat", { message: c.q });
    console.log(`\nPREGUNTA: ${c.q}\n(esperado: ${c.expectRoute})\nRESPUESTA:\n${r.data?.response}\n---`);
    await sleep(2200);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
