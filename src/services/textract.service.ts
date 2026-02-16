import {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
  Block,
} from "@aws-sdk/client-textract";
import { config } from "../config";
import { logger } from "../utils";
import { s3Service } from "./s3.service";

export class TextractService {
  private client: TextractClient;

  constructor() {
    this.client = new TextractClient({
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

  async startTextDetection(s3Key: string): Promise<string> {
    const bucket = s3Service.getBucket();
    const command = new StartDocumentTextDetectionCommand({
      DocumentLocation: {
        S3Object: {
          Bucket: bucket,
          Name: s3Key,
        },
      },
    });

    const response = await this.client.send(command);

    if (!response.JobId) {
      throw new Error("Textract no devolvió JobId");
    }

    return response.JobId;
  }

  async waitForJob(jobId: string, maxAttempts = 120, delayMs = 5000): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const command = new GetDocumentTextDetectionCommand({ JobId: jobId });
      const response = await this.client.send(command);

      const status = response.JobStatus;
      if (status === "SUCCEEDED" || status === "PARTIAL_SUCCESS") {
        return;
      }

      if (status === "FAILED") {
        throw new Error(`Textract falló para JobId ${jobId}`);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error(`Timeout esperando Textract JobId ${jobId}`);
  }

  private extractLines(blocks: Block[]): string[] {
    return blocks
      .filter((b) => b.BlockType === "LINE" && b.Text)
      .map((b) => b.Text as string);
  }

  async getTextFromJob(jobId: string): Promise<string> {
    let nextToken: string | undefined = undefined;
    const lines: string[] = [];

    do {
      const command: GetDocumentTextDetectionCommand = new GetDocumentTextDetectionCommand({
        JobId: jobId,
        NextToken: nextToken,
      });
      const response: any = await this.client.send(command);

      if (response.Blocks && response.Blocks.length > 0) {
        lines.push(...this.extractLines(response.Blocks));
      }

      nextToken = response.NextToken;
    } while (nextToken);

    return lines.join("\n");
  }

  async extractTextFromS3(s3Key: string): Promise<{ jobId: string; text: string }> {
    logger.info("Iniciando Textract", { s3Key });
    const jobId = await this.startTextDetection(s3Key);
    await this.waitForJob(jobId);
    const text = await this.getTextFromJob(jobId);
    return { jobId, text };
  }
}

export const textractService = new TextractService();