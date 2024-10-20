const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const { processHtmlLLM } = require('./generatorAI'); // Import processHtmlLLM
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
});

const chunkSize = 10000; // Adjust as needed


async function parseJS(filePath) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const ast = [];
        for (let i = 0; i < fileContent.length; i += chunkSize) {
            const chunk = fileContent.substring(i, i + chunkSize);
            try {
                ast.push(parser.parse(chunk, { sourceType: 'module' }));
            } catch (error) {
                return { filePath, error };
            }
        }
        return { filePath, ast };
    } catch (error) {
        return { filePath, error };
    }
}

async function processRepo(selectedDirs) {
    const jsFiles = [];
    for (const dir of selectedDirs) {
        function traverse(dirToTraverse) {
            fs.readdirSync(dirToTraverse).forEach(file => {
                const fullPath = path.join(dirToTraverse, file);
                if (fs.statSync(fullPath).isDirectory()) {
                    traverse(fullPath);
                } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
                    jsFiles.push(fullPath);
                }
            });
        }
        traverse(path.join(tempDir, dir));
    }

    const results = await Promise.all(jsFiles.map(parseJS));
    const successfulParses = results.filter(result => result.ast);
    const failedParses = results.filter(result => result.error);

    console.log('Successfully parsed files:');
    successfulParses.forEach(result => console.log(result.filePath));

    console.log('\nFailed to parse files:');
    failedParses.forEach(result => console.log(`${result.filePath}: ${result.error.message}`));

    const allCode = successfulParses.map(result => {
        return result.ast.map(ast => JSON.stringify(ast)).join('\n');
    }).join('\n');

    const initialSummary = await processHtmlLLM(allCode);
    console.log("\nInitial Summary:\n", initialSummary);

    const refactorQuestion = `Refactor the code according to SOLID principles. Find design pattern implementations and list all files and folders with recommendations.`;
    const refactorSummary = await processHtmlLLM(refactorQuestion);
    console.log("\nRefactor Summary:\n", refactorSummary);

    readline.question('Ask another question? (y/n): ', async (answer) => {
        if (answer.toLowerCase() === 'y') {
            readline.question('Enter your question: ', async (question) => {
                const response = await processHtmlLLM(question);
                console.log('\nResponse:', response);
                readline.close();
            });
        } else {
            readline.close();
        }
    });
}

function getDirectories(dirPath) {
    return fs.readdirSync(dirPath).filter(file => fs.statSync(path.join(dirPath, file)).isDirectory());
}

async function main() {

    if (!fs.existsSync(tempDir)) {
        console.error("No repository found. Clone the repository first.");
        return;
    }

    // Get directories within the cloned repo
    const directories = getDirectories(tempDir);
    if (directories.length === 0) {
        console.error("No directories found in the repository.");
        return;
    }

    console.log("Select directories to analyze (enter numbers separated by commas):");
    directories.forEach((dir, index) => console.log(`${index + 1}. ${dir}`));

    readline.question('Enter your choice: ', async (choice) => {
        const selectedIndices = choice.split(',').map(s => parseInt(s.trim()) - 1).filter(i => i >= 0 && i < directories.length);
        const selectedDirs = selectedIndices.map(i => directories[i]);
        if (selectedDirs.length > 0) {
            await processRepo(selectedDirs);
        } else {
            console.error("Invalid choice.");
        }
    });
}

main();
