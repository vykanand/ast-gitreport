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

// Get the development branch
async function getDevelopmentBranch(git) {
    try {
        const branches = await git.branch();
        return branches.all.includes('remotes/origin/development') ? 'remotes/origin/development' : null;
    } catch (error) {
        console.error('Error retrieving branches:', error);
        return null;
    }
}

// Get commit history for a specific branch
async function getCommitHistory(git, branch, startDate, endDate) {
    try {
        const log = await git.log([branch]);
        return log.all.filter(commit => {
            const commitDate = new Date(commit.date);
            return commitDate >= startDate && commitDate <= endDate;
        });
    } catch (error) {
        console.error(`Error retrieving commit history for branch ${branch}:`, error);
        return [];
    }
}

// Calculate the time difference (in hours and minutes) between two commit timestamps
function calculateTimeDifference(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Ensure start is before end (to avoid negative time)
    if (start > end) {
        console.error('Error: Start date is later than end date.', start, end);
        return null;
    }

    const diffInMilliseconds = end - start; // Difference in milliseconds
    if (diffInMilliseconds <= 0) return { hours: 0, minutes: 0 }; // If no time difference

    const diffInMinutes = diffInMilliseconds / (1000 * 60); // Convert milliseconds to minutes
    const diffInHours = Math.floor(diffInMinutes / 60); // Full hours
    const remainingMinutes = Math.round(diffInMinutes % 60); // Remaining minutes

    return { hours: diffInHours, minutes: remainingMinutes };
}

// Format a Date object as dd/mm/yyyy hh:mm AM/PM
function formatDateTime(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    // Determine AM or PM
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12; // Convert to 12-hour format
    hours = hours ? hours : 12; // Handle 0 hours as 12 (midnight)
    const formattedHours = String(hours).padStart(2, '0');
    
    return `${day}/${month}/${year} ${formattedHours}:${minutes} ${ampm}`;
}

// Generate the report
async function generateReport(weeksAgo = 2) {
    try {
        const endDate = new Date(); // End date is today
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - weeksAgo * 7); // Subtract the number of weeks from today

        console.log(`Generating report for the last ${weeksAgo} week(s) from ${formatDateTime(startDate)} to ${formatDateTime(endDate)}`);

        const repos = await listRepos(baseRepoPath);
        const authorReports = {}; // To store author-wise commit details

        for (const repo of repos) {
            const repoPath = path.join(baseRepoPath, repo);

            if (!(await isGitRepository(repoPath))) {
                console.log(`Skipping ${repo} as it is not a valid Git repository.`);
                continue;
            }

            const git = simpleGit(repoPath);
            console.log(`Processing repository: ${repo}`);

            // Get the development branch
            const developmentBranch = await getDevelopmentBranch(git);
            if (!developmentBranch) {
                console.log(`Skipping ${repo} as the development branch is not found.`);
                continue;
            }

            console.log(`Processing development branch: ${developmentBranch}`);

            const commits = await getCommitHistory(git, developmentBranch, startDate, endDate);
            if (commits.length === 0) {
                console.log(`No commits found for branch ${developmentBranch} within the specified date range.`);
                continue;
            }

            // Sort commits by date in ascending order (oldest to newest)
            const sortedCommits = commits.sort((a, b) => new Date(a.date) - new Date(b.date));

            // Group commits by author and commit ID to avoid duplicates
            const commitsByAuthor = {};
            const seenCommitHashes = new Set(); // Track commit hashes to avoid duplicates

            sortedCommits.forEach(commit => {
                const author = commit.author_name;
                const commitHash = commit.hash;

                // Skip duplicates based on commit hash
                if (seenCommitHashes.has(commitHash)) {
                    return; // Skip this commit if we've already seen it
                }

                seenCommitHashes.add(commitHash);

                if (!commitsByAuthor[author]) {
                    commitsByAuthor[author] = [];
                }

                commitsByAuthor[author].push(commit);
            });

            // For each author, calculate the time between their commits
            for (const author in commitsByAuthor) {
                const authorCommits = commitsByAuthor[author];
                if (!authorReports[author]) {
                    authorReports[author] = {
                        totalCommits: 0,
                        totalTimeMinutes: 0,
                        commits: []
                    };
                }

                let totalTimeForAuthor = 0;
                let previousCommit = null;

                authorCommits.forEach(commit => {
                    const commitDate = commit.date;
                    const message = commit.message;

                    // Check if the commit is a merge commit (has more than one parent)
                    const isMergeCommit = commit.parents && commit.parents.length > 1;

                    let timeBetweenCommits = null;
                    if (!isMergeCommit && previousCommit) {
                        timeBetweenCommits = calculateTimeDifference(previousCommit.date, commitDate);
                        totalTimeForAuthor += (timeBetweenCommits.hours * 60) + timeBetweenCommits.minutes;
                    }

                    authorReports[author].commits.push({
                        commitDate,
                        repo,
                        branch: developmentBranch,
                        message,
                        timeBetweenCommits,
                        isMergeCommit
                    });

                    // If it's not a merge, update the previous commit
                    if (!isMergeCommit) {
                        previousCommit = commit;
                    }
                });

                authorReports[author].totalCommits += authorCommits.length;
                authorReports[author].totalTimeMinutes += totalTimeForAuthor;
            }
        }

        // Generate and save the HTML report
        generateHTMLReport(authorReports);

    } catch (error) {
        console.error('Error generating the report:', error);
    }
}

// Generate an HTML report for author-wise commits and time
function generateHTMLReport(authorReports) {
    let htmlContent = `
    <html>
    <head>
        <title>Git Activity Report - Author-wise</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #333; }
            h2 { color: #555; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { padding: 8px 12px; border: 1px solid #ccc; }
            th { background-color: #f4f4f4; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .time { color: #ff6347; }
            .merge { color: #1e90ff; font-weight: bold; }
        </style>
    </head>
    <body>
        <h1>Git Activity Report - Author-wise</h1>
    `;

    // Create a report for each author
    for (const author in authorReports) {
        const authorData = authorReports[author];

        htmlContent += `
        <h2>Author: ${author} (Total Commits: ${authorData.totalCommits}, Total Time: ${formatTime(authorData.totalTimeMinutes)})</h2>
        <table>
            <thead>
                <tr>
                    <th>Commit Date</th>
                    <th>Repository</th>
                    <th>Branch</th>
                    <th>Commit Message</th>
                    <th>Time Between Commits</th>
                </tr>
            </thead>
            <tbody>
        `;

        authorData.commits.forEach(commit => {
            const time = commit.timeBetweenCommits ? `${commit.timeBetweenCommits.hours} hours, ${commit.timeBetweenCommits.minutes} minutes` : 'N/A';
            const commitDate = new Date(commit.commitDate);
            const formattedDate = formatDateTime(commitDate);
            const messageClass = commit.isMergeCommit ? 'merge' : '';
            const timeClass = commit.timeBetweenCommits ? 'time' : '';

            htmlContent += `
            <tr>
                <td>${formattedDate}</td>
                <td>${commit.repo}</td>
                <td>${commit.branch}</td>
                <td class="${messageClass}">${commit.message}</td>
                <td class="${timeClass}">${time}</td>
            </tr>
            `;
        });

        htmlContent += `
            </tbody>
        </table>
        `;
    }

    htmlContent += `
    </body>
    </html>
    `;

    // Save the HTML report to a file
    fs.promises.writeFile('branch_activity_report.html', htmlContent, 'utf8')
        .then(() => {
            console.log('HTML report generated successfully!');
        })
        .catch((error) => {
            console.error('Error saving HTML report:', error);
        });
}

// Format time from total minutes to "X hours, Y minutes"
function formatTime(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours} hours, ${minutes} minutes`;
}

// Run the report generation (default: last 2 weeks)
generateReport(2);
