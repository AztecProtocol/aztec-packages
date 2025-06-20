# Team Merge Train

This implements a team-based merge train system for the Aztec monorepo, allowing teams to batch their changes before merging to `next`.

## Quick Start

### Initial Setup (one-time)

```bash
# Set up a team branch and create PR
TEAM_BRANCH=feat/your-team-changes ./scripts/ci/manage_team_branch.sh setup
```

This creates:
- Your team branch
- PR to `next` that tracks all team changes

### Daily Usage

1. **Merge your PR to the team branch** instead of `next`
2. **Team branch merges automatically** at 2 AM UTC daily
3. **Or manually trigger** by adding `ready-for-merge` label to the team PR

### Manual Operations

```bash
# Update PR description with latest changes
TEAM_BRANCH=feat/your-team-changes ./scripts/ci/manage_team_branch.sh update

# Manually merge to next (also runs automatically)
TEAM_BRANCH=feat/your-team-changes ./scripts/ci/manage_team_branch.sh merge

# Recreate branch after merge (also runs automatically)
TEAM_BRANCH=feat/your-team-changes ./scripts/ci/manage_team_branch.sh recreate
```

## How It Works

1. **Individual PRs** → merge to team branch (instant)
2. **Team branch** → merges to `next` (daily batch)
3. **After merge** → branch resets, new PR created with history

## GitHub Actions

The workflow runs:
- **Daily**: 2 AM UTC automatic merge
- **On-demand**: Add `ready-for-merge` label
- **Manual**: Actions tab → "Team Merge Train" → Run workflow

## Current Team Branches

- `feat/bb-changes` - Barretenberg team

## Adding New Team Branches

1. Update `.github/workflows/team-merge-train.yml` to include your branch in the schedule trigger:

```yaml
echo 'branches=["feat/bb-changes", "feat/your-team-changes"]' >> $GITHUB_OUTPUT
```

2. Run setup for your branch:
```bash
TEAM_BRANCH=feat/your-team-changes ./scripts/ci/manage_team_branch.sh setup
```

3. Update the team name mapping in `manage_team_branch.sh`:
```bash
function get_team_name {
  case "$TEAM_BRANCH" in
    feat/bb-changes)
      echo "Barretenberg"
      ;;
    feat/your-team-changes)
      echo "Your Team"
      ;;
    *)
      echo "Team"
      ;;
  esac
}
```

## Troubleshooting

### Merge Conflicts
The workflow will create an issue if conflicts occur. Resolve manually:
```bash
git checkout feat/your-team-changes
git merge origin/next
# Resolve conflicts
git push
```

### PR Not Recreating
If the PR doesn't recreate after merge:
```bash
TEAM_BRANCH=feat/your-team-changes ./scripts/ci/manage_team_branch.sh recreate
```

### View Logs
Check GitHub Actions for detailed logs of each run.