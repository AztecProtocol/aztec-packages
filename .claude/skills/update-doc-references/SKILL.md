# Update Documentation References

When source files referenced by documentation change in a PR, analyze the
changes and update the affected documentation if needed.

## Workflow

### Step 1: Parse the Prompt

Extract from the dispatch prompt:
- PR number
- PR title
- Changed references (format: `source_file -> doc1, doc2; ...`)

### Step 2: Get PR Details

```bash
gh pr view <PR_NUMBER> --repo AztecProtocol/aztec-packages --json title,body,baseRefName,files,url
```

Get the diff for each changed source file:
```bash
gh pr diff <PR_NUMBER> --repo AztecProtocol/aztec-packages
```

### Step 3: Identify Affected Documentation

The prompt lists which source files changed and which docs reference them.
For each affected doc file, read its frontmatter `references` field to confirm
the mapping using the shared library:

```bash
source docs/scripts/lib/extract_doc_references.sh
```

Or read the frontmatter directly from each doc file.

### Step 4: Analyze Changes

For each affected documentation file:

1. Read the full documentation file
2. Read the diff of its referenced source files
3. Determine if the code changes affect the documentation content

Changes that typically require doc updates:
- API signature changes (function names, parameters, return types)
- Renamed or moved types/structs/traits
- Changed behavior described in the documentation
- Updated code examples that no longer compile or are incorrect
- Removed or added public functions/methods referenced in docs

Changes that typically do NOT require doc updates:
- Internal implementation changes that don't affect the public API
- Performance optimizations with no API change
- Bug fixes that don't change documented behavior
- Refactoring that preserves the same interface

### Step 5: Make Updates

If documentation updates are needed:

1. Use the Edit tool to make precise, minimal changes
2. Only modify content directly affected by the code changes
3. Preserve the existing documentation style and tone
4. Do not make cosmetic changes unrelated to the code changes
5. Do not add or remove sections unless required by the code change
6. Update code examples if the API changed
7. Correct explanations if behavior changed

### Step 6: Create a PR

If changes were made, create a PR:

```bash
BRANCH="docs/update-refs-pr-<PR_NUMBER>"
BASE_BRANCH=$(gh pr view <PR_NUMBER> --repo AztecProtocol/aztec-packages --json baseRefName -q .baseRefName)
git checkout -b "$BRANCH"
git add -A
git commit -m "docs: update references for PR #<PR_NUMBER>

Auto-generated documentation updates for source file changes in PR #<PR_NUMBER>.

Co-Authored-By: Claude <noreply@anthropic.com>"
git push -u origin "$BRANCH"

gh pr create \
  --base "$BASE_BRANCH" \
  --title "docs: update references for PR #<PR_NUMBER>" \
  --body "## Summary
- Auto-generated documentation updates triggered by source file changes in #<PR_NUMBER>
- <list of changes made>

## Test plan
- [ ] Review documentation changes for accuracy
- [ ] Verify code examples are correct"
```

### Step 7: Report to Slack

**Always** post results to the Slack thread (via the link provided in the dispatch).
Use the Slack link from the dispatch to thread the reply.

**If no changes needed:**
Post a message stating that the documentation is still accurate and no updates
are required, listing which files were analyzed.

**If changes were made:**
1. Include the full `git diff` of all documentation changes in the Slack message
   (formatted as a code block). This ensures devrel can review and manually apply
   changes even if the PR creation failed.
2. If the PR was created successfully, include a link to it.
3. If the PR creation failed (e.g. permission issues), note the failure and
   emphasize the diff in the message so devrel can apply changes manually.

## Guidelines

- Only update docs where code changes actually affect documented content
- Keep updates minimal and focused on the code change
- Preserve existing documentation style
- Do not make cosmetic changes unrelated to the code changes
- If no documentation changes are needed, report that clearly
- When updating code examples, ensure they remain syntactically correct
- Do not update version numbers or dates unless explicitly part of the code change
