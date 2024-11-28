const fs = require('fs');
const path = require('path');

function traverseDirectory(dirPath, projectStructure = { name: 'root', children: [] }) {
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
        const filePath = path.join(dirPath, file);
        try {
            const stat = fs.statSync(filePath);

            // Check if the directory should be ignored
            if (stat.isDirectory()) {
                if (shouldIgnore(file)) {
                    console.log(`Ignoring directory: ${filePath}`);
                    return; // Skip this directory
                }

                const subDirStructure = { name: file, type: 'directory', children: [] };
                traverseDirectory(filePath, subDirStructure);
                projectStructure.children.push(subDirStructure);
            } else if (stat.isFile()) {
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const stringifiedContent = JSON.stringify(fileContent); // Stringify file content

                const fileType = getFileType(file);

                // Analyze the content based on the file type (optional)
                const contentDetails = analyzeFile(fileType, fileContent);

                projectStructure.children.push({
                    name: file,
                    type: 'file',
                    path: filePath,
                    contents: stringifiedContent // Store stringified content
                });
            }
        } catch (err) {
            console.error(`Error processing ${filePath}:`, err);
        }
    });

    return projectStructure;
}

// Function to determine the file type based on the file name
function getFileType(fileName) {
    const ext = path.extname(fileName).slice(1).toLowerCase();
    if (ext) {
        return ext;
    } else if (fileName.toLowerCase() === 'dockerfile') {
        return 'dockerfile';
    }
    return 'unknown'; // Default for unsupported types
}

// Function to analyze file content (optional)
function analyzeFile(fileType, content) {
    return {}; // Placeholder for potential analysis results
}

// Function to determine if a directory should be ignored
function shouldIgnore(dirName) {
    const ignoreList = ['node_modules', '.git', 'lib', 'dist'];
    return ignoreList.includes(dirName);
}

// Starting point
const repoDir = './temp-repo/selfhealjs';
const projectStructure = traverseDirectory(repoDir);
fs.writeFileSync('project_structure.json', JSON.stringify(projectStructure, null, 2));

console.log('Project structure written to project_structure.json');
