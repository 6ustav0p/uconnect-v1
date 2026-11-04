import * as fs from "fs";
import * as path from "path";
import { MateriaPensum } from "../types";

type AcademicLevel = "pregrado" | "posgrado";

function readSourceFile(level: AcademicLevel): string {
  const configuredPath =
    level === "pregrado"
      ? process.env.PENSUM_PREGRADO_PATH
      : process.env.PENSUM_POSGRADO_PATH;
  const defaultPath = path.join(
    __dirname,
    "..",
    "data",
    `pensum_${level}.md`,
  );
  const sourcePath =
    configuredPath?.trim() ||
    (fs.existsSync(defaultPath)
      ? defaultPath
      : path.join(process.cwd(), "src", "data", `pensum_${level}.md`));

  try {
    return fs.readFileSync(sourcePath, "utf8");
  } catch (error) {
    throw new Error(
      `No se pudo leer la fuente Markdown del pensum de ${level}: ${
        (error as Error).message
      }`,
    );
  }
}

function parseSubject(line: string): {
  materia: string;
  codigo: string;
  creditos: string;
} | null {
  const match = line.match(
    /^\s*-\s+(.+?)(?:\s+\(código:\s*([^,]+),\s*créditos:\s*([^)]+)\))?\s*$/,
  );
  if (!match) return null;

  return {
    materia: match[1].trim(),
    codigo: match[2]?.trim() || "NO ESPECIFICADO",
    creditos: match[3]?.trim() || "NO ESPECIFICADO",
  };
}

function parsePensumMarkdown(
  markdown: string,
  level: AcademicLevel,
): MateriaPensum[] {
  const records: MateriaPensum[] = [];
  const programBlocks = markdown.split(/^##\s+/m).slice(1);

  for (const block of programBlocks) {
    const programMatch = block.match(/^([^\r\n]+)\r?\n/);
    const program = programMatch?.[1]?.trim();
    if (!program) continue;

    const metadata = new Map<string, string>();
    for (const line of block.split(/\r?\n/)) {
      const match = line.match(
        /^(PROGRAMA|SEDE|JORNADA|PENSUM|TOTAL CRÉDITOS DEL PENSUM):\s*(.+)$/i,
      );
      if (match) metadata.set(match[1].toUpperCase(), match[2].trim());
    }

    const programName = metadata.get("PROGRAMA") || program;
    const location = metadata.get("SEDE") || "NO ESPECIFICADO";
    const jornada = metadata.get("JORNADA") || "NO ESPECIFICADO";
    const pensum = metadata.get("PENSUM") || "NO ESPECIFICADO";
    const totalCredits =
      metadata.get("TOTAL CRÉDITOS DEL PENSUM") || "NO ESPECIFICADO";
    const semesterMatches = [
      ...block.matchAll(
        /(?:^|\r?\n)\s*Semestre\s+(\d+):\s*\r?\n([\s\S]*?)(?=(?:\r?\n\s*Semestre\s+\d+:)|$)/gi,
      ),
    ];

    for (const semesterMatch of semesterMatches) {
      const semester = semesterMatch[1];
      const subjects = semesterMatch[2]
        .split(/\r?\n/)
        .map(parseSubject)
        .filter(
          (subject): subject is NonNullable<typeof subject> =>
            subject !== null,
        );
      const semesterCredits =
        semesterMatch[2].match(
          /Total créditos del semestre \d+:\s*([^\r\n]+)/i,
        )?.[1]?.trim() || "NO ESPECIFICADO";

      subjects.forEach((subject, index) => {
        records.push({
          programa: programName,
          unid_nombre: location,
          jornada,
          pensum,
          numero_de_creditos_pensum: totalCredits,
          semestre: semester,
          materia: subject.materia,
          codigo_materia:
            subject.codigo === "NO ESPECIFICADO"
              ? `SIN_CODIGO_${level.toUpperCase()}_${normalizeKey(
                  programName,
                )}_S${semester.padStart(2, "0")}_${String(index + 1).padStart(
                  2,
                  "0",
                )}`
              : subject.codigo,
          creditos: subject.creditos,
          total_creditos_semestre: semesterCredits,
        });
      });
    }
  }

  return records;
}

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function loadPensumFromMarkdown(): MateriaPensum[] {
  return [
    ...parsePensumMarkdown(readSourceFile("pregrado"), "pregrado"),
    ...parsePensumMarkdown(readSourceFile("posgrado"), "posgrado"),
  ];
}
