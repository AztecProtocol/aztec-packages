# Merge Train Documentation

## Overview

The merge train is an automated system for managing pull requests in a coordinated queue. It helps prevent merge conflicts and ensures smooth integration of multiple PRs targeting the same base branch.
Inspired by [rust rollups](https://forge.rust-lang.org/release/rollups.html), but that's a non-ideal name for our domain.

## How It Works

1. **Merge Train Branches**: Special branches prefixed with `merge-train/` (e.g., `merge-train/barretenberg`, `merge-train/docs`)
2. **Automatic Recreation**: When a merge train PR is merged, the branch is automatically recreated with an empty commit
3. **PR Body Updates**: The merge train PR body is automatically updated with a list of commits whenever changes are pushed
4. **Auto-merge**: PRs that have been inactive for 4+ hours are automatically approved and merged (if they contain meaningful commits)
5. **Next Branch Integration**: Changes from the `next` branch are automatically merged into active merge train branches

## Using the Merge Train

### Adding Your PR to the Merge Train

1. Create your feature branch and make your changes
2. Instead of targeting `master` or `next` directly, target the appropriate merge train branch (e.g., `merge-train/barretenberg`)
3. Open your PR against the merge train branch
4. Your changes will be included in the next merge train cycle

### Merge Train Lifecycle

1. **Creation**: A merge train PR is created with an empty commit. All existing PRs are updated to prevent issues due to the squash merge.
2. **Accumulation**: Feature PRs are merged into the merge train branch
3. **Auto-merge**: After 4 hours of inactivity (with meaningful commits), the train is automatically merged
4. **Recreation**: The cycle starts again with a new empty merge train

### Benefits

- **Conflict Prevention**: Changes are tested together before merging to the base branch
- **Batch Integration**: Multiple related changes can be merged as a group
- **Automated Management**: No manual intervention needed for most operations
- **Clear Visibility**: The merge train PR body shows all included commits

## Workflow Files

- `merge-train-recreate.yml`: Recreates the merge train branch after it's merged
- `merge-train-update-pr-body.yml`: Updates the PR body with commit list
- `merge-train-auto-merge.yml`: Auto-merges inactive PRs after 4 hours
- `merge-train-next-to-branches.yml`: Merges changes from `next` to merge train branches

## Important Notes

- Only PRs with meaningful commits (non-empty, non-merge commits) will trigger auto-merge
- The 4-hour inactivity timer is based on the last commit timestamp
- Merge conflicts with the `next` branch will be reported as commit comments

## RECOVERING FROM MERGE TRAIN RECREATION

If you have a PR open into a merge-train that merged and was recreated, it will attempt the following to get around the fact that it has squashed with technically now has completely divergent history:

```
git merge (final commit of last merge-train)
git merge -X ours origin/next
```
If your PR fails to update due to a conflict, you should do the above manually, fixing the conflicts (should only happen in first merge).
NOTE: If you want to be precise, instead of origin/next it should the commit corresponding to the merge-train merge. This minimizes the effect of conflicts. Failure to do this may cause you to overwrite changes in next - check your diff afterwards for unexpected changes.
