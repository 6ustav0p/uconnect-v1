import { normalizeText } from "../utils";
import { PepProfile } from "../types";

interface ParsedSection {
  [key: string]: string | string[];
}

export class PepParserService {
  private readonly sectionAliases: Record<string, string[]> = {
    resumen: ["resumen", "sinopsis", "descripcion"],
    historia: ["historia", "historico", "antecedentes", "origen"],
    perfilProfesional: [
      "perfil profesional",
      "perfil del egresado",
      "perfil profesional del egresado",
    ],
    perfilOcupacional: [
      "perfil ocupacional",
      "campo laboral",
      "campos de trabajo",
      "oportunidades laborales",
    ],
    mision: ["mision", "misión"],
    vision: ["vision", "visión"],
    objetivos: [
      "objetivos",
      "objetivos generales",
      "objetivos especificos",
      "metas",
    ],
    competencias: [
      "competencias",
      "competencias generales",
      "competencias especificas",
      "habilidades",
    ],
    camposOcupacionales: [
      "campos ocupacionales",
      "campos de desempeño",
      "sectores de trabajo",
    ],
    lineasInvestigacion: [
      "lineas de investigacion",
      "líneas de investigación",
      "lineas investigativas",
      "grupos de investigacion",
    ],
    requisitosIngreso: [
      "requisitos de ingreso",
      "prerrequisitos",
      "requisitos previos",
    ],
    requisitosGrado: [
      "requisitos de grado",
      "requisitos de graduacion",
      "criterios de egreso",
    ],
  };

  /**
   * Parsea texto plano a estructura JSON de PepProfile
   */
  parse(text: string, programaId: string, programaNombre: string): PepProfile {
    const sections = this.extractSections(text);

    return {
      programaId,
      programaNombre,
      resumen: this.getFieldValue(sections, "resumen", 1200),
      historia: this.getFieldValue(sections, "historia", 500),
      perfilProfesional: this.getFieldValue(sections, "perfilProfesional", 500),
      perfilOcupacional: this.getFieldValue(sections, "perfilOcupacional", 500),
      mision: this.getFieldValue(sections, "mision", 300),
      vision: this.getFieldValue(sections, "vision", 300),
      objetivos: this.getListField(sections, "objetivos"),
      competencias: this.getListField(sections, "competencias"),
      camposOcupacionales: this.getListField(sections, "camposOcupacionales"),
      lineasInvestigacion: this.getListField(sections, "lineasInvestigacion"),
      requisitosIngreso: this.getFieldValue(sections, "requisitosIngreso", 300),
      requisitosGrado: this.getFieldValue(sections, "requisitosGrado", 300),
      fuente: "Carga manual",
      actualizadoEn: new Date(),
    };
  }

  /**
   * Extrae secciones del texto basado en headings y palabras clave
   */
  private extractSections(text: string): ParsedSection {
    const sections: ParsedSection = {};
    const lines = text.split("\n");
    let currentSection: string | null = null;
    let currentContent: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const heading = this.detectHeading(trimmed);
      if (heading) {
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join("\n").trim();
          currentContent = [];
        }
        currentSection = heading;
        continue;
      }

      if (currentSection) {
        currentContent.push(trimmed);
      }
    }

    if (currentSection && currentContent.length > 0) {
      sections[currentSection] = currentContent.join("\n").trim();
    }

    return sections;
  }

  /**
   * Detecta si una línea es un heading y devuelve la clave canónica
   */
  private detectHeading(line: string): string | null {
    const normalized = normalizeText(line.replace(/^#+\s*/, ""));

    for (const [canonical, aliases] of Object.entries(this.sectionAliases)) {
      for (const alias of aliases) {
        if (
          normalizeText(alias).includes(normalized) ||
          normalized.includes(normalizeText(alias))
        ) {
          return canonical;
        }
      }
    }

    return null;
  }

  /**
   * Obtiene un campo de texto, truncado a max caracteres
   */
  private getFieldValue(
    sections: ParsedSection,
    key: string,
    maxChars: number,
  ): string {
    const value = sections[key];
    if (!value || typeof value !== "string") return "";

    const text = value.trim();
    if (text.length <= maxChars) return text;

    return text.slice(0, maxChars - 3).trim() + "...";
  }

  /**
   * Obtiene un campo como lista (parsea bullets, números, semicolons)
   */
  private getListField(sections: ParsedSection, key: string): string[] {
    const value = sections[key];
    if (!value || typeof value !== "string") return [];

    const items: string[] = [];
    const bulletPattern = /^[\s\-\•\*\d+\.]+\s*(.+)$/gm;
    let match;

    while ((match = bulletPattern.exec(value)) !== null) {
      const item = match[1].trim();
      if (item && item.length > 0) {
        items.push(item);
      }
    }

    if (items.length === 0) {
      return value
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }

    return items;
  }
}

export const pepParserService = new PepParserService();
