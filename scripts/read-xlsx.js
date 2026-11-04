const XLSX = require("xlsx");
const path = require("path");
const filePath = process.argv[2];
const wb = XLSX.readFile(filePath);
console.log("Sheets:", wb.SheetNames);
for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name];
  const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`\n=== ${name} (${json.length} filas) ===`);
  console.log(JSON.stringify(json, null, 1).slice(0, 6000));
}
