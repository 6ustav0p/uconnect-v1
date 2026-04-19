import { ADMISSION_FAQ } from "../config/admission-faq";
import { database, faqRepository } from "../services";
import { logger } from "../utils";

type Tier = "featured" | "faq" | "archive";

async function seedTier(tier: Tier): Promise<number> {
  const items = ADMISSION_FAQ[tier];
  let processed = 0;

  for (const item of items) {
    await faqRepository.upsert({
      id: item.id,
      questions: [item.question],
      answer: item.answer,
      category: item.category,
      tier,
      isActive: true,
    });
    processed += 1;
  }

  return processed;
}

async function main(): Promise<void> {
  try {
    await database.connect();

    const [featured, faq, archive] = await Promise.all([
      seedTier("featured"),
      seedTier("faq"),
      seedTier("archive"),
    ]);

    logger.info("FAQ seed completado", {
      featured,
      faq,
      archive,
      total: featured + faq + archive,
    });
  } catch (error) {
    logger.error("Error ejecutando seed de FAQs", {
      error: (error as Error).message,
    });
    process.exitCode = 1;
  } finally {
    await database.disconnect();
  }
}

main();
