import "dotenv/config";
import { OpenAI } from "openai";
import { Agent, AgentInputItem, Runner, withTrace } from "@openai/agents";
import * as readline from "readline";

// Shared client for guardrails and file search
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const uconnect = new Agent({
  name: "uconnect",
  instructions: `Eres un asistente universitario que SOLO responde basándose en el contenido de los documentos proporcionados.

REGLAS ESTRICTAS:
1. Solo usa información que esté explícitamente en el contexto de los documentos proporcionados
2. NO inventes, supongas o generalices información que no esté en los documentos
3. Si la información no está en los documentos, responde: "No encuentro esa información en los documentos disponibles"
4. Cita el documento cuando sea relevante
5. Sé preciso y específico con la información del documento

Tu objetivo es ayudar a estudiantes con información verificable de los documentos institucionales.`,
  model: "gpt-3.5-turbo",
  modelSettings: {
    temperature: 0.3,  // Temperatura baja para respuestas más precisas
    topP: 1,
    maxTokens: 2048,
    store: true
  }
});

type WorkflowInput = { input_as_text: string };

// Main code entrypoint
export const runWorkflow = async (workflow: WorkflowInput) => {
  return await withTrace("uconnect", async () => {
    // Primero buscar documentos relevantes
    const filesearchResult = await client.vectorStores.search("vs_69928e75718081919dfe62e295cf99bf", {
      query: workflow.input_as_text,
      max_num_results: 5
    });

    // Extraer el contenido de los documentos más relevantes
    const relevantDocs = filesearchResult.data.map((result, index) => {
      return `DOCUMENTO ${index + 1}: ${result.filename}\nContenido: ${result.content?.[0]?.text || "Sin contenido disponible"}\nRelevancia: ${result.score.toFixed(4)}`;
    }).join("\n\n");

    // Si no hay documentos relevantes
    if (filesearchResult.data.length === 0) {
      return {
        response: "No encontré documentos relevantes para tu consulta.",
        documents: []
      };
    }

    // Crear el prompt con el contexto de los documentos
    const contextualPrompt = `Contexto de los documentos:

${relevantDocs}

---

Pregunta del estudiante: ${workflow.input_as_text}

Responde SOLO basándote en la información del contexto anterior. Si la información no está en el contexto, dilo claramente.`;

    const conversationHistory: AgentInputItem[] = [
      { role: "user", content: [{ type: "input_text", text: contextualPrompt }] }
    ];
    
    const runner = new Runner({
      traceMetadata: {
        __trace_source__: "agent-builder",
        workflow_id: "wf_69928f96e3f48190ac51583f8aa818a00505cc1c2d447968"
      }
    });
    
    const uconnectResultTemp = await runner.run(
      uconnect,
      [
        ...conversationHistory
      ]
    );
    
    conversationHistory.push(...uconnectResultTemp.newItems.map((item) => item.rawItem));

    if (!uconnectResultTemp.finalOutput) {
        throw new Error("Agent result is undefined");
    }

    const documentsInfo = filesearchResult.data.map((result) => ({
      id: result.file_id,
      filename: result.filename,
      score: result.score,
    }));

    return {
      response: uconnectResultTemp.finalOutput ?? "",
      documents: documentsInfo
    };
  });
}

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
      
      const result = await runWorkflow({ input_as_text: query });
      
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
