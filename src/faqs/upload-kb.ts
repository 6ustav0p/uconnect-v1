import { ADMISSION_FAQ } from "../config/admission-faq";
import { gptVectorStoreService } from "../services";
import { logger } from "../utils";

const FAQ_KB_KIND = "faq_kb";

async function main(): Promise<void> {
  try {
    const kb = {
      featured: ADMISSION_FAQ.featured,
      faq: ADMISSION_FAQ.faq,
      archive: ADMISSION_FAQ.archive,
    };

    const fileBuffer = Buffer.from(JSON.stringify(kb, null, 2), "utf-8");

    logger.info("Subiendo FAQ KB al Vector Store...", {
      kind: FAQ_KB_KIND,
      bytes: fileBuffer.length,
      total:
        ADMISSION_FAQ.featured.length +
        ADMISSION_FAQ.faq.length +
        ADMISSION_FAQ.archive.length,
    });

    await gptVectorStoreService.uploadAndPoll(
      fileBuffer,
      "uconnect-faq-kb.json",
      { attributes: { kind: FAQ_KB_KIND } },
    );

    const vectorFiles = await gptVectorStoreService.listVectorStoreFiles();

    const latest = vectorFiles
      .filter((f) => f.status === "completed")
      .filter((f) => (f.attributes as any)?.kind === FAQ_KB_KIND)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];

    logger.info("FAQ KB subido.", {
      vectorStoreFileId: latest?.id,
      createdAt: latest?.createdAt,
    });
  } catch (error) {
    logger.error("Error subiendo FAQ KB", {
      error: (error as Error).message,
    });
    process.exitCode = 1;
  }
}

main();
