#!/bin/bash
set -e

# Arguments from workflow
PR_NUMBER=$1
PR_HEAD_REF=$2
PR_BASE_REF=$3
PR_HEAD_SHA=$4

# Setup
BASE_REF="origin/$PR_BASE_REF"
git fetch origin "$PR_BASE_REF" "$PR_HEAD_REF"

echo "[AUTO-REBASE] Starting rebase of $PR_HEAD_REF onto $BASE_REF"
echo "[AUTO-REBASE] PR #$PR_NUMBER: $PR_HEAD_REF -> $PR_BASE_REF"

# Checkout PR branch
git checkout "$PR_HEAD_REF"

# Save backup for recovery
BACKUP_BRANCH="backup-$PR_HEAD_REF-$(date +%s)"
git branch "$BACKUP_BRANCH"

# Try standard rebase
if git rebase "$BASE_REF" 2>&1 | tee /tmp/rebase.log | grep -q "Successfully rebased"; then
    echo "[AUTO-REBASE] Clean rebase succeeded!"
else
    echo "[AUTO-REBASE] Rebase has conflicts, attempting automatic resolution..."
    
    # Resolution loop
    MAX_ITERATIONS=50
    ITERATION=0
    
    while [ $ITERATION -lt $MAX_ITERATIONS ]; do
        ITERATION=$((ITERATION + 1))
        
        # Check if still rebasing
        if ! git status --porcelain | grep -q "^UU\|^AA\|^DD"; then
            if git rebase --continue 2>/dev/null; then
                echo "[AUTO-REBASE] Rebase step completed"
            elif git diff --staged --quiet; then
                echo "[AUTO-REBASE] Skipping empty commit"
                git rebase --skip
            else
                break
            fi
        else
            # Resolve conflicts
            # Strategy: Accept upstream (base) changes for cleaner history
            git status --porcelain | grep "^UU\|^AA\|^DD" | awk '{print $2}' | while read -r file; do
                echo "[AUTO-REBASE] Resolving conflict in $file"
                if [ -f "$file" ]; then
                    # For existing files, take base version
                    git checkout --theirs "$file" && git add "$file"
                else
                    # For deleted files, accept deletion
                    git rm "$file" 2>/dev/null || git add "$file"
                fi
            done
        fi
        
        # Check if rebase is complete
        if ! git status | grep -q "rebase in progress"; then
            echo "[AUTO-REBASE] Rebase completed successfully!"
            break
        fi
    done
    
    if [ $ITERATION -eq $MAX_ITERATIONS ]; then
        echo "[AUTO-REBASE] ERROR: Maximum iterations reached, aborting rebase"
        git rebase --abort
        git checkout "$PR_HEAD_REF"
        git reset --hard "$BACKUP_BRANCH"
        git branch -D "$BACKUP_BRANCH"
        exit 1
    fi
fi

# Cleanup backup branch
git branch -D "$BACKUP_BRANCH"

# Log the result
echo "[AUTO-REBASE] Rebase complete. New commits:"
git log --oneline "$BASE_REF".."$PR_HEAD_REF"

# Push the rebased branch
echo "[AUTO-REBASE] Pushing rebased branch..."
git push origin "$PR_HEAD_REF" --force-with-lease

echo "[AUTO-REBASE] Success! Branch $PR_HEAD_REF has been rebased onto $PR_BASE_REF"