# VM2 Audit Commit Workflow

## Create Commits and PR

**IMPORTANT**: Always create a PR for audit work, even if no issues are found. Edge case tests are valuable artifacts that should be committed.

**DO NOT COMMIT AUDIT REPORTS** - Audit reports are kept locally and gitignored. They should not be pushed to the repository.

### If issues are found:
1. Write a test that reproduces the bug
2. **CRITICAL: RUN THE TEST TO CONFIRM THE BUG EXISTS** - The test MUST fail before proceeding. If the test passes, either the bug hypothesis is wrong or the test is incorrect. Do not proceed to fix until you have a failing test.
3. **COMMIT THE TEST BEFORE FIXING** - This is especially important for PIL fixes, since `vmp` will regenerate C++ and you need the test committed first to prove the bug existed.
   ```bash
   git commit -m "test: claude-generated negative test for [CONSTRAINT_NAME] under-constraint"
   ```
4. Apply the fix in PIL/simulation/tracegen
5. Run `vmp` to regenerate C++ if PIL was changed
6. Run the test again to verify it now passes
7. Commit the fix separately:
   ```bash
   git commit -m "fix: claude-generated fix for [description]"
   ```
8. Cleanup (documentation, code style)
9. Commit cleanup: `git commit -m "chore: claude-generated cleanup of [component] pre-audit"`

### If no issues are found (clean audit):
1. Commit edge case tests: `git commit -m "test: claude-generated edge case tests for [component] audit"`

### Always create a PR:
- Create a PR with title: `chore: claude-generated [component] audit` or `fix: claude-generated [component] audit fixes`
- Include summary of audit findings (or "No issues found") in PR description
