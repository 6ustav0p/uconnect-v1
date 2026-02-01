import { chatbot } from "./chatbot";
import { logger } from "./utils";
import * as readline from "readline";

/**
 * CLI de prueba para el chatbot
 */
async function main(): Promise<void> {
  console.log("\n🎓 ========================================");
  console.log("   UCONNECT - Universidad de Córdoba");
  console.log("   Chatbot de Admisiones");
  console.log("========================================\n");

  try {
    // Inicializar chatbot
    console.log("⏳ Inicializando chatbot...\n");
    await chatbot.initialize();

    // Generar sesión
    const sessionId = chatbot.createSession();
    console.log(`✅ Sesión iniciada: ${sessionId.slice(0, 8)}...\n`);

    // Mostrar estadísticas
    const stats = await chatbot.getStats();
    console.log("📊 Estadísticas del sistema:");
    console.log(`   - Facultades: ${stats.facultades}`);
    console.log(`   - Programas: ${stats.programas}`);
    console.log(`   - Programas con pensum: ${stats.programasConPensum}`);
    console.log(`   - Materias únicas: ${stats.materiasUnicas}`);
    console.log(`   - Chats activos: ${stats.chatsActivos}\n`);

    // Crear interfaz de lectura
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('💬 Escribe tu mensaje (o "salir" para terminar):\n');

    const askQuestion = (): void => {
      rl.question("Tú: ", async (input) => {
        const message = input.trim();

        if (!message) {
          askQuestion();
          return;
        }

        if (
          message.toLowerCase() === "salir" ||
          message.toLowerCase() === "exit"
        ) {
          console.log("\n👋 ¡Hasta luego!\n");
          rl.close();
          await chatbot.shutdown();
          process.exit(0);
          return;
        }

        try {
          const startTime = Date.now();
          const response = await chatbot.processMessage(sessionId, message);
          const duration = Date.now() - startTime;

          console.log(`\n🤖 UConnect: ${response.message}`);

          if (response.sources.length > 0) {
            console.log(`   📚 Fuentes: ${response.sources.join(", ")}`);
          }

          if (response.tokensUsed) {
            console.log(
              `   ⚡ Tokens: ${response.tokensUsed.input}↓ ${response.tokensUsed.output}↑ | ${duration}ms`,
            );
          }

          console.log("");
        } catch (error) {
          console.error(`\n❌ Error: ${(error as Error).message}\n`);
        }

        askQuestion();
      });
    };

    askQuestion();

    // Manejar cierre
    rl.on("close", async () => {
      await chatbot.shutdown();
    });
  } catch (error) {
    logger.error("Error fatal en el chatbot", {
      error: (error as Error).message,
    });
    console.error(
      "\n❌ Error inicializando el chatbot:",
      (error as Error).message,
    );
    process.exit(1);
  }
}

// Manejar señales de terminación
process.on("SIGINT", async () => {
  console.log("\n\n🛑 Cerrando chatbot...");
  await chatbot.shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await chatbot.shutdown();
  process.exit(0);
});

// Ejecutar
main().catch(console.error);
