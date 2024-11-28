function buildAIPrompt(projectStructure, analysisType = 'solid') {
    const systemInstructions = `You are a Technical Architect highly skilled in coding complex and large enterprise level projects in software architecture, design patterns and principles. Your role is to analyze project structures critically and provide actionable insights.Dont give any code and just solid and design patterns subjective analysis`;

    let prompt = `${systemInstructions}\n\nAnalyze the following project structure and provide detailed insights on architecture, design patterns, and any best practice violations. Analyze this JSON project structure and analyse in depth and detailed analysis about each file and their related files and their respective classes and methods:\n\n${projectStructure}\n\n`;
    
    prompt += solidAnalysis;

    return prompt;
}

const solidAnalysis = `Please provide a detailed analysis based on the project context from the provided JSON. Address the following:
1. Identify any design pattern violations with exact file paths mentioned.
2. Point out any potential SOLID principle violations or language-specific convention issues. Explain why they are problematic with exact file paths mentioned.
3. Identify code smells or anti-patterns, mentioning them along with their file locations and potential refactoring strategies. Include the exact file path for each suggestion making sure not to give any input prompt text in your final response.Also do not give any code, all suggestions should be text based.`;

const apiAnalysis = `Identify all API endpoints in this project. Document their HTTP methods and request bodies, ensuring to cover all endpoints comprehensively.`;

module.exports = { buildAIPrompt };
