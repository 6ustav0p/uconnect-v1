import "dotenv/config";
import * as readline from "readline";
import { gptAgentService } from "./services";
import { ChatMessage } from "./types";

// Re-export for backward compatibility
export const runWorkflow = async (
  workflow: { input_as_text: string },
  options: { sessionId?: string; history?: ChatMessage[] } = {},
) => {
  return gptAgentService.processQuery(workflow.input_as_text, options);
};

// CLI entrypoint
async function main() {
  const args = process.argv.slice(2).join(" ");
  
  // Si hay argumentos, ejecutar modo single-query
  if (args.length > 0) {
    console.log("🤖 UConnect GPT Agent");
    console.log(`📝 Consulta: ${args}`);
    console.log("");
    
    try {
      const result = await runWorkflow({ input_as_text: args });
      
      console.log("💬 Respuesta:");
      console.log(result.response);
      console.log("");
      
      console.log("📄 Documentos Relevantes:");
      result.documents.forEach((doc, index) => {
        console.log(`  ${index + 1}. ${doc.filename} (score: ${doc.score.toFixed(4)})`);
      });
    } catch (error) {
      console.error("❌ Error:", error);
      process.exit(1);
    }
    return;
  }
  
  // Modo interactivo
  console.log("🤖 UConnect GPT Agent - Modo Interactivo");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Escribe tus preguntas y presiona Enter.");
  console.log("Escribe 'salir' o 'exit' para terminar.");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  const sessionId = `cli-${Date.now()}`;
  const history: ChatMessage[] = [];
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "💭 Tu pregunta: "
  });
  
  rl.prompt();
  
  rl.on("line", async (line) => {
    const query = line.trim();
    
    if (!query) {
      rl.prompt();
      return;
    }
    
    if (query.toLowerCase() === "salir" || query.toLowerCase() === "exit") {
      console.log("👋 ¡Hasta luego!");
      rl.close();
      process.exit(0);
    }
    
    try {
      console.log("");
      console.log("⏳ Procesando...");
      
      const result = await runWorkflow(
        { input_as_text: query },
        { sessionId, history },
      );
      history.push({ role: "user", content: query, timestamp: new Date() });
      history.push({
        role: "assistant",
        content: result.response,
        timestamp: new Date(),
      });
      
      console.log("");
      console.log("💬 Respuesta:");
      console.log(result.response);
      console.log("");
      
      if (result.documents.length > 0) {
        console.log("📄 Documentos consultados:");
        result.documents.slice(0, 3).forEach((doc, index) => {
          console.log(`  ${index + 1}. ${doc.filename} (relevancia: ${doc.score.toFixed(4)})`);
        });
      }
      
      console.log("");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    } catch (error) {
      console.error("❌ Error:", error instanceof Error ? error.message : error);
    }
    
    console.log("");
    rl.prompt();
  });
  
  rl.on("close", () => {
    console.log("👋 ¡Hasta luego!");
    process.exit(0);
  });
}

// Run if executed directly
if (require.main === module) {
  main();
}
