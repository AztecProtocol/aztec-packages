---
name: iterate-on-pr
description: Iterate on a PR until CI passes. Use when fixing CI failures, debugging test issues, or waiting for CI results. Enforces local testing before pushing.
---

# Iterate on PR

Workflow for getting a PR to green CI.

## Golden Rule

**NEVER push and pray.** Always run the failing test locally first.

## Building

**Full repo build:**
```bash
./bootstrap.sh   # In repo root
```

**Targeted builds:**
```bash
# Project-specific bootstrap scripts
./yarn-project/bootstrap.sh
./barretenberg/bootstrap.sh

# Or use make for specific targets + deps
make <target>   # Check Makefile for available targets
```

## Testing

**Run the exact command CI reports as failed.** These are usually project-specific:
```bash
# Look at CI failure output for the actual command, typically:
./yarn-project/run_tests.sh <test-name>
./barretenberg/run_tests.sh <test-name>

# Or for Jest tests with timeout (hang detection):
timeout 120 yarn test <package> --testNamePattern="<test-name>"
```

Only push when the test passes locally.

## CI Iteration Loop

1. **CI fails** → Read the failure logs (use analyze-logs agent if needed)
2. **Identify root cause** → Understand what broke
3. **Fix locally** → Make the code change
4. **Build** → Run bootstrap.sh or targeted make
5. **Test locally** → Run the exact CI command that failed
6. **Push** → Immediately after local tests pass. Do not ask the user for permission to push.
7. **Monitor CI** → Set up a cron to poll every 5 min until pass/fail
8. **Repeat** if CI fails again

## Monitoring CI

Poll PR checks every 5 minutes:
```bash
gh pr checks <PR_NUMBER> --json name,state | jq '.[] | select(.state != "SUCCESS" and .state != "SKIPPED")'
```

## Handling Flaky Tests

**Do NOT immediately rerun CI.** Follow this process:

1. **Try to replicate locally first** — run the failing test
2. **If it passes locally**: Check if the failure seems related to your changes
3. **Only rerun CI if**: Test passes locally AND failure appears unrelated to your changes
4. **If it fails locally**: Debug and fix it, don't assume it's flaky

## Common Failures

- **Lint errors**: Fix and verify with `yarn lint <package>`
- **Type errors**: Fix and verify with `yarn build` or `tsc --noEmit`
- **Test hangs (Jest)**: Usually resource leaks — check for unclosed handles, missing `.close()` calls
- **Build failures**: Run bootstrap.sh to rebuild everything

## When to Ask for Help

- Architectural decisions ("should I use approach A or B?")
- Unclear requirements
- CI infrastructure issues (not code problems)

Do NOT ask for help with:
- Simple lint/type errors
- Obvious fixes
- Things you can figure out by reading the code
