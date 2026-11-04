const fs = require("fs");
const path = require("path");

const sourceDir = path.join(__dirname, "..", "src", "data");
const targetDir = path.join(__dirname, "..", "dist", "data");

fs.mkdirSync(targetDir, { recursive: true });

for (const filename of ["pensum_pregrado.md", "pensum_posgrado.md"]) {
  fs.copyFileSync(
    path.join(sourceDir, filename),
    path.join(targetDir, filename),
  );
}

console.log("Pensum Markdown copiado a dist/data.");
