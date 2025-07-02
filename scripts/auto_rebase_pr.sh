#!/bin/bash
set -e

# Arguments from workflow
PR_NUMBER=$1
PR_HEAD_REF=$2
PR_BASE_REF=$3
PR_HEAD_SHA=$4

# Simple rebase script - just rebase non-merge commits
echo "[AUTO-REBASE] Starting rebase of $PR_HEAD_REF onto $PR_BASE_REF"

# Fetch latest
git fetch origin "$PR_BASE_REF" "$PR_HEAD_REF"

# Checkout PR branch
git checkout "$PR_HEAD_REF"

# Save backup
BACKUP_BRANCH="backup-$PR_HEAD_REF-$(date +%s)"
git branch "$BACKUP_BRANCH"

# Enable rerere for conflict memory
git config rerere.enabled true

# Try simple rebase first
if git rebase "origin/$PR_BASE_REF"; then
    echo "[AUTO-REBASE] Success!"
else
    echo "[AUTO-REBASE] Conflicts detected, attempting auto-resolution..."
    
    # Simple conflict resolution loop
    while true; do
        # Check if still in rebase
        if ! git status | grep -q "rebase in progress"; then
            break
        fi
        
        # Get conflicted files
        CONFLICTS=$(git diff --name-only --diff-filter=U)
        
        if [ -z "$CONFLICTS" ]; then
            # No conflicts, continue
            git rebase --continue || break
        else
            # Try to auto-resolve each conflict
            for file in $CONFLICTS; do
                echo "[AUTO-REBASE] Resolving $file..."
                
                # Simple strategy: if file deleted upstream, accept deletion
                if ! git ls-tree "origin/$PR_BASE_REF":"$file" >/dev/null 2>&1; then
                    git rm "$file" 2>/dev/null || true
                # Otherwise try three-way merge
                elif [ -f "$file" ] && git merge-file "$file" \
                    <(git show :1:"$file" 2>/dev/null || echo "") \
                    <(git show :3:"$file" 2>/dev/null || echo "") \
                    2>/dev/null; then
                    git add "$file"
                # If that fails, take ours (PR version) to preserve intent
                else
                    git checkout --ours "$file" 2>/dev/null || true
                    git add "$file"
                fi
            done
            
            # Try to continue
            if ! git rebase --continue 2>/dev/null; then
                # Might be empty commit, skip it
                if git diff --staged --quiet; then
                    git rebase --skip
                else
                    echo "[AUTO-REBASE] Failed to continue after resolution"
                    git rebase --abort
                    git reset --hard "$BACKUP_BRANCH"
                    git branch -D "$BACKUP_BRANCH"
                    exit 1
                fi
            fi
        fi
    done
fi

# Cleanup backup
git branch -D "$BACKUP_BRANCH"

# Push if in CI
if [ -n "$GH_TOKEN" ] || [ -n "$GITHUB_TOKEN" ]; then
    git push origin "$PR_HEAD_REF" --force-with-lease
else
    echo "[AUTO-REBASE] Would push to origin/$PR_HEAD_REF"
    git log --oneline "origin/$PR_BASE_REF".."$PR_HEAD_REF"
fi

echo "[AUTO-REBASE] Complete!"