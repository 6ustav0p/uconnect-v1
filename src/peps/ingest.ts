import fs from "fs/promises";
import path from "path";
import { config } from "../config";
import { database } from "../services";
import { localDataService } from "../services/local-data.service";
import { ollamaService } from "../services/ollama.service";
import { pepRepository } from "../services/pep.repository";
import { logger, normalizeText, calculateSimilarity } from "../utils";
import { PepProfile, ProgramaAcademico } from "../types";

const SUPPORTED_EXTENSIONS = new Set([".txt", ".md", ".json"]);

function findProgramaByFilename(
  filename: string,
  programas: ProgramaAcademico[],
): ProgramaAcademico | null {
  const base = path.basename(filename, path.extname(filename));
  const normalizedBase = normalizeText(base.replace(/[_-]+/g, " "));

  let best: { programa: ProgramaAcademico; score: number } | null = null;

  for (const programa of programas) {
    const normalizedName = normalizeText(programa.prog_nombre);
    if (
      normalizedName.includes(normalizedBase) ||
      normalizedBase.includes(normalizedName)
    ) {
      return programa;
    }

    const score = calculateSimilarity(normalizedName, normalizedBase);
    if (!best || score > best.score) {
      best = { programa, score };
    }
  }

  return best && best.score >= 0.7 ? best.programa : null;
}

function trimLargeText(text: string, maxChars: number = 30000): string {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars / 2));
  const tail = text.slice(-Math.floor(maxChars / 2));
  return `${head}\n...\n${tail}`;
}

async function ingestFile(
  filePath: string,
  programas: ProgramaAcademico[],
): Promise<PepProfile | null> {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) return null;

  const programa = findProgramaByFilename(filePath, programas);
  if (!programa) {
    logger.warn("No se pudo asociar PEP a un programa", { filePath });
    return null;
  }

  const raw = await fs.readFile(filePath, "utf-8");

  if (ext === ".json") {
    const parsed = JSON.parse(raw) as Partial<PepProfile>;

    if (!parsed.programaId) parsed.programaId = programa.prog_id;
    if (!parsed.programaNombre) parsed.programaNombre = programa.prog_nombre;

    if (!parsed.resumen) {
      throw new Error(`El PEP JSON no tiene 'resumen': ${filePath}`);
    }

    return {
      programaId: parsed.programaId,
      programaNombre: parsed.programaNombre,
      resumen: parsed.resumen,
      historia: parsed.historia || "",
      perfilProfesional: parsed.perfilProfesional || "",
      perfilOcupacional: parsed.perfilOcupacional || "",
      mision: parsed.mision || "",
      vision: parsed.vision || "",
      objetivos: parsed.objetivos || [],
      competencias: parsed.competencias || [],
      camposOcupacionales: parsed.camposOcupacionales || [],
      lineasInvestigacion: parsed.lineasInvestigacion || [],
      requisitosIngreso: parsed.requisitosIngreso || "",
      requisitosGrado: parsed.requisitosGrado || "",
      fuente: parsed.fuente || path.basename(filePath),
      actualizadoEn: new Date(),
    };
  }

  const trimmed = trimLargeText(raw);
  return ollamaService.extractPepProfile(programa, trimmed);
}

async function main(): Promise<void> {
  try {
    await database.connect();

    const pepsDir = path.resolve(process.cwd(), config.peps.dir);
    const exists = await fs
      .access(pepsDir)
      .then(() => true)
      .catch(() => false);

    if (!exists) {
      logger.warn("Directorio PEP no encontrado", { pepsDir });
      return;
    }

    const files = await fs.readdir(pepsDir);
    const programas = localDataService.getProgramas();

    let processed = 0;

    for (const file of files) {
      const filePath = path.join(pepsDir, file);
      try {
        const profile = await ingestFile(filePath, programas);
        if (!profile) continue;

        await pepRepository.upsert(profile);
        processed += 1;
        logger.info("PEP almacenado", {
          programa: profile.programaNombre,
          file,
        });
      } catch (error) {
        logger.error("Error procesando PEP", {
          file,
          error: (error as Error).message,
        });
      }
    }

    logger.info("Ingesta PEP finalizada", { processed });
  } catch (error) {
    logger.error("Error en ingesta PEP", { error: (error as Error).message });
  } finally {
    await database.disconnect();
  }
}

main();
