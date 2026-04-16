import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { config } from "../config";
import { logger } from "../utils";

type FileObject = OpenAI.FileObject;

const VECTOR_STORE_ID = config.openai.vectorStoreId;

export class GptVectorStoreService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: config.openai.apiKey });
  }

  /**
   * Uploads a file to OpenAI, adds it to the vector store, and polls until processing is complete.
   * @param fileBuffer The file content as a Buffer.
   * @param fileName The name of the file.
   * @returns The completed FileObject.
   */
  async uploadAndPoll(fileBuffer: Buffer, fileName: string): Promise<FileObject> {
    logger.info(`[VectorStore] Uploading file "${fileName}" to OpenAI.`);
    const uploadFile = await toFile(fileBuffer, fileName);
    const file = await this.client.files.create({
      file: uploadFile,
      purpose: "assistants",
    });
    logger.info(`[VectorStore] File uploaded with ID: ${file.id}. Adding to vector store.`);

    const vectorStoreFile = await this.client.vectorStores.files.create(VECTOR_STORE_ID, {
      file_id: file.id,
    });
    logger.info(`[VectorStore] File ${file.id} added to store. Polling for completion...`);

    // Poll for completion
    const pollInterval = 5000; // 5 seconds
    const maxAttempts = 24; // 2 minutes
    let attempts = 0;

    while (attempts < maxAttempts) {
      const updatedFile = await this.client.vectorStores.files.retrieve(
        VECTOR_STORE_ID,
        vectorStoreFile.id
      );

      if (updatedFile.status === "completed") {
        logger.info(`[VectorStore] File ${file.id} processing complete.`);
        // The file object from vector store files retrieve is different, so we get the main one
        return this.client.files.retrieve(file.id);
      }

      if (updatedFile.status === "failed") {
        const errorMessage = updatedFile.last_error?.message || "Unknown error";
        logger.error(`[VectorStore] File ${file.id} processing failed.`, { error: errorMessage });
        throw new Error(`File processing failed: ${errorMessage}`);
      }

      attempts++;
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`File processing timed out for file ID: ${file.id}`);
  }

  /**
   * Lists all files in the vector store.
   * @returns A list of FileObjects.
   */
  async listFiles(): Promise<FileObject[]> {
    logger.info(`[VectorStore] Listing files for store ID: ${VECTOR_STORE_ID}`);
    const vectorStoreFiles = await this.client.vectorStores.files.list(VECTOR_STORE_ID);
    
    // The list only contains minimal info, so we need to retrieve each file individually
    // to get full details like filename.
    const filePromises = vectorStoreFiles.data.map(vsFile => 
      this.client.files.retrieve(vsFile.id).catch(err => {
        logger.warn(`[VectorStore] Could not retrieve file ${vsFile.id}, it might have been deleted from OpenAI but not the store.`, err);
        return null;
      })
    );

    const files = await Promise.all(filePromises);
    return files.filter(file => file !== null) as FileObject[];
  }

  /**
   * Deletes a file from the vector store and from OpenAI.
   * @param fileId The ID of the file to delete.
   */
  async deleteFile(fileId: string): Promise<void> {
    logger.info(`[VectorStore] Deleting file ${fileId} from store ${VECTOR_STORE_ID}.`);
    try {
      await this.client.vectorStores.files.del(VECTOR_STORE_ID, fileId);
      logger.info(`[VectorStore] File ${fileId} detached from store. Deleting from OpenAI.`);
      await this.client.files.del(fileId);
      logger.info(`[VectorStore] File ${fileId} deleted successfully.`);
    } catch (error: any) {
      // If the file is already deleted from the store, it might throw an error.
      // We can still try to delete it from OpenAI files.
      if (error.status === 404) {
        logger.warn(`[VectorStore] File ${fileId} was not found in the vector store, attempting to delete from OpenAI files anyway.`);
        await this.client.files.del(fileId);
        logger.info(`[VectorStore] File ${fileId} deleted from OpenAI files.`);
        return;
      }
      logger.error(`[VectorStore] Error deleting file ${fileId}:`, error);
      throw error;
    }
  }
}

export const gptVectorStoreService = new GptVectorStoreService();
