#!/bin/bash

output_file="contributors_report.txt"

# Create or clear the output file
echo "Contributors Report for $(date +'%B %Y')" > "$output_file"
echo "===================================" >> "$output_file"

# Declare associative arrays to hold contributor data
declare -A contributors
declare -A additions
declare -A deletions

# Loop through each directory in the current folder
for dir in */; do
    # Check if it's a Git repository
    if [ -d "$dir/.git" ]; then
        echo "Analyzing $dir..." >> "$output_file"

        # Get the commit authors for the current month
        while IFS= read -r author; do
            ((contributors["$author"]++))
        done < <(git -C "$dir" log --since="$(date +'%Y-%m-01')" --pretty=format:'%an')

        # Get additions and deletions
        while IFS= read -r numstat; do
            read -r add del file <<< "$numstat"
            author=$(git -C "$dir" log -1 --pretty=format:'%an' -- "$file" 2>/dev/null)

            # Default additions and deletions to 0 if not set
            add=${add:-0}
            del=${del:-0}

            # Only update if author is not empty
            if [[ -n "$author" ]]; then
                additions["$author"]=$((additions["$author"] + add))
                deletions["$author"]=$((deletions["$author"] + del))
            fi
        done < <(git -C "$dir" log --since="$(date +'%Y-%m-01')" --numstat)

        echo "" >> "$output_file"
    else
        echo "$dir is not a Git repository." >> "$output_file"
    fi
done

# Output the results in a clean tabular format
printf "%-25s | %-7s | %-10s | %-10s | %-10s | %-12s\n" \
    "Contributor" "Commits" "Additions" "Deletions" "Impact" "Performance" >> "$output_file"
echo "----------------------------------------------------------------------------------" >> "$output_file"

for contributor in "${!contributors[@]}"; do
    total_additions=${additions[$contributor]:-0}
    total_deletions=${deletions[$contributor]:-0}
    total_commits=${contributors[$contributor]:-0}
    impact=$((total_additions + total_deletions))

    # Calculate performance as additions per commit, handle division by zero
    if [[ $total_commits -gt 0 ]]; then
        performance=$(echo "scale=2; $total_additions / $total_commits" | bc)
    else
        performance="N/A"
    fi

    # Output contributor data, ensuring no uninitialized variables
    printf "%-25s | %-7d | %-10d | %-10d | %-10d | %-12s\n" \
        "$contributor" "$total_commits" "$total_additions" "$total_deletions" "$impact" "$performance" >> "$output_file"
done

echo "Report generated: $output_file"
