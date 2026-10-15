import { parseFaqKbText } from "../src/services/faq-kb.store";
import fs from "fs";
const text = fs.readFileSync("scripts/faq-content-dump.md", "utf8");
const entries = parseFaqKbText(text);
console.log("Total entradas:", entries.length);
console.log(JSON.stringify(entries.slice(0, 3), null, 2));
const categorias = new Set(entries.map((e) => e.category));
console.log("Categorías:", [...categorias]);

const puntajes = entries.find((e) => e.category === "Puntajes y Ponderación");
console.log("\n--- Entrada con lista/links ---");
console.log(JSON.stringify(puntajes, null, 2));

const last = entries[entries.length - 1];
console.log("\n--- Última entrada ---");
console.log(JSON.stringify(last, null, 2));
