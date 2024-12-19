const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');

// Define the path for repositories
const baseRepoPath = './temp-repo'; // Update to your base repo path

// Utility function to check if a directory is a valid git repository
async function isGitRepository(repoPath) {
    try {
        const git = simpleGit(repoPath);
        await git.status();
        return true;
    } catch (error) {
        console.error(`Error checking if ${repoPath} is a git repository:`, error);
        return false;
    }
}

// Utility function to list all repositories in the base path
async function listRepos(basePath) {
    try {
        const files = await fs.promises.readdir(basePath);
        return files.filter(file => fs.statSync(path.join(basePath, file)).isDirectory());
    } catch (error) {
        console.error('Error listing repos:', error);
        return [];
    }
}

// Get all branches in the repo (local and remote)
async function getBranches(git) {
    try {
        const branches = await git.branch();
        return branches.all;
    } catch (error) {
        console.error('Error retrieving branches:', error);
        return [];
    }
}

// Get commit history for a specific branch
async function getCommitHistory(git, branch) {
    try {
        const log = await git.log([branch]);
        return log.all;
    } catch (error) {
        console.error(`Error retrieving commit history for branch ${branch}:`, error);
        return [];
    }
}

// Calculate the time difference (in hours and minutes) between two commits
function calculateTimeDifference(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Ensure start is before end (to avoid negative time)
    if (start > end) {
        console.error('Error: Start date is later than end date.', start, end);
        return null;
    }

    const diffInMilliseconds = end - start;
    const diffInMinutes = diffInMilliseconds / (1000 * 60); // Convert milliseconds to minutes
    const diffInHours = Math.floor(diffInMinutes / 60); // Full hours
    const remainingMinutes = Math.round(diffInMinutes % 60); // Remaining minutes

    return { hours: diffInHours, minutes: remainingMinutes };
}

// Generate the activity report for all repositories
async function generateReport() {
    try {
        const repos = await listRepos(baseRepoPath);

        for (const repo of repos) {
            const repoPath = path.join(baseRepoPath, repo);

            if (!(await isGitRepository(repoPath))) {
                console.log(`Skipping ${repo} as it is not a valid Git repository.`);
                continue;
            }

            const git = simpleGit(repoPath);
            console.log(`Processing repository: ${repo}`);

            const branches = await getBranches(git);
            const repoReport = {};

            for (const branch of branches) {
                console.log(`Processing branch: ${branch}`);

                const commits = await getCommitHistory(git, branch);
                if (commits.length === 0) {
                    console.log(`No commits found for branch: ${branch}`);
                    continue;
                }

                // Sort commits by date (to avoid time issues)
                const sortedCommits = commits.sort((a, b) => new Date(a.date) - new Date(b.date));

                // Group commits by author
                const commitsByAuthor = {};
                sortedCommits.forEach(commit => {
                    const author = commit.author_name;
                    if (!commitsByAuthor[author]) {
                        commitsByAuthor[author] = [];
                    }
                    commitsByAuthor[author].push(commit);
                });

                // Initialize report data for this branch
                const branchReport = {};

                // For each author, calculate the time between their commits
                for (const author in commitsByAuthor) {
                    const authorCommits = commitsByAuthor[author];
                    const commitDetails = [];

                    for (let i = 0; i < authorCommits.length; i++) {
                        const commit = authorCommits[i];
                        const commitDate = commit.date;
                        const message = commit.message;

                        let timeBetweenCommits = null;
                        if (i > 0) {
                            timeBetweenCommits = calculateTimeDifference(authorCommits[i - 1].date, commitDate);
                        }

                        commitDetails.push({
                            author,
                            commitDate,
                            message,
                            timeBetweenCommits,
                        });
                    }

                    branchReport[author] = commitDetails;
                }

                // Add branch report to the repo report
                repoReport[branch] = branchReport;
            }

            // Generate and save the HTML report for this repository
            generateHTMLReport(repo, repoReport);
        }
    } catch (error) {
        console.error('Error generating the report:', error);
    }
}

// Generate an HTML report for a specific repository and save it to a file
// Generate an HTML report for a specific repository and save it to a file
function generateHTMLReport(repo, repoData) {
    let htmlContent = `
    <html>
    <head>
        <title>Git Activity Report - ${repo}</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #333; }
            h2 { color: #555; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { padding: 8px 12px; border: 1px solid #ccc; }
            th { background-color: #f4f4f4; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .time { color: #ff6347; }
        </style>
    </head>
    <body>
        <h1>Git Activity Report - ${repo}</h1>
    `;

    for (const branch in repoData) {
        htmlContent += `
        <h2>Branch: ${branch}</h2>
        `;

        const branchReport = repoData[branch];
        for (const author in branchReport) {
            htmlContent += `
            <h3>Author: ${author}</h3>
            <table>
                <thead>
                    <tr>
                        <th>Commit Date</th>
                        <th>Commit Message</th>
                        <th>Time Between Commits</th>
                    </tr>
                </thead>
                <tbody>
            `;

            const authorCommits = branchReport[author];

            // Reverse the order of commits to display most recent first
            const reversedCommits = authorCommits.reverse();

            reversedCommits.forEach(commit => {
                const { commitDate, message, timeBetweenCommits } = commit;

                let timeBetweenDisplay = 'N/A';
                if (timeBetweenCommits) {
                    const { hours, minutes } = timeBetweenCommits;
                    timeBetweenDisplay = `${hours} hours, ${minutes} minutes`;
                }

                htmlContent += `
                <tr>
                    <td>${new Date(commitDate).toLocaleString()}</td>
                    <td>${message}</td>
                    <td class="time">${timeBetweenDisplay}</td>
                </tr>
                `;
            });

            htmlContent += `
                </tbody>
            </table>
            `;
        }
    }

    htmlContent += `
    </body>
    </html>
    `;

    // Write the HTML content to a file specific to the repository
    const outputPath = path.join(__dirname, `${repo}_author-reports.html`);
    fs.writeFileSync(outputPath, htmlContent);
    console.log(`HTML report for ${repo} generated at: ${outputPath}`);
}


// Run the report generation
generateReport();
