#!/bin/bash

# Git credentials
GIT_USERNAME="vikas.anand@niveussolutions.com"
GIT_PASSWORD="pMzXUx92XLu7nVtxdNBh"

# Function to ensure a clean, updated repository
update_repo_clean() {
  local repo_url=$1
  local repo_name=$2

  if [ ! -d "$repo_name" ]; then
    echo "Cloning repository: $repo_name"
    git clone "https://${GIT_USERNAME}:${GIT_PASSWORD}@${repo_url}" "$repo_name" || {
      echo "Failed to clone repository: $repo_name. Skipping..."
      return 1
    }
  fi

  echo "Repository $repo_name already exists, ensuring clean state and updating..."
  cd "$repo_name" || {
    echo "Failed to enter repository directory: $repo_name. Skipping..."
    return 1
  }

  # Discard local changes
  git reset --hard
  git clean -fd

  # Check for the desired branches
  if git show-ref --verify --quiet refs/remotes/origin/development; then
    branch="development"
  else
    # Prompt user to choose from available branches
    echo "No default branch (development, main, or master) found for $repo_name."
    echo "Available branches:"
    available_branches=$(git branch -r | grep -oE 'origin/[^ ]+' | sed 's|origin/||' | sort | uniq)
    select chosen_branch in $available_branches; do
      if [ -n "$chosen_branch" ]; then
        branch="$chosen_branch"
        break
      else
        echo "Invalid selection. Please try again."
      fi
    done
  fi

  # Checkout and fetch the chosen branch
  echo "Switching to $branch branch and fetching the latest changes..."
  git checkout $branch
  git fetch origin $branch
  git reset --hard origin/$branch

  cd ..
  return 0
}

# List of repositories
repo_urls=(
  "gitlab.niveussolutions.com/niveusprojects/darpan2.0/achievements-service"
  "gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-bridge-service"
  "gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-certifications-service"
  "gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-common-service"
  "gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-performance-service"
  "gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-roles-service"
  "gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-user-roles-service"
  "gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan_cron_services"
  "gitlab.niveussolutions.com/niveusprojects/darpan2.0/integration-service"
  "gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-skills-service"
  "gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-project-management-service"
  "gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-deal-transition-service"
  "gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-master-service/activity"
  "gitlab.niveussolutions.com/niveusprojects/darpan2.0/darpan-frontend-web"
)

# Clone or update all repositories
success_count=0
failure_count=0

for repo_url in "${repo_urls[@]}"; do
  repo_name=$(basename "$repo_url" .git)
  update_repo_clean "$repo_url" "$repo_name"
  if [ $? -eq 0 ]; then
    success_count=$((success_count + 1))
  else
    failure_count=$((failure_count + 1))
  fi
done

# Summary
echo ""
echo "Repo Update Completed!"
echo "======================"
echo "Repositories successfully updated or cloned: $success_count"
echo "Repositories with errors (not updated): $failure_count"

