import mongoose, { Schema, Document, Model } from "mongoose";
import { normalizeText } from "../utils";

export interface IPepProfile extends Document {
  programaId: string;
  programaNombre: string;
  programaNombreNormalized: string;
  resumen: string;
  rawText?: string;
  historia?: string;
  perfilProfesional?: string;
  perfilOcupacional?: string;
  mision?: string;
  vision?: string;
  objetivos?: string[];
  competencias?: string[];
  camposOcupacionales?: string[];
  lineasInvestigacion?: string[];
  requisitosIngreso?: string;
  requisitosGrado?: string;
  fuente?: string;
  actualizadoEn?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PepProfileSchema = new Schema<IPepProfile>(
  {
    programaId: { type: String, required: true, unique: true, index: true },
    programaNombre: { type: String, required: true },
    programaNombreNormalized: { type: String, required: true, index: true },
    resumen: { type: String, required: false, default: "" },
    rawText: String,
    historia: String,
    perfilProfesional: String,
    perfilOcupacional: String,
    mision: String,
    vision: String,
    objetivos: [String],
    competencias: [String],
    camposOcupacionales: [String],
    lineasInvestigacion: [String],
    requisitosIngreso: String,
    requisitosGrado: String,
    fuente: String,
    actualizadoEn: Date,
  },
  {
    timestamps: true,
    collection: "pep_profiles",
  },
);

PepProfileSchema.pre("validate", function () {
  if (this.programaNombre) {
    this.programaNombreNormalized = normalizeText(this.programaNombre);
  }
});

export const PepProfile: Model<IPepProfile> =
  mongoose.models.PepProfile ||
  mongoose.model<IPepProfile>("PepProfile", PepProfileSchema);
