const path = require('path');
const fs = require('fs');
const { prompt } = require('enquirer');
const simpleGit = require('simple-git');

const baseFolderPath = path.resolve(__dirname, './analysis/');

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
    
    // Calculate the ratio and convert it to a score out of 100
    const ratio = netChange / totalChange;
    const score = (ratio + 1) * 50; // This transforms the range from [-1, 1] to [0, 100]
    
    // Ensure the score is within 0-100 range (in case of floating point imprecision)
    return Math.min(Math.max(score, 0), 100);
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

function rankPerformers(metrics, period) {
    const rankings = {};

    for (const metric of ['commits', 'additions', 'deletions', 'impactScore', 'productivity']) {
        const sortedAuthors = Object.keys(metrics)
            .filter(author => {
                if (period === 'overall') {
                    return true; // Always include in overall ranking
                }
                return metrics[author].months && metrics[author].months[period];
            })
            .sort((a, b) => {
                let valueA, valueB;
                
                if (period === 'overall') {
                    valueA = metric === 'productivity' ? metrics[a].overallProductivity : metrics[a][`overall${metric.charAt(0).toUpperCase() + metric.slice(1)}`];
                    valueB = metric === 'productivity' ? metrics[b].overallProductivity : metrics[b][`overall${metric.charAt(0).toUpperCase() + metric.slice(1)}`];
                } else {
                    valueA = metrics[a].months[period][metric];
                    valueB = metrics[b].months[period][metric];
                }
                
                // Handle potential undefined values
                valueA = valueA || 0;
                valueB = valueB || 0;
                
                return valueB - valueA;
            });

        rankings[metric] = sortedAuthors.map(author => {
            let value;
            if (period === 'overall') {
                value = metric === 'productivity' ? metrics[author].overallProductivity : metrics[author][`overall${metric.charAt(0).toUpperCase() + metric.slice(1)}`];
            } else {
                value = metrics[author].months[period][metric];
            }
            return { author, value: value || 0 };
        });
    }

    return rankings;
}

function getBestPerformers(metrics, topN = 5) {
    const overallMetrics = Object.entries(metrics).map(([author, data]) => {
        const combinedScore = (data.overallImpactScore + data.overallProductivity) / 2;
        return {
            author,
            commits: data.totalCommits,
            additions: data.totalAdditions,
            deletions: data.totalDeletions,
            impactScore: data.overallImpactScore,
            productivity: data.overallProductivity,
            combinedScore: combinedScore
        };
    });

    const bestPerformers = {
        byCommits: overallMetrics.sort((a, b) => b.commits - a.commits).slice(0, topN),
        byImpact: overallMetrics.sort((a, b) => b.impactScore - a.impactScore).slice(0, topN),
        byProductivity: overallMetrics.sort((a, b) => b.productivity - a.productivity).slice(0, topN),
        byCombinedScore: overallMetrics.sort((a, b) => b.combinedScore - a.combinedScore).slice(0, topN)
    };

    return bestPerformers;
}
function summarizeContributions(report, metrics, bestPerformers) {
    const summary = {};

    for (const category in bestPerformers) {
        summary[category] = bestPerformers[category].map(performer => {
            const authorMetrics = metrics[performer.author];
            const topMonths = Object.entries(authorMetrics.months)
                .sort(([, a], [, b]) => b.impactScore - a.impactScore)
                .slice(0, 3);

            return {
                author: performer.author,
                totalCommits: authorMetrics.totalCommits,
                totalAdditions: authorMetrics.totalAdditions,
                totalDeletions: authorMetrics.totalDeletions,
                overallImpactScore: authorMetrics.overallImpactScore,
                overallProductivity: authorMetrics.overallProductivity,
                topMonths: topMonths.map(([month, data]) => ({
                    month,
                    commits: data.commits,
                    additions: data.additions,
                    deletions: data.deletions,
                    impactScore: data.impactScore
                }))
            };
        });
    }

    return summary;
}

function generateHtmlReport(report, metrics, rankings, bestPerformersSummary, outputPath) {
    let html = `
    <html>
    <head>
        <title>Git Stats Report</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #dddddd; text-align: left; padding: 8px; }
            th { background-color: #f2f2f2; }
            tr:hover { background-color: #f5f5f5; }
            .metric-table { margin-top: 20px; }
            .ranking-table { margin-top: 20px; }
            .summary-section { margin-top: 40px; }
        </style>
    </head>
    <body>
        <h1>Git Contribution Report</h1>
`;

html += `<h3>Top Performers by Combined Score (Impact + Productivity)</h3>
<table>
    <tr>
        <th>Author</th>
        <th>Combined Score</th>
        <th>Impact Score</th>
        <th>Productivity</th>
        <th>Total Commits</th>
    </tr>`;

    html += `<div class="summary-section">
    <h2>Best Performers Summary</h2>`;

    for (const category in bestPerformersSummary) {
        html += `<h3>Top Performers by ${category.replace('by', '')}</h3>
        <table>
            <tr>
                <th>Author</th>
                <th>Total Commits</th>
                <th>Total Additions</th>
                <th>Total Deletions</th>
                <th>Overall Impact Score</th>
                <th>Overall Productivity</th>
                <th>Top 3 Months</th>
            </tr>`;

        bestPerformersSummary[category].forEach(performer => {
            html += `
            <tr>
                <td>${performer.author}</td>
                <td>${performer.totalCommits}</td>
                <td>${performer.totalAdditions}</td>
                <td>${performer.totalDeletions}</td>
                <td>${performer.overallImpactScore ? performer.overallImpactScore.toFixed(2) : 'N/A'} / 100</td>
                <td>${performer.overallProductivity ? performer.overallProductivity.toFixed(2) : 'N/A'}</td>
                <td>${performer.topMonths.map(m => `${m.month}: ${m.commits} commits, Impact: ${m.impactScore ? m.impactScore.toFixed(2) : 'N/A'}`).join('<br>')}</td>
            </tr>`;
        });

        html += `</table>`;
    }

    html += `</div>`;

    // Author-wise report
    for (const author in report) {
        html += `<h2>Author: ${author}</h2>`;
        html += `
            <table>
                <tr>
                    <th>Month</th>
                    <th>Commits</th>
                    <th>Additions</th>
                    <th>Deletions</th>
                    <th>Impact Score</th>
                    <th>Productivity</th>
                </tr>
        `;

        for (const month in report[author]) {
            const monthData = metrics[author].months[month];
            html += `
                <tr>
                    <td>${month}</td>
                    <td>${monthData.commits}</td>
                    <td>${monthData.additions}</td>
                    <td>${monthData.deletions}</td>
                    <td>${monthData.impactScore.toFixed(2)}</td>
                    <td>${monthData.productivity.toFixed(2)}</td>
                </tr>
            `;
        }

        html += `</table>`;
    }

    // Overall metrics
    html += `<h2>Overall Performance Metrics</h2>`;
    html += `
        <table class="metric-table">
            <tr>
                <th>Author</th>
                <th>Total Commits</th>
                <th>Total Additions</th>
                <th>Total Deletions</th>
                <th>Overall Impact Score</th>
                <th>Overall Productivity</th>
            </tr>
    `;

    for (const author in metrics) {
        html += `
            <tr>
                <td>${author}</td>
                <td>${metrics[author].totalCommits}</td>
                <td>${metrics[author].totalAdditions}</td>
                <td>${metrics[author].totalDeletions}</td>
                <td>${metrics[author].overallImpactScore.toFixed(2)}</td>
                <td>${metrics[author].overallProductivity.toFixed(2)}</td>
            </tr>
        `;
    }

    html += `</table>`;

    // Rankings
    for (const period in rankings) {
        html += `<h2>Rankings - ${period}</h2>`;
        for (const metric in rankings[period]) {
            html += `<h3>${metric} Ranking</h3>`;
            html += `
                <table class="ranking-table">
                    <tr>
                        <th>Rank</th>
                        <th>Author</th>
                        <th>Value</th>
                    </tr>
            `;

            rankings[period][metric].forEach((ranking, index) => {
                html += `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${ranking.author}</td>
                        <td>${typeof ranking.value === 'number' ? ranking.value.toFixed(2) : ranking.value}</td>
                    </tr>
                `;
            });

            html += `</table>`;
        }
    }

    html += `<div class="summary-section">
    <h2>Best Performers Summary</h2>`;

    for (const category in bestPerformersSummary) {
        html += `<h3>Top Performers by ${category.replace('by', '')}</h3>
        <table>
            <tr>
                <th>Author</th>
                <th>Total Commits</th>
                <th>Total Additions</th>
                <th>Total Deletions</th>
                <th>Overall Impact Score</th>
                <th>Overall Productivity</th>
                <th>Top 3 Months</th>
            </tr>`;

        bestPerformersSummary[category].forEach(performer => {
            html += `
            <tr>
                <td>${performer.author}</td>
                <td>${performer.totalCommits}</td>
                <td>${performer.totalAdditions}</td>
                <td>${performer.totalDeletions}</td>
                <td>${performer.overallImpactScore.toFixed(2)} / 100</td>
                <td>${performer.overallProductivity.toFixed(2)}</td>
                <td>${performer.topMonths.map(m => `${m.month}: ${m.commits} commits, Impact: ${m.impactScore.toFixed(2)}`).join('<br>')}</td>
            </tr>`;
        });

        html += `</table>`;
    }

    html += `</div>`;

    html += `
        </body>
        </html>
    `;

    fs.writeFileSync(outputPath, html);
    console.log(`HTML report generated: ${outputPath}`);
}

async function main() {
    try {
        const repoPaths = await listSubdirectories(baseFolderPath);
        
        if (repoPaths.length === 0) {
            console.log('No repositories found.');
            return;
        }

        const { selectedRepo } = await prompt({
            type: 'select',
            name: 'selectedRepo',
            message: 'Please select a repository to analyze:',
            choices: repoPaths.map(repoPath => path.basename(repoPath))
        });

        const selectedRepoPath = path.join(baseFolderPath, selectedRepo);

        const { since, until } = await prompt([
            {
                type: 'input',
                name: 'since',
                message: 'Enter start date (YYYY-MM-DD):',
                initial: '2023-01-01'
            },
            {
                type: 'input',
                name: 'until',
                message: 'Enter end date (YYYY-MM-DD):',
                initial: '2024-10-31'
            }
        ]);

        console.log('Generating report...');
        const report = await generateStatsReport(selectedRepoPath, since, until);
        
        if (Object.keys(report).length === 0) {
            console.log('No data found for the specified date range. Please try a different range.');
            return;
        }

        console.log('Calculating metrics...');
        const metrics = calculatePerformanceMetrics(report);

        const months = [...new Set(Object.values(report).flatMap(author => Object.keys(author)))].sort();
        
        if (months.length === 0) {
            console.log('No monthly data found. Please check the date range and try again.');
            return;
        }

        const currentMonth = months[months.length - 1];
        const previousMonth = months.length > 1 ? months[months.length - 2] : null;
        const quarterStart = months.length >= 3 ? months[Math.max(0, months.length - 3)] : null;

        console.log('Ranking performers...');
        const rankings = {
            currentMonth: rankPerformers(metrics, currentMonth),
            previousMonth: previousMonth ? rankPerformers(metrics, previousMonth) : null,
            quarter: quarterStart ? rankPerformers(metrics, quarterStart) : null,
            overall: rankPerformers(metrics, 'overall')
        };

        console.log('Identifying best performers...');
        const bestPerformers = getBestPerformers(metrics);
        const bestPerformersSummary = summarizeContributions(report, metrics, bestPerformers);

        const outputPath = path.join(__dirname, 'git_contribution_report.html');
        generateHtmlReport(report, metrics, rankings, bestPerformersSummary, outputPath);

        console.log('Report generated successfully.');
    } catch (error) {
        console.error('Error generating report:', error);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
    }
}

main();