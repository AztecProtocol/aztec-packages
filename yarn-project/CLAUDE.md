# Aztec TypeScript Monorepo Development Guide

## Project Structure
- **TypeScript monorepo** with each folder being a package
- **Working directory**: `yarn-project`
- **Main branch**: `master`
- **Development branch**: `next` (most changes go here first)

## 🚀 Essential Workflow

### When to Run Bootstrap
**ONLY** run `./bootstrap.sh` in the git project root when:
- Pulling new changes that have modifications outside `yarn-project`
- Switching branches with changes from outside `yarn-project`

```bash
cd $(git rev-parse --show-toplevel) && ./bootstrap.sh
```

**DO NOT** run bootstrap in any other circumstance - it takes several minutes.

### Before Running Tests - ALWAYS COMPILE
```bash
yarn tsc -b  # Full compilation
# OR for specific package:
cd <package-name> && yarn tsc -b
```

### Before Committing - Quality Checklist
1. **Build**: Ensure project compiles (`yarn tsc -b`)
2. **Format/Lint**: Run on modified packages (see Format & Lint section)
3. **Test**: Run unit tests for modified files and ensure they pass
4. **Breaking Changes**: Update migration notes if applicable (see Git & PR section)

## 📦 Compilation

### Full Project
```bash
yarn tsc -b
```

### Specific Package
```bash
cd <package-name>
yarn tsc -b
```

## 🧪 Testing

**⚠️ NEVER run `yarn test` from the project root - ALWAYS cd into a specific package first!**

### Standard Tests
```bash
# WRONG: yarn test from yarn-project root ❌
# RIGHT: Always cd into package first ✅

cd <package-name>
yarn test FILENAME                    # Run test file
yarn test FILENAME -t 'test-name'     # Run specific test
```

### End-to-End Tests (Special Handling)
**⚠️ IMPORTANT**:
- Never run multiple e2e tests in parallel
- E2e tests take significant time
- Tests log "Running test TEST NAME" to track progress

```bash
cd end-to-end
yarn test:e2e FILENAME
```

### Sequential Testing (Port Conflicts)
Some packages (e.g., `ethereum`) require sequential execution:
```bash
cd <package-name>
yarn test --runInBand
```

### Test Logging
```bash
# Basic logging
env LOG_LEVEL=verbose yarn test FILENAME
env LOG_LEVEL=debug yarn test FILENAME

# Available levels: trace, debug, verbose, info, warn
# Recommended: verbose

# Module-specific logging
env LOG_LEVEL='info; debug:sequencer,archiver' yarn test FILENAME
```

## 🎨 Format & Lint

### Single Package (PREFERRED for speed)
When modifying a single package, always use single-package commands:
```bash
./bootstrap.sh format <package-name>
./bootstrap.sh lint <package-name>

# Examples:
./bootstrap.sh format aztec-node
./bootstrap.sh lint ethereum
```

### All Packages
Only when multiple packages are modified:
```bash
./bootstrap.sh format
./bootstrap.sh lint
```

### Check Mode (No Changes)
```bash
# Single package
./bootstrap.sh format <package-name> --check
./bootstrap.sh lint --check <package-name>

# All packages
./bootstrap.sh format --check
./bootstrap.sh lint --check
```

## 📦 Dependency Management
After modifying any `package.json`:
```bash
yarn && yarn prepare
```

## 🔀 Git & PR Guidelines

### Working in Parallel with Git Worktrees

When Claude needs to work on a task independently in a separate worktree:

**Command Template:**
```bash
cd $(git rev-parse --show-toplevel) && \
git worktree add -b <author>/<branch-name> ../<worktree-dir-name> && \
cd ../<worktree-dir-name>/yarn-project && \
claude "$(cat <<'EOF'
Task: [Brief task description]

Steps:
1. [Step 1]
2. [Step 2]
...

IMPORTANT: Read CLAUDE.md first to understand the project structure and workflow.

[Any additional context or requirements]
- Working directory: yarn-project in the worktree
- Branch: <author>/<branch-name>
- PR target: next (unless specified otherwise)
EOF
)"
```

**Example:**
```bash
cd $(git rev-parse --show-toplevel) && \
git worktree add -b jd/fix-bug-123 ../aztec-fix-bug && \
cd ../aztec-fix-bug/yarn-project && \
claude "$(cat <<'EOF'
Task: Fix bug #123 in the sequencer

Steps:
1. Investigate the issue in sequencer package
2. Implement fix
3. Add tests
4. Compile and run tests
5. Commit and create PR

IMPORTANT: Read CLAUDE.md first to understand the project structure and workflow.
EOF
)"
```

**Key Points:**
- Always go to git root first before creating worktree
- Use `-b` flag to create new branch
- Navigate to `yarn-project` within the worktree
- Always include "Read CLAUDE.md first" in the prompt
- Worktree directories are typically named `../aztec-<feature-name>`
- The spawned Claude instance works independently from your current session

### Branch Naming
Prefix branches with author initials:
```
ab/feature-name
jd/fix-something
```

**Setting Author Initials:**
Configure your git initials for automatic branch naming:
```bash
# Local repository only
git config user.initials "jd"

# Global (all repositories)
git config --global user.initials "jd"
```

**How Claude Determines Author Initials:**
1. First checks `git config user.initials`
2. If not set, derives from `git config user.name` (e.g., "John Doe" → "jd")
3. Uses lowercase initials for branch names

### Commit Messages - Conventional Commits
Follow [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)

**Supported types** (from `.github/workflows/pull-request-title.yml`):
- `fix`: Bug fixes
- `feat`: New features
- `chore`: Maintenance tasks
- `refactor`: Code restructuring
- `docs`: Documentation changes
- `test`: Test additions/modifications

**Format**:
```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Branch Strategy
- **Primary development**: `next` branch (default PR target)
- **Production**: `master` branch
- **Default PR target**: `next` (unless specified otherwise)
- **Backport**: Fix in release branch → forward-port to `next`
- **Forward-port**: Fix in `next` → backport if needed

### Port Commits (Forward/Backport)
When porting PRs between branches:
1. Include reference to original PR(s) in PR body
2. For single PR: Use exact same commit message + PR number
   ```
   chore: Foo bar (#1234)
   ```
3. For multiple PRs: Reference all in PR body

### PR Merging & Squashing
**⚠️ IMPORTANT**: By default, every PR is squashed to a single commit when merged.

For PRs with multiple commits that should be preserved (e.g., porting multiple PRs):
1. Ensure each individual commit follows conventional commit format
2. Add label `ci-no-squash` to the PR on GitHub
3. If no GitHub MCP access, notify user to add label manually

### Breaking Changes
When introducing breaking changes:

1. **Update migration notes**:
   ```
   docs/docs/developers/migration_notes.md
   ```
   (Note: Path from git root)

2. **Include in PR description**: Clearly document the breaking changes

### CI Labels
Special labels to control CI behavior:

- **`ci-no-squash`**: Preserve individual commits (don't squash on merge)
  - Use when porting multiple PRs that should remain separate commits
  - Each commit must follow conventional commit format

- **`ci-no-fail-fast`**: Run all tests even if some fail
  - Use when changes may affect multiple e2e tests not caught by unit tests
  - Helps survey all failing tests at once

### Marking Tests as Flaky
When a test intermittently fails but shouldn't block CI:

1. **Edit `.test_patterns.yml`** (at git root, not in yarn-project)
2. **Add entry under `tests:`** section with:
   - `regex`: Pattern to match the test file/name
   - `error_regex`: (Optional) Specific error message to match
   - `owners`: List of Slack IDs (use existing names from `names:` section or add new ones)
   - `skip`: (Optional) Set to `true` to completely skip the test (use sparingly!)

**Example entry:**
```yaml
- regex: "src/e2e_new_feature/feature.test.ts"
  error_regex: "specific error message"  # Optional: only flag if this error occurs
  owners:
    - *charlie  # Reference existing name
    - *adam     # Can have multiple owners
```

**To add a new owner:**
1. Add to `names:` section: `- newperson: &newperson "SLACK_ID"`
2. Reference in test: `- *newperson`

**Important notes:**
- Without `error_regex`: Test is always flagged as flaky when it fails
- With `error_regex`: Only flagged when output matches the regex
- `skip: true`: Test won't run at all (avoid unless constantly failing)
- Flaky tests alert owners in #aztec3-ci Slack channel but don't fail CI

## 📚 Quick Reference

### Common Package Commands
```bash
# Compile
yarn tsc -b

# Test (MUST cd into package first!)
cd package-name
yarn test filename.test.ts
yarn test filename.test.ts -t 'specific test'

# Format/Lint single package (preferred)
./bootstrap.sh format package-name
./bootstrap.sh lint package-name

# E2E test (never parallel)
cd end-to-end && yarn test:e2e filename.test.ts
```

### Workflow Reminders
- ✅ Always compile before testing
- ✅ Format/lint modified packages before committing
- ✅ Run tests for modified code
- ✅ Use single-package commands when possible (faster)
- ❌ Never run `yarn test` from project root - always cd into package first
- ❌ Never run multiple e2e tests in parallel
- ❌ Don't run bootstrap unless pulling external changes