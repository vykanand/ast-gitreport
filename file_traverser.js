const fs = require('node:fs');
const path = require('node:path');
const { processHtmlLLM } = require('./generatorAI');
const readline = require('readline');

function traverseDirectory(dirPath, ignoreFolders = ['node_modules', '.git', 'dist', 'lib', 'build'], basePath = '', processedFiles = []) {
    let projectStructure = {
        name: path.basename(dirPath),
        type: 'directory',
        path: path.join(basePath, path.basename(dirPath)),
        children: []
    };

    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const relativePath = path.join(basePath, file);
        try {
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                if (!ignoreFolders.includes(file)) {
                    // console.log(`Traversing directory: ${filePath}`);
                    const subDir = traverseDirectory(filePath, ignoreFolders, relativePath, processedFiles);
                    projectStructure.children.push(subDir);
                }
            } else if (stat.isFile()) {
                // console.log(`Traversed file: ${filePath}`);
                processedFiles.push(relativePath);
                const fileInfo = {
                    name: file,
                    type: 'file',
                    path: relativePath,
                    content: extractFileContent(filePath)
                };
                projectStructure.children.push(fileInfo);
            }
        } catch (err) {
            console.error(`Error reading file ${filePath}: ${err}`);
        }
    });

    return projectStructure;
}

function extractFileContent(filePath) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        return extractCodeElements(fileContent, path.extname(filePath).toLowerCase());
    } catch (err) {
        console.error(`Error processing file ${filePath}: ${err}`);
        return '';
    }
}

function extractCodeElements(fileContent, fileExtension) {
    const codeElements = [];
    let regex;

    switch (fileExtension) {
        case '.py':
            regex = /(?:class|def)\s+(\w+)(?:\((.*?)\))?:/g;
            break;
        case '.js':
        case '.ts':
            regex = /(?:class|function)\s+(\w+)|\s*(\w+)\s*[:=]\s*(?:function|\(.*?\)\s*=>)/g;
            break;
        case '.java':
        case '.kt':
            regex = /(?:class|interface|enum)\s+(\w+)|(?:public|private|protected)?\s+(?:static\s+)?(?:\w+\s+)+(\w+)\s*\(/g;
            break;
        case '.rb':
            regex = /(?:class|module|def)\s+(\w+)/g;
            break;
        case '.go':
            regex = /(?:func|type)\s+(\w+)/g;
            break;
        case '.php':
            regex = /(?:class|function)\s+(\w+)/g;
            break;
        default:
            return fileContent.substring(0, 500) + (fileContent.length > 500 ? '...' : '');
    }

    let match;
    while ((match = regex.exec(fileContent)) !== null) {
        codeElements.push({
            type: match[0].trim().startsWith('class') ? 'class' : 'function',
            name: match[1] || match[2]
        });
    }

    return codeElements;
}

function buildFolderTree(processedFiles) {
    const root = { name: 'root', children: {} };

    processedFiles.forEach(file => {
        const parts = file.split(path.sep);
        let currentLevel = root;

        parts.forEach(part => {
            if (!currentLevel.children[part]) {
                currentLevel.children[part] = { name: part, children: {} };
            }
            currentLevel = currentLevel.children[part];
        });
    });

    return root;
}

function printFolderTree(node, prefix = '') {
    let result = '';
    const childrenKeys = Object.keys(node.children);
    childrenKeys.forEach((key, index) => {
        const child = node.children[key];
        const isLast = index === childrenKeys.length - 1;
        result += `${prefix}${isLast ? '└── ' : '├── '}${child.name}\n`;
        result += printFolderTree(child, `${prefix}${isLast ? '    ' : '│   '}`);
    });
    return result;
}

function buildAIPrompt(projectStructure, processedFiles, folderTree) {
    let prompt = `Analyze this project structure and provide insights on the architecture, design patterns, and potential best practice violations. Include file locations for all observations and suggestions:\n\n`;

    prompt += `Folder Structure:\n${folderTree}\n\n`;

    function addToPrompt(node, depth = 0) {
        const indent = '  '.repeat(depth);
        prompt += `${indent}${node.name} (${node.type}) - ${node.path}\n`;

        if (node.type === 'file' && node.content) {
            if (Array.isArray(node.content)) {
                node.content.forEach(element => {
                    prompt += `${indent}  ${element.type}: ${element.name}\n`;
                });
            } else {
                prompt += `${indent}  Content: ${node.content}\n`;
            }
        }

        if (node.children) {
            node.children.forEach(child => addToPrompt(child, depth + 1));
        }
    }

    addToPrompt(projectStructure);

    prompt += `\nBased on this project structure and the code elements provided, please:\n`;
    prompt += `1. Identify and explain any design patterns used in the project. For each pattern, specify the file location(s) where it is implemented.\n`;
    prompt += `2. Point out any potential SOLID principle violations of best practices or language-specific conventions, explaining why they are problematic and how they could be improved. Always include the exact file path for each violation.\n`;
    prompt += `3. Discuss the overall code organization and file structure, suggesting any improvements that could enhance maintainability and scalability. Provide specific file paths or directory structures for your suggestions.\n`;
    prompt += `4. If you identify any code smells or anti-patterns, mention them along with their file locations and potential refactoring strategies.\n`;
    prompt += `\nFor all observations and suggestions, please include the relevant file paths to ensure clear and actionable feedback.\n`;

    return prompt;
}

// Set up readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Function to write project structure to file
function writeProjectStructureToFile(projectStructure) {
    try {
        const projectStructureJson = JSON.stringify(projectStructure, null, 2);
        fs.writeFileSync('project_structure.json', projectStructureJson);
        console.log('Project structure written to project_structure.json');
    } catch (err) {
        console.error('Error writing project structure to file:', err);
    }
}

// Function to read project structure from file
function readProjectStructureFromFile() {
    try {
        const projectStructureJson = fs.readFileSync('project_structure.json', 'utf-8');
        return JSON.parse(projectStructureJson);
    } catch (err) {
        console.error('Error reading project structure from file:', err);
        return null;
    }
}

// Function to ask the user questions, including project structure context
async function askUserQuestions() {
    const projectStructure = readProjectStructureFromFile();
    if (!projectStructure) {
        console.error('Could not read project structure from file.');
        return;
    }

    while (true) {
        const question = await new Promise((resolve) => {
            rl.question('Ask a question or type "exit" to quit: ', resolve);
        });

        if (question.toLowerCase() === 'exit') {
            console.log('Exiting...');
            rl.close();
            break;
        }

        // Include projectStructure in the question context
        const questionWithContext = { question, projectStructure };

        // Process the question using your LLM function or another logic
        const response = await processHtmlLLM(JSON.stringify(questionWithContext));
        // console.log('Response:\n', response);
    }
}

// Main logic to analyze the project structure
const repoDir = './temp-repo/mohamedsamara';
const processedFiles = [];
const projectStructure = traverseDirectory(repoDir, ['node_modules', '.git', 'dist', 'lib'], '', processedFiles);
writeProjectStructureToFile(projectStructure); // Write to file
const folderTreeRoot = buildFolderTree(processedFiles);
const folderTreeString = printFolderTree(folderTreeRoot);
const aiPrompt = buildAIPrompt(projectStructure, processedFiles, folderTreeString);

console.log("AI Prompt generated. Length:", aiPrompt.length);
console.log("Folder Tree:");
console.log(folderTreeString);

async function askLLM() {
    const combinedResponse = await processHtmlLLM(aiPrompt);
    console.log('LLM Response:\n', combinedResponse);
    
    // After analysis, allow for user questions
    // await askUserQuestions(); // Call here, after LLM response
}

// Run initial analysis
askLLM();
