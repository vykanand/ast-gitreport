#!/bin/bash

# Ensure we're in a Git repository
if [ ! -d ".git" ]; then
  echo "Not a git repository! Exiting..."
  exit 1
fi

# Fetch the latest changes to ensure we are up to date
git fetch

# Get the latest merge commit (HEAD) and list commits before it
echo "Fetching previous commits..."
latest_merge_commit=$(git log --merges --max-count=1 --pretty=format:"%H")
echo "Latest merge commit is: $latest_merge_commit"

# List the commits before the latest merge commit (excluding the merge commit itself)
commits_before_merge=$(git log --pretty=format:"%h %s" $latest_merge_commit^..HEAD | tail -n +2)

# Check if there are commits to show
if [ -z "$commits_before_merge" ]; then
  echo "No commits before the latest merge. Exiting..."
  exit 1
fi

# Display the commit list
echo "Previous commits before the latest merge:"
echo "$commits_before_merge"

# Prompt for commit to squash
echo
echo "Enter the commit hash of the commit to squash (it will squash into the previous commit):"
read squash_commit_hash

# Check if the commit hash is valid
if ! git cat-file commit "$squash_commit_hash" &>/dev/null; then
  echo "Invalid commit hash! Exiting..."
  exit 1
fi

# Prompt for the new commit message
echo
echo "Enter the new commit message for the squash commit:"
read -r new_commit_message

# Perform the squash using interactive rebase
echo "Starting interactive rebase to squash commit..."

# Rebase interactively to squash the selected commit
git rebase -i --autosquash $squash_commit_hash^ <<EOF
pick $squash_commit_hash
squash $(git log --pretty=format:"%h" --max-count=1 $squash_commit_hash^)
EOF

# If the rebase is successful, the user will be prompted to edit the commit message
# We automate the commit message using the provided one
echo "$new_commit_message" > .git/COMMIT_EDITMSG

# Finalize the rebase
git rebase --continue

echo "Squash completed successfully with the commit message: '$new_commit_message'"
