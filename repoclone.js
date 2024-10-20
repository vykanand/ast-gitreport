const { exec } = require('child_process');
const fs = require('node:fs');
const path = require('node:path');

async function copyRepo(repoUrl, tempDir) {
    return new Promise((resolve, reject) => {
        const dirPath = path.resolve(tempDir);
        if (fs.existsSync(dirPath) && fs.readdirSync(dirPath).length > 0) {
            console.log('temp-repo directory exists and is not empty. Clearing contents...');
            fs.rmSync(dirPath, { recursive: true, force: true });
        }
        console.log(`Cloning repository from ${repoUrl}...`);
        exec(`git clone ${repoUrl} ${tempDir}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error cloning repository: ${stderr || stdout}`);
                reject(new Error(`Failed to clone repository: ${error.message}`));
            } else {
                console.log('Repository cloned successfully.');
                resolve(stdout);
            }
        });
    });
}

copyRepo('https://github.com/mohamedsamara/mern-ecommerce', './temp-repo/mohamedsamara');

module.exports = { copyRepo };
