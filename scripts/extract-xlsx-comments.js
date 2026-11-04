const XLSX = require("xlsx");
const filePath = process.argv[2];
const wb = XLSX.readFile(filePath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
const idxSede = 1,
  idxBadQ = 13,
  idxComment = 15;
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const badQ = (r[idxBadQ] || "").toString().trim();
  const comment = (r[idxComment] || "").toString().trim();
  const isNoish = /^no+[,.]?$/i.test(badQ) || badQ === "";
  const commentNoish = /^no\s*$/i.test(comment) || comment === "";
  if (!isNoish || !commentNoish) {
    console.log(
      `#${i} [${r[idxSede]}] PREGUNTA_MALA: ${badQ || "(ninguna)"} | COMENTARIO: ${comment || "(ninguno)"}`,
    );
  }
}
