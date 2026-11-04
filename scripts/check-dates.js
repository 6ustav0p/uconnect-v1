const XLSX = require("xlsx");
const wb = XLSX.readFile(process.argv[2]);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
const toDate = (s) => new Date((s - 25569) * 86400 * 1000).toISOString().slice(0, 10);
const bySede = {};
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const sede = r[1];
  const date = toDate(r[0]);
  if (!bySede[sede]) bySede[sede] = new Set();
  bySede[sede].add(date);
}
for (const [sede, dates] of Object.entries(bySede)) {
  console.log(sede, [...dates].sort());
}
