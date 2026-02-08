import { v4 as uuidv4 } from "uuid";
import { PepUpload, IPepUploadItem } from "../models";
import { s3Service } from "./s3.service";
import { textractService } from "./textract.service";
import { pepRepository } from "./pep.repository";
import { localDataService } from "./local-data.service";
import { logger } from "../utils";

export interface PepUploadInitFile {
  fileName: string;
  contentType: string;
}

export interface PepUploadInitResponseItem {
  fileName: string;
  contentType: string;
  s3Key: string;
  uploadUrl: string;
}

export interface PepUploadMapping {
  s3Key: string;
  programaId: string;
}

export class PepUploadService {
  private sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  private getProgramName(programaId: string): string | null {
    const program = localDataService
      .getProgramas()
      .find((p) => p.prog_id === programaId);
    return program ? program.prog_nombre : null;
  }

  async initUpload(
    files: PepUploadInitFile[],
  ): Promise<{ uploadId: string; items: PepUploadInitResponseItem[] }> {
    const uploadId = uuidv4();
    const prefix = s3Service.getPrefix();

    const items: IPepUploadItem[] = [];
    const responseItems: PepUploadInitResponseItem[] = [];

    for (const file of files) {
      const safeName = this.sanitizeFileName(file.fileName);
      const s3Key = `${prefix}/${uploadId}/pdf/${safeName}`;
      const uploadUrl = await s3Service.getPresignedPutUrl(
        s3Key,
        file.contentType,
      );

      items.push({
        fileName: file.fileName,
        contentType: file.contentType,
        s3Key,
        status: "pending-upload",
      });

      responseItems.push({
        fileName: file.fileName,
        contentType: file.contentType,
        s3Key,
        uploadUrl,
      });
    }

    await PepUpload.create({ uploadId, status: "created", items });

    return { uploadId, items: responseItems };
  }

  async completeUpload(uploadId: string, mappings: PepUploadMapping[]) {
    const upload = await PepUpload.findOne({ uploadId });
    if (!upload) {
      throw new Error(`Upload no encontrado: ${uploadId}`);
    }

    const mappingByKey = new Map(
      mappings.map((m) => [m.s3Key, m.programaId]),
    );

    for (const item of upload.items) {
      const programaId = mappingByKey.get(item.s3Key);
      if (programaId) {
        const programaNombre = this.getProgramName(programaId);
        item.programaId = programaId;
        item.programaNombre = programaNombre || undefined;
        item.status = "queued";
      }
    }

    upload.status = "processing";
    await upload.save();

    setImmediate(() => {
      this.processUpload(uploadId).catch((error) => {
        logger.error("Error procesando upload", {
          uploadId,
          error: (error as Error).message,
        });
      });
    });

    return upload;
  }

  async getUpload(uploadId: string) {
    return PepUpload.findOne({ uploadId });
  }

  private getTextKey(uploadId: string, fileName: string): string {
    const prefix = s3Service.getPrefix();
    const safeName = this.sanitizeFileName(fileName);
    return `${prefix}/${uploadId}/text/${safeName}.txt`;
  }

  async processUpload(uploadId: string): Promise<void> {
    const upload = await PepUpload.findOne({ uploadId });
    if (!upload) return;

    let hasFailures = false;

    for (const item of upload.items) {
      if (item.status !== "queued") continue;

      try {
        if (!item.programaId) {
          throw new Error("programaId no asignado");
        }

        const programaNombre = item.programaNombre || this.getProgramName(item.programaId);
        if (!programaNombre) {
          throw new Error(`programaId inválido: ${item.programaId}`);
        }

        item.programaNombre = programaNombre;
        item.status = "processing";
        await upload.save();

        await s3Service.waitForObject(item.s3Key);
        const { jobId, text } = await textractService.extractTextFromS3(item.s3Key);
        item.textractJobId = jobId;

        if (!text || text.trim().length < 50) {
          throw new Error("Texto extraído vacío o muy corto");
        }

        const textKey = this.getTextKey(uploadId, item.fileName);
        await s3Service.putTextObject(textKey, text);
        item.textS3Key = textKey;

        await pepRepository.upsert({
          programaId: item.programaId,
          programaNombre,
          resumen: "",
          rawText: text,
          fuente: "Textract",
        });

        item.status = "done";
        item.error = undefined;
        await upload.save();
      } catch (error) {
        hasFailures = true;
        item.status = "failed";
        item.error = (error as Error).message;
        await upload.save();
      }
    }

    upload.status = hasFailures ? "failed" : "completed";
    await upload.save();
  }
}

export const pepUploadService = new PepUploadService();