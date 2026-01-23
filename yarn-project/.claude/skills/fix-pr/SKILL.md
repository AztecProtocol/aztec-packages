---
name: fix-pr
description: Fix a failing PR by analyzing CI logs and fixing errors. Autonomous workflow that identifies failures, rebases, fixes issues, and pushes.
argument-hint: <PR number>
---

# Fix Failing PR

Autonomous workflow to fix CI failures for a PR. Delegates failure identification to subagent, then applies fixes.

## Usage

```
/fix-pr 19882
```

## Workflow

### Phase 1: Identify Failures

Spawn the `identify-ci-failures` subagent:

```
Use Task tool with subagent_type: "identify-ci-failures"
Prompt: "Identify CI failures for PR <number>"
```

This returns:
- Failure type (build/format/lint/unit-test/e2e-test)
- Test names, hashes, error snippets
- Local file paths for logs

**If the subagent cannot find CI logs**, ask the user for:
- The CI log URL directly
- Or the CI password if authentication is needed

### Phase 2: Checkout and Rebase

```bash
# Get PR info
gh pr view <PR> --repo AztecProtocol/aztec-packages --json headRefName,baseRefName

# Checkout PR
gh pr checkout <PR>

# Rebase on base branch
git fetch origin <base-branch>
git rebase origin/<base-branch>
```

If there are conflicts:
1. Resolve the conflicts
2. `git add .`
3. `git rebase --continue`

**Important**: Always REBASE, never merge.

### Phase 3: Bootstrap (if needed)

Check if changes exist outside `yarn-project`:
```bash
git diff origin/<base-branch>...HEAD --name-only | grep -v '^yarn-project/'
```

If yes, run bootstrap:
```bash
(cd $(git rev-parse --show-toplevel) && BOOTSTRAP_TO=yarn-project ./bootstrap.sh)
```

### Phase 4: Fix Based on Failure Type

Run from `yarn-project` directory.

| Failure Type | Fix Action |
|-------------|------------|
| **FORMAT** | `yarn format <package-name>` |
| **LINT** | `yarn lint` |
| **BUILD** | `yarn build`, fix TypeScript errors, repeat |
| **UNIT TEST** | `yarn workspace @aztec/<package> test <file>`, fix, repeat |
| **E2E TEST** | For simple failures, fix. For complex failures, suggest `/debug-e2e` |

#### Format Errors
```bash
yarn format
```

#### Lint Errors
```bash
yarn lint
```

#### Build Errors
```bash
yarn build
# Fix errors shown
yarn build  # Repeat until clean
```

#### Unit Test Errors
```bash
yarn workspace @aztec/<package> test <file>.test.ts
# Fix errors
yarn workspace @aztec/<package> test <file>.test.ts  # Repeat until passing
```

#### E2E Test Errors

For simple failures (obvious assertion fix):
```bash
yarn workspace @aztec/end-to-end test:e2e <file>.test.ts -t '<test name>'
# Fix and repeat
```

For complex failures (flaky, timeout, unclear cause):
- Inform the user that this needs deeper investigation
- Suggest using `/debug-e2e` skill instead

### Phase 5: Quality Checklist

Before committing, run from `yarn-project`:

```bash
yarn build                              # Ensure it compiles
yarn format                             # Format modified packages
yarn lint                               # Lint (same as CI)
```

Run tests for modified files:
```bash
yarn workspace @aztec/<package> test <file>.test.ts
```

### Phase 6: Amend and Push

```bash
git add .
git commit --amend --no-edit
git push --force-with-lease
```

## Key Points

- **Delegate identification**: Use `identify-ci-failures` subagent, don't analyze logs directly
- **Rebase, don't merge**: Always rebase on the base branch
- **Amend, don't create new commits**: PRs should be single commits
- **Bootstrap when needed**: Only if changes outside yarn-project
- **Escalate e2e failures**: Complex e2e issues need `/debug-e2e`

## Reference

- See `CLAUDE.md` for project conventions
- See `/debug-e2e` skill for complex e2e failure analysis
