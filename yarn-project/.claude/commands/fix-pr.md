---
description: Fix a failing PR by analyzing CI logs and fixing errors
argument-hint: <PR number>
allowed-tools: Bash(gh:*), Bash(git fetch:*), Bash(git rebase:*), Read(/tmp/**), Write(/tmp/**), Bash(curl *ci.aztec-labs.com*)
---

# Fix Failing PR

Fix the CI failures for PR $ARGUMENTS.

## Phase 1: Identify CI Failures

### Step 1: Get PR info and CI run ID
```bash
gh pr view $ARGUMENTS --repo AztecProtocol/aztec-packages --json headRefName,baseRefName,statusCheckRollup
```

Extract the `ci` job's `detailsUrl` and get the run ID (the number after `runs/`).

### Step 2: Get CI log URL from GitHub Actions
```bash
gh run view $RUN_ID --repo AztecProtocol/aztec-packages --log 2>&1 | grep -i "CI run log id"
```

This returns a URL like `http://ci.aztec-labs.com/$LOG_ID`.

**IMPORTANT**: If GitHub API fails or the log ID is not found, ask the user for the CI log URL directly.

### Step 3: Download and analyze CI log
```bash
curl -s "http://ci.aztec-labs.com/$LOG_ID.txt" -u aztec:$CI_PASSWORD -o /tmp/$LOG_ID.log
```

**IMPORTANT**: Always use the CI log ID as the filename (e.g., `/tmp/1767639787359.log` for `http://ci.aztec-labs.com/1767639787359`). This avoids conflicts when downloading multiple logs.

**Note**: If CI password is not available from local permissions, ask the user for it.

### Step 4: Determine failure type

Search for the failure location:
```bash
grep -E "compile_all.*failed|test all" /tmp/$LOG_ID.log
```

#### If failure is in `compile_all` (build/format/lint):
1. Find the compile_all log link in the output
2. Download it and check which sub-step failed:
   - `format --check` → failed → **FORMAT ERROR**
   - `yarn tsgo -b --emitDeclarationOnly` → failed → **BUILD ERROR**
   - `lint --check` → failed → **LINT ERROR**
3. Download the failed step's log to get specific error messages

#### If failure is in `test all` (tests):
1. Find the test execution log (grep for `parallel.*run_test_cmd`)
2. Download and search for `FAILED`:
   ```bash
   grep -i "FAILED" /tmp/$TEST_LOG_ID.log
   ```
3. Extract the test file path
4. Classify by path:
   - Path contains `end-to-end` → **E2E TEST**
   - Otherwise → **UNIT TEST**

---

## Phase 2: Checkout Branch & Prepare

### Step 1: Check current branch
```bash
git branch --show-current
```

### Step 2: Checkout the PR branch
```bash
gh pr checkout $ARGUMENTS
```

### Step 3: Check for merge conflicts with base
```bash
git fetch origin $BASE_BRANCH
git rebase origin/$BASE_BRANCH
```

If there are conflicts:
1. Resolve the conflicts
2. `git add .`
3. `git rebase --continue`

**IMPORTANT**: Always REBASE, never merge.

### Step 4: Bootstrap if needed
See CLAUDE.md "When to Run Bootstrap". Only if changes outside `yarn-project`.

---

## Phase 3: Fix Based on Failure Type

Run all from `yarn-project` folder.

| Failure Type | Fix Action |
|-------------|------------|
| **FORMAT** | `./bootstrap.sh format <package-name>` |
| **LINT** | `./bootstrap.sh lint <package-name>` |
| **BUILD** | `yarn tsgo -b --emitDeclarationOnly`, fix errors, repeat |
| **UNIT TEST** | `cd <package> && yarn test <file>`, fix, repeat for each |
| **E2E TEST** | Same but `yarn test:e2e`. For complex failures use `e2e-test-debugger` agent |

---

## Phase 4: Verify & Push

1. Run quality checklist (see CLAUDE.md "Before Committing")
2. Amend and push (see CLAUDE.md "Fixing PRs")

---

## Reference

- See `CLAUDE.md` for project conventions
- See `e2e-test-debugger` agent for complex e2e failure analysis
- CI logs use basic auth: `-u aztec:$CI_PASSWORD` (place after URL in curl command)
- If CI password is not available from local permissions, ask the user for it
