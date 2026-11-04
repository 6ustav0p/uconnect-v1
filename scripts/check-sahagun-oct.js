const XLSX = require("xlsx");
const wb = XLSX.readFile(process.argv[2]);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
const toDate = (s) => new Date((s - 25569) * 86400 * 1000).toISOString().slice(0, 10);
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const sede = r[1];
  const date = toDate(r[0]);
  if (sede === "Sahagún" && date === "2026-10-01") {
    console.log(`#${i} [${date}] Claridad=${r[5]} Precision=${r[6]} Contexto=${r[7]} Velocidad=${r[8]}`);
    console.log(`  PREGUNTA_MALA: ${r[13]}`);
    console.log(`  COMENTARIO: ${r[15]}`);
    console.log("---");
  }
}
