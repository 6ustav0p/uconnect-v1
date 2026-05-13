/**
 * Convierte pensum_programa.json a texto plano legible para subir al vector store de OpenAI.
 *
 * El JSON plano (30k+ registros) no es buscable porque los chunks de OpenAI cortan
 * los registros sin contexto. Este script agrupa por programa+jornada+semestre y
 * genera un archivo de texto con secciones claras.
 *
 * Uso: npx ts-node scripts/pensum-to-text.ts
 * Salida: scripts/pensum_readable.txt
 */

import * as fs from "fs";
import * as path from "path";

interface PensumRecord {
  programa: string;
  unid_nombre: string;
  jornada: string;
  pensum: string;
  numero_de_creditos_pensum: string;
  semestre: string;
  materia: string;
  codigo_materia: string;
  creditos: string;
  total_creditos_semestre: string;
}

const inputPath = path.join(__dirname, "../src/pensum_programa.json");
const outputPath = path.join(__dirname, "pensum_readable.txt");

const data: PensumRecord[] = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

// Agrupar por programa + jornada + unidad + semestre
type SemestreKey = string; // "PROGRAMA|JORNADA|UNIDAD|SEMESTRE"
type ProgramaKey = string; // "PROGRAMA|JORNADA|UNIDAD"

const programas = new Map<ProgramaKey, Map<number, PensumRecord[]>>();

for (const record of data) {
  const progKey: ProgramaKey = `${record.programa}|${record.jornada}|${record.unid_nombre}`;
  const semNum = parseInt(record.semestre, 10);

  if (!programas.has(progKey)) {
    programas.set(progKey, new Map());
  }
  const semestres = programas.get(progKey)!;
  if (!semestres.has(semNum)) {
    semestres.set(semNum, []);
  }
  semestres.get(semNum)!.push(record);
}

const lines: string[] = [];

lines.push("PENSUM DE PROGRAMAS ACADÉMICOS - UNIVERSIDAD DE CÓRDOBA");
lines.push("=".repeat(60));
lines.push("");

for (const [progKey, semestresMap] of programas) {
  const [programa, jornada, unidad] = progKey.split("|");

  // Tomar metadata del primer registro disponible
  const firstSem = Array.from(semestresMap.values())[0];
  const firstRecord = firstSem[0];

  lines.push(`PROGRAMA: ${programa}`);
  lines.push(`SEDE: ${unidad}`);
  lines.push(`JORNADA: ${jornada}`);
  lines.push(`PENSUM: ${firstRecord.pensum}`);
  lines.push(
    `TOTAL CRÉDITOS DEL PENSUM: ${firstRecord.numero_de_creditos_pensum}`,
  );
  lines.push("-".repeat(50));

  const sortedSemestres = Array.from(semestresMap.entries()).sort(
    ([a], [b]) => a - b,
  );

  for (const [semNum, materias] of sortedSemestres) {
    lines.push(`  Semestre ${semNum}:`);

    // Dedup materias (puede haber jornada duplicada)
    const seen = new Set<string>();
    for (const m of materias) {
      const key = m.codigo_materia;
      if (!seen.has(key)) {
        seen.add(key);
        lines.push(
          `    - ${m.materia} (código: ${m.codigo_materia}, créditos: ${m.creditos})`,
        );
      }
    }

    const totalCreditos = materias[0]?.total_creditos_semestre ?? "?";
    lines.push(`    Total créditos del semestre ${semNum}: ${totalCreditos}`);
    lines.push("");
  }

  lines.push("");
}

fs.writeFileSync(outputPath, lines.join("\n"), "utf-8");
console.log(`✓ Archivo generado: ${outputPath}`);
console.log(`  Programas únicos procesados: ${programas.size}`);
