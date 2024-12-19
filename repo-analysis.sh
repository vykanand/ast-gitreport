#!/bin/bash

# Function to extract .git folder into "analysis" directory and switch to development branch
extract_git_folder() {
  local repo_name=$1
  local analysis_dir=$2

  # Ensure the analysis directory exists, or create it
  if [ ! -d "$analysis_dir" ]; then
    echo "Creating analysis directory..."
    mkdir -p "$analysis_dir"
  fi

  # Create a subdirectory for the current repository inside the analysis folder
  local repo_analysis_dir="$analysis_dir/$repo_name"
  
  # If the directory already exists, remove its contents
  if [ -d "$repo_analysis_dir" ]; then
    echo "Overwriting existing directory for $repo_name inside $analysis_dir"
    rm -rf "$repo_analysis_dir"
  fi

  mkdir -p "$repo_analysis_dir"  # Create the folder for the repository

  # Copy the .git folder into the analysis directory
  if [ -d "$repo_name/.git" ]; then
    echo "Copying .git folder of $repo_name to $repo_analysis_dir"
    cp -r "$repo_name/.git" "$repo_analysis_dir/"
    
    # Navigate into the repo directory
    cd "$repo_analysis_dir" || exit

    # Try to checkout the 'development' branch
    echo "Switching to 'development' branch in $repo_name"
    git checkout development 2>/dev/null

    # If the branch doesn't exist, we could attempt to fetch it
    if [ $? -ne 0 ]; then
      echo "Branch 'development' not found, fetching remote branches..."
      git fetch origin development:development
      git checkout development
    fi
    
    # Return to the original directory
    cd - > /dev/null || exit
  else
    echo "No .git folder found for $repo_name, skipping..."
  fi
}

# List of repositories to analyze (same list as in repo_updater.sh)
repo_urls=(
  "https://gitlab.niveussolutions.com/niveusprojects/darpan2.0/achievements-service"
  "https://gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-bridge-service"
  "https://gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-certifications-service"
  "https://gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-common-service"
  "https://gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-performance-service"
  "https://gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-roles-service"
  "https://gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-user-roles-service"
  "https://gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan_cron_services"
  "https://gitlab.niveussolutions.com/niveusprojects/darpan2.0/integration-service"
  "https://gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-skills-service"
  "https://gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-project-management-service"
  "https://gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-deal-transition-service/"
  "https://gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-master-service/activity"
  "https://gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-frontend-web/"
)

# Define the analysis directory
analysis_dir="analysis"

# Initialize counters for success and failure
success_count=0
failure_count=0

# Ensure the analysis directory exists
if [ ! -d "$analysis_dir" ]; then
  echo "Creating analysis directory..."
  mkdir -p "$analysis_dir"
fi

# Extract .git folders from repositories into the analysis directory
for repo_url in "${repo_urls[@]}"; do
  repo_name=$(basename "$repo_url" .git)
  extract_git_folder "$repo_name" "$analysis_dir"
done

# Summary
echo ""
echo "Analysis Completed!"
echo "===================="
echo "Repositories analyzed and .git folder extracted: $success_count"
echo "Repositories skipped (no .git folder found): $failure_count"

