import mongoose, { Schema, Document, Model } from "mongoose";

export type PepUploadItemStatus =
  | "pending-upload"
  | "queued"
  | "processing"
  | "done"
  | "failed";

export interface IPepUploadItem {
  fileName: string;
  contentType: string;
  s3Key: string;
  textS3Key?: string;
  programaId?: string;
  programaNombre?: string;
  status: PepUploadItemStatus;
  textractJobId?: string;
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPepUpload extends Document {
  uploadId: string;
  status: "created" | "processing" | "completed" | "failed";
  items: IPepUploadItem[];
  createdAt: Date;
  updatedAt: Date;
}

const PepUploadItemSchema = new Schema<IPepUploadItem>(
  {
    fileName: { type: String, required: true },
    contentType: { type: String, required: true },
    s3Key: { type: String, required: true },
    textS3Key: String,
    programaId: String,
    programaNombre: String,
    status: {
      type: String,
      required: true,
      enum: ["pending-upload", "queued", "processing", "done", "failed"],
      default: "pending-upload",
    },
    textractJobId: String,
    error: String,
  },
  { _id: false, timestamps: true },
);

const PepUploadSchema = new Schema<IPepUpload>(
  {
    uploadId: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      required: true,
      enum: ["created", "processing", "completed", "failed"],
      default: "created",
    },
    items: { type: [PepUploadItemSchema], default: [] },
  },
  { timestamps: true, collection: "pep_uploads" },
);

export const PepUpload: Model<IPepUpload> =
  mongoose.models.PepUpload ||
  mongoose.model<IPepUpload>("PepUpload", PepUploadSchema);