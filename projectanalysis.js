const fs = require("node:fs");
const path = require("node:path");
const { processHtmlLLM } = require("./generatorAI");
const { buildAIPrompt } = require("./buildAIPrompt");

// Read project structure from JSON file
const projectStructure = fs.readFileSync("project_structure.json", "utf-8");

// Build the AI prompt using the loaded project structure
const aiPrompt = buildAIPrompt(projectStructure);
console.log(aiPrompt);

async function askLLM() {
  const combinedResponse = await processHtmlLLM(aiPrompt,'knegkw');
  console.log("LLM Response:\n", combinedResponse);
}
// Run LLM processing
askLLM();
