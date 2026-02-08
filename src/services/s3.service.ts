import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config";
import { logger } from "../utils";

export class S3Service {
  private client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: config.aws.region,
      credentials: config.aws.accessKeyId && config.aws.secretAccessKey
        ? {
            accessKeyId: config.aws.accessKeyId,
            secretAccessKey: config.aws.secretAccessKey,
            sessionToken: config.aws.sessionToken || undefined,
          }
        : undefined,
    });
  }

  getBucket(): string {
    if (!config.aws.s3Bucket) {
      throw new Error("TEXTRACT_S3_BUCKET no configurado");
    }
    return config.aws.s3Bucket;
  }

  getPrefix(): string {
    return config.aws.s3Prefix || "pep-uploads";
  }

  async getPresignedPutUrl(
    s3Key: string,
    contentType: string,
    expiresInSeconds = 900,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.getBucket(),
      Key: s3Key,
      ContentType: contentType,
    });

    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async putTextObject(s3Key: string, text: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.getBucket(),
      Key: s3Key,
      ContentType: "text/plain; charset=utf-8",
      Body: text,
    });

    await this.client.send(command);
    logger.info("Texto guardado en S3", { s3Key });
  }

  async waitForObject(
    s3Key: string,
    maxAttempts = 10,
    delayMs = 1500,
  ): Promise<void> {
    const bucket = this.getBucket();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await this.client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: s3Key }),
        );
        return;
      } catch (error) {
        if (attempt === maxAttempts - 1) {
          throw new Error(
            `Objeto no encontrado en S3: ${bucket}/${s3Key}. Verifica que el upload haya finalizado.`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
}

export const s3Service = new S3Service();