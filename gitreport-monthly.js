// node script.js 2024-08-01 2024-11-18 - custom date range
// node script.js 6 - for 6 months

const path = require('path');
const fs = require('fs');
const simpleGit = require('simple-git');

const folderToAnalyse = path.resolve(__dirname, './temp-repo');

// Function to list subdirectories in the base path
async function listSubdirectories(basePath) {
    try {
        const items = fs.readdirSync(basePath);
        return items.filter(item => {
            const itemPath = path.join(basePath, item);
            return fs.statSync(itemPath).isDirectory();
        });
    } catch (error) {
        console.error('Error listing subdirectories:', error);
        return [];
    }
}

// Function to generate stats report for a repository
async function generateStatsReport(repoPath, since, until) {
    const git = simpleGit(repoPath);
    const log = await git.raw(['log', '--pretty=format:%h|%ad|%an|%s', '--date=short', '--numstat', `--since=${since}`, `--until=${until}`]);

    const report = {};
    const lines = log.split('\n');
    let currentCommit = null;

    for (const line of lines) {
        if (line.includes('|')) {
            const [hash, date, author, message] = line.split('|');
            const month = date.slice(0, 7); // YYYY-MM

            currentCommit = { hash, date, author, message, month, additions: 0, deletions: 0 };

            if (!report[author]) {
                report[author] = {};
            }
            if (!report[author][month]) {
                report[author][month] = { commits: 0, additions: 0, deletions: 0, messages: [], impactfulCommit: null };
            }

            report[author][month].commits += 1;
            report[author][month].messages.push(message);
        } else if (currentCommit && line.trim() !== '') {
            const [additions, deletions] = line.split('\t').map(Number);
            if (!isNaN(additions) && !isNaN(deletions)) {
                currentCommit.additions += additions;
                currentCommit.deletions += deletions;
                report[currentCommit.author][currentCommit.month].additions += additions;
                report[currentCommit.author][currentCommit.month].deletions += deletions;

                // Track the most impactful commit
                if (!report[currentCommit.author][currentCommit.month].impactfulCommit ||
                    (additions + deletions > report[currentCommit.author][currentCommit.month].impactfulCommit.additions +
                        report[currentCommit.author][currentCommit.month].impactfulCommit.deletions)) {
                    report[currentCommit.author][currentCommit.month].impactfulCommit = {
                        message: currentCommit.message,
                        date: currentCommit.date,
                        additions: currentCommit.additions,
                        deletions: currentCommit.deletions,
                    };
                }
            }
        }
    }

    return report;
}

// Function to calculate the impact score based on additions and deletions
function calculateImpactScore(additions, deletions) {
    const netChange = additions - deletions;
    const totalChange = additions + deletions;

    if (totalChange === 0) {
        return 50; // Neutral score if no changes were made
    }

    const ratio = netChange / totalChange;
    return Math.min(Math.max((ratio + 1) * 50, 0), 100); // Score out of 100
}

// Function to calculate productivity based on additions, deletions, and commits
function calculateProductivity(additions, deletions, commits) {
    return commits === 0 ? 0 : (additions + deletions) / commits;
}

// Function to calculate performance metrics for a given report
function calculatePerformanceMetrics(report) {
    const metrics = {};

    for (const author in report) {
        metrics[author] = { totalCommits: 0, totalAdditions: 0, totalDeletions: 0, months: {} };

        for (const month in report[author]) {
            const monthData = report[author][month];
            metrics[author].totalCommits += monthData.commits;
            metrics[author].totalAdditions += monthData.additions;
            metrics[author].totalDeletions += monthData.deletions;

            metrics[author].months[month] = {
                commits: monthData.commits,
                additions: monthData.additions,
                deletions: monthData.deletions,
                impactfulCommit: monthData.impactfulCommit,
                impactScore: calculateImpactScore(monthData.additions, monthData.deletions),
                productivity: calculateProductivity(monthData.additions, monthData.deletions, monthData.commits)
            };
        }

        metrics[author].overallProductivity = calculateProductivity(metrics[author].totalAdditions, metrics[author].totalDeletions, metrics[author].totalCommits);
        metrics[author].overallImpactScore = calculateImpactScore(metrics[author].totalAdditions, metrics[author].totalDeletions);
    }

    return metrics;
}

// Function to get the best performers based on the ranking logic
function getBestPerformers(metrics, topN = 5) {
    const overallMetrics = Object.entries(metrics).map(([author, data]) => {
        const combinedScore = (data.overallImpactScore + data.overallProductivity) / 2;
        return {
            author,
            totalCommits: data.totalCommits,
            totalAdditions: data.totalAdditions,
            totalDeletions: data.totalDeletions,
            overallImpactScore: data.overallImpactScore,
            overallProductivity: data.overallProductivity,
            combinedScore: combinedScore,
            impactfulCommit: Object.values(data.months).reduce((best, month) => {
                if (month.impactfulCommit) {
                    return (!best || month.impactfulCommit.additions + month.impactfulCommit.deletions >
                        best.additions + best.deletions) ? month.impactfulCommit : best;
                }
                return best;
            }, null)
        };
    });

    // Sort by total additions + deletions, then by combined score
    return overallMetrics
        .sort((a, b) => (b.totalAdditions + b.totalDeletions) - (a.totalAdditions + a.totalDeletions) || b.combinedScore - a.combinedScore)
        .slice(0, topN);  // Return top N performers
}

// Function to get the current date range or accept a custom range
function getDateRange(monthsBack = 3) {
    const now = new Date();
    const start = new Date(now);
    start.setMonth(now.getMonth() - monthsBack);

    const end = new Date(now); // End date is today

    const startDate = start.toISOString().split('T')[0];
    const endDate = end.toISOString().split('T')[0];

    return {
        since: startDate,
        until: endDate,
        monthRange: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')} to ${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`
    };
}

// Function to parse date range arguments from the command line
function parseDateArguments() {
    const args = process.argv.slice(2); // Get arguments
    let monthsBack = 3; // Default to last 3 months

    if (args.length === 2) {
        return {
            since: args[0],
            until: args[1],
            monthRange: `${args[0]} to ${args[1]}`
        };
    }

    if (args.length === 1 && !isNaN(args[0])) {
        monthsBack = parseInt(args[0], 10); // Allow passing months back as argument
    }

    return getDateRange(monthsBack); // Default range of 3 months
}

// Function to generate the HTML report
async function generateHTMLReport(repoMetrics, monthRange) {
    let html = `<html><head><title>Team Performance Report - ${monthRange}</title></head><body>`;
    html += `<h1>Team Performance Report (${monthRange})</h1>`;

    for (const repo in repoMetrics) {
        html += `<h2>Project: ${repo}</h2>`; // Project name

        const metrics = repoMetrics[repo];
        html += `<h3>Metrics</h3>`;
        html += `<table border="1"><tr>
            <th>Author</th>
            <th>Total Commits</th>
            <th>Total Additions</th>
            <th>Total Deletions</th>
            <th>Overall Impact Score</th>
            <th>Overall Productivity</th>
            <th>Combined Score</th>
        </tr>`;

        for (const author in metrics) {
            const data = metrics[author];
            const combinedScore = (data.overallImpactScore + data.overallProductivity) / 2;
            html += `<tr>
                <td>${author}</td>
                <td>${data.totalCommits}</td>
                <td>${data.totalAdditions}</td>
                <td>${data.totalDeletions}</td>
                <td>${data.overallImpactScore.toFixed(2)}</td>
                <td>${data.overallProductivity.toFixed(2)}</td>
                <td>${combinedScore.toFixed(2)}</td>
            </tr>`;
        }

        html += `</table>`;
        html += `<h3>Best Performers</h3>`;
        const bestPerformers = getBestPerformers(metrics);
        html += `<table border="1"><tr>
            <th>Author</th>
            <th>Total Commits</th>
            <th>Total Additions</th>
            <th>Total Deletions</th>
            <th>Overall Impact Score</th>
            <th>Overall Productivity</th>
            <th>Combined Score</th>
            <th>Most Impactful Commit</th>
            <th>Date</th>
            <th>Additions</th>
            <th>Deletions</th>
        </tr>`;

        bestPerformers.forEach(p => {
            html += `<tr style="background-color: ${p.combinedScore === bestPerformers[0].combinedScore ? 'lightgreen' : 'white'}">
                <td>${p.author}</td>
                <td>${p.totalCommits}</td>
                <td>${p.totalAdditions}</td>
                <td>${p.totalDeletions}</td>
                <td>${p.overallImpactScore.toFixed(2)}</td>
                <td>${p.overallProductivity.toFixed(2)}</td>
                <td>${p.combinedScore.toFixed(2)}</td>`;
            if (p.impactfulCommit) {
                html += `<td>${p.impactfulCommit.message}</td>
                         <td>${p.impactfulCommit.date}</td>
                         <td>${p.impactfulCommit.additions}</td>
                         <td>${p.impactfulCommit.deletions}</td>`;
            } else {
                html += `<td colspan="4">N/A</td>`;
            }
            html += `</tr>`;
        });

        html += `</table>`;
        html += `<hr>`; // Add a horizontal rule to separate projects
    }

    html += `</body></html>`;

    const filePath = path.join(__dirname, `multirepo-report.html`);
    fs.writeFileSync(filePath, html);
    console.log(`HTML report generated for all repositories at ${filePath}`);
}

// Main function to process the repositories and generate the report
async function main() {
    try {
        const { since, until, monthRange } = parseDateArguments();
        console.log(`Analyzing contributions from ${since} to ${until}`);

        const repoPaths = await listSubdirectories(folderToAnalyse);
        
        if (repoPaths.length === 0) {
            console.log('No repositories found.');
            return;
        }

        const allRepoMetrics = {}; // Collect metrics for all repos

        for (const repo of repoPaths) {
            const selectedRepoPath = path.join(folderToAnalyse, repo);
            console.log(`Analyzing repository: ${repo}`);
            const report = await generateStatsReport(selectedRepoPath, since, until);
            
            if (Object.keys(report).length === 0) {
                console.log(`No data found for repository: ${repo}`);
                continue;
            }

            console.log('Calculating metrics...');
            const metrics = calculatePerformanceMetrics(report);
            allRepoMetrics[repo] = metrics; // Store metrics for this repo
        }

        // Generate the report after processing all repositories
        console.log('Generating HTML report for all repositories...');
        await generateHTMLReport(allRepoMetrics, monthRange);
        
        console.log('All reports generated successfully.');
    } catch (error) {
        console.error('Error generating report:', error);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
    }
}

main();
