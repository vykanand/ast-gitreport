const path = require('path');
const fs = require('fs');
const simpleGit = require('simple-git');

const folderToAnalyse = path.resolve(__dirname, '/home/niveus/development');

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
                report[author][month] = { commits: 0, additions: 0, deletions: 0, messages: [] };
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
            }
        }
    }

    return report;
}

function calculateImpactScore(additions, deletions) {
    const netChange = additions - deletions;
    const totalChange = additions + deletions;
    
    if (totalChange === 0) {
        return 50; // Neutral score if no changes were made
    }
    
    const ratio = netChange / totalChange;
    return Math.min(Math.max((ratio + 1) * 50, 0), 100); // Score out of 100
}

function calculateProductivity(additions, deletions, commits) {
    return commits === 0 ? 0 : (additions + deletions) / commits;
}

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
                impactScore: calculateImpactScore(monthData.additions, monthData.deletions),
                productivity: calculateProductivity(monthData.additions, monthData.deletions, monthData.commits)
            };
        }

        metrics[author].overallProductivity = calculateProductivity(metrics[author].totalAdditions, metrics[author].totalDeletions, metrics[author].totalCommits);
        metrics[author].overallImpactScore = calculateImpactScore(metrics[author].totalAdditions, metrics[author].totalDeletions);
    }

    return metrics;
}

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
            combinedScore: combinedScore
        };
    });

    return overallMetrics.sort((a, b) => b.combinedScore - a.combinedScore).slice(0, topN);
}

function generateHTMLReport(repoMetrics, monthYear) {
    let html = `<html><head><title>Git Contribution Report - ${monthYear}</title></head><body>`;
    html += `<h1>Git Contribution Report (${monthYear})</h1>`;

    for (const repo in repoMetrics) {
        html += `==========================================`
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
        </tr>`;

        bestPerformers.forEach(p => {
            html += `<tr>
                <td>${p.author}</td>
                <td>${p.totalCommits}</td>
                <td>${p.totalAdditions}</td>
                <td>${p.totalDeletions}</td>
                <td>${p.overallImpactScore.toFixed(2)}</td>
                <td>${p.overallProductivity.toFixed(2)}</td>
                <td>${p.combinedScore.toFixed(2)}</td>
            </tr>`;
        });

        html += `</table>`;
        html += `<hr>`; // Add a horizontal rule to separate projects
    }

    html += `</body></html>`;

    const filePath = path.join(__dirname, `multirepo-report.html`);
    fs.writeFileSync(filePath, html);
    console.log(`HTML report generated for all repositories at ${filePath}`);
}

function getCurrentMonthRange() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0); // Last day of the month
    return {
        since: start.toISOString().split('T')[0],
        until: end.toISOString().split('T')[0],
        monthYear: `${year}-${String(month + 1).padStart(2, '0')}` // Format as YYYY-MM
    };
}

async function main() {
    try {
        const { since, until, monthYear } = getCurrentMonthRange();
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
        generateHTMLReport(allRepoMetrics, monthYear);
        
        console.log('All reports generated successfully.');
    } catch (error) {
        console.error('Error generating report:', error);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
    }
}

main();
