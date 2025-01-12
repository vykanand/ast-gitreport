const fs = require("fs");
const simpleGit = require("simple-git");
const path = require("path");

// Hardcoded GitLab username and token for authentication
const GITLAB_USERNAME = "vikas.anand@niveussolutions.com"; // Replace with your username
const GITLAB_TOKEN = "pMzXUx92XLu7nVtxdNBh"; // Replace with your personal access token

// URL encode the username and token to handle special characters
const encodedUsername = encodeURIComponent(GITLAB_USERNAME);
const encodedToken = encodeURIComponent(GITLAB_TOKEN);

// Define the output directory where all repo folders will be created
const OUTPUT_DIR = path.join(__dirname, "analysis");

// Create the analysis folder if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR);
}

// Initialize counters for success and failure tracking
let successCount = 0;
let failureCount = 0;
let failedRepos = [];

// Read the repo URLs from repo.txt
fs.readFile("repo.txt", "utf8", (err, data) => {
  if (err) {
    console.error("Error reading repo.txt:", err);
    return;
  }

  // Split the file content into an array of URLs
  const repoUrls = data.split("\n").filter((url) => url.trim() !== "");

  // Process each repo
  repoUrls.forEach((repoUrl, index) => {
    const repoName = path.basename(repoUrl, ".git"); // Get the repo name from the URL
    const repoClonePath = path.join(OUTPUT_DIR, repoName);

    // Construct the URL with encoded username and token for authentication
    const authUrl = `https://${encodedUsername}:${encodedToken}@${repoUrl.replace(
      "https://",
      ""
    )}`;

    console.log(`Processing ${authUrl}`);

    // If the repository already exists, fetch the latest changes
    if (fs.existsSync(repoClonePath)) {
      const git = simpleGit(repoClonePath);
      console.log(
        `Repository ${repoName} already exists. Fetching latest changes...`
      );

      git
        .fetch() // Fetch latest changes from the remote
        .then(() => git.checkout("development")) // Attempt to checkout the development branch
        .catch(() => {
          console.log(`Development branch not found. Trying main...`);
          return git.checkout("main"); // Fallback to the main branch
        })
        .catch(() => {
          console.log(`Main branch not found. Trying master...`);
          return git.checkout("master"); // Fallback to the master branch
        })
        .then(() => git.pull("origin", "development")) // Pull the latest changes from the respective branch
        .then(() => {
          console.log(`Successfully updated ${repoName}`);
          successCount++;
        })
        .catch((err) => {
          console.error(`Error updating ${repoName}:`, err);
          failureCount++;
          failedRepos.push(repoUrl); // Add failed repo URL to the list
        });
    } else {
      // If the repository doesn't exist, clone it
      const git = simpleGit();

      console.log(`Cloning ${authUrl} into ${repoClonePath}`);

      git
        .clone(authUrl, repoClonePath)
        .then(() => git.cwd(repoClonePath).checkout("development")) // Checkout the development branch after cloning
        .catch(() => {
          console.log(
            `Development branch not found after cloning. Trying main...`
          );
          return git.checkout("main"); // Fallback to the main branch
        })
        .catch(() => {
          console.log(`Main branch not found after cloning. Trying master...`);
          return git.checkout("master"); // Fallback to the master branch
        })
        .then(() => git.pull("origin", "development")) // Pull the latest changes from the respective branch
        .then(() => {
          console.log(`Successfully cloned and updated ${repoName}`);
          successCount++;
        })
        .catch((err) => {
          console.error(`Error cloning ${repoName}:`, err);
          failureCount++;
          failedRepos.push(repoUrl); // Add failed repo URL to the list
        });
    }
  });

  // After processing all repositories, output the summary
  console.log("\n--- Summary ---");
  console.log(`Total Repositories Processed: ${repoUrls.length}`);
  console.log(`Successfully Cloned/Updated: ${successCount}`);
  console.log(`Failed Repositories: ${failureCount}`);

  if (failureCount > 0) {
    console.log("\nFailed Repositories URLs:");
    failedRepos.forEach((url) => console.log(url));
  }
});
