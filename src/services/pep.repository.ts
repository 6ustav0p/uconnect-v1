import { PepProfile, IPepProfile } from "../models";
import { PepProfile as PepProfileType } from "../types";
import { normalizeText } from "../utils";

export class PepRepository {
  async upsert(profile: PepProfileType): Promise<PepProfileType> {
    const normalized = normalizeText(profile.programaNombre);

    const doc = await PepProfile.findOneAndUpdate(
      { programaId: profile.programaId },
      {
        $set: {
          ...profile,
          programaNombreNormalized: normalized,
          actualizadoEn: profile.actualizadoEn || new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean<IPepProfile>();

    return this.toType(doc);
  }

  async findByProgramaId(programaId: string): Promise<PepProfileType | null> {
    const doc = await PepProfile.findOne({ programaId }).lean<IPepProfile>();
    return doc ? this.toType(doc) : null;
  }

  async findByProgramaNombre(
    programaNombre: string,
  ): Promise<PepProfileType | null> {
    const normalized = normalizeText(programaNombre);

    const doc = await PepProfile.findOne({
      programaNombreNormalized: normalized,
    }).lean<IPepProfile>();

    return doc ? this.toType(doc) : null;
  }

  async findAll(): Promise<PepProfileType[]> {
    const docs = await PepProfile.find()
      .sort({ programaNombre: 1 })
      .lean<IPepProfile[]>();
    return docs.map((doc) => this.toType(doc));
  }

  async deleteByProgramaId(programaId: string): Promise<boolean> {
    const result = await PepProfile.deleteOne({ programaId });
    return result.deletedCount > 0;
  }

  private toType(doc: IPepProfile): PepProfileType {
    return {
      programaId: doc.programaId,
      programaNombre: doc.programaNombre,
      resumen: doc.resumen,
      rawText: doc.rawText,
      historia: doc.historia,
      perfilProfesional: doc.perfilProfesional,
      perfilOcupacional: doc.perfilOcupacional,
      mision: doc.mision,
      vision: doc.vision,
      objetivos: doc.objetivos,
      competencias: doc.competencias,
      camposOcupacionales: doc.camposOcupacionales,
      lineasInvestigacion: doc.lineasInvestigacion,
      requisitosIngreso: doc.requisitosIngreso,
      requisitosGrado: doc.requisitosGrado,
      fuente: doc.fuente,
      actualizadoEn: doc.actualizadoEn,
    };
  }
}

export const pepRepository = new PepRepository();
