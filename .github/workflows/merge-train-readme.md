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

### Creating a New Merge-Train

1. **Create Branch**: Fork from `next` with naming pattern `merge-train/{team}`
2. **Enable Auto-Sync**: Add your branch to `.github/workflows/merge-train-next-to-branches.yml`
3. **Open PR**: Create a PR from your merge-train branch to `next` - automation handles the rest

### Adding Your PR to the Merge Train

1. Create your feature branch and make your changes
2. Instead of targeting `master` or `next` directly, target the appropriate merge train branch (e.g., `merge-train/barretenberg`)
3. When your PR merges the changes will be included in the next merge train cycle

### Merge Train Lifecycle

1. **Creation**: A merge train PR is created automatically when changes are pushed to the branch and labeled with `ci-no-squash`.
2. **Accumulation**: Feature PRs are merged into the merge train branch, squashed
3. **Auto-merge**: After 4 hours of inactivity (with meaningful commits), the train is automatically merged with a merge-commit (not a squash)
4. **Recreation**: The cycle starts again with a new merge train

## Handling Merge Failures

When a merge-train fails due to issues from `next`:

### Option 1: Direct Fix
- Push a fix directly to the merge-train branch
- Use bypass merge to expedite (all users have this permission)
- Best for small, quick fixes

### Option 2: Fix in Next
- Merge a revert or workaround into `next`
- The fix will auto-propagate to merge-train via automation
- Best when key assumptions are broken or multiple trains affected
