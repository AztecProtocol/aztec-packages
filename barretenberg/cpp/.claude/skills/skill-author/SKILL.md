---
name: skill-author
description: Create or update Claude Code skills following best practices. Use when user asks to create a skill, update a skill, improve skill quality, or debug skill triggering issues. Also use when user references a SKILL.md file for editing, critique, or review.
version: 1.0.0
---

# Skill Author

## Purpose
Create and maintain effective Claude Code skills with proper structure, concise instructions, and reliable triggering.

## When to Use
- User asks to create a new skill
- User wants to update or improve an existing skill
- Skill is not triggering correctly
- Skill instructions are too verbose or unclear
- User references a SKILL.md file for editing, critique, or review
- User asks to "improve", "critique", "review", or "fix" a skill
- User mentions `.claude/skills/` path with intent to modify

## When NOT to Use
- General coding tasks unrelated to skill authoring
- Questions about Claude Code features (use documentation instead)

## Workflow

### Creating a New Skill
1. **Identify the domain and action**: `domain-action` naming (e.g., `pdf-extract`, `git-release-notes`)
2. **Create directory** (project-local; use `~/.claude/skills/` for global):
   ```bash
   mkdir -p .claude/skills/<skill-name>/
   ```
3. **Write SKILL.md** with required frontmatter and focused body
4. **Test triggering** with representative queries
5. **Iterate** based on failures

### Updating an Existing Skill
1. **Read current SKILL.md** completely
2. **Identify issues**: triggering, verbosity, clarity, missing guidance
3. **Apply minimal fixes** - challenge every token added
4. **Move stable content to references/** if SKILL.md is growing

## SKILL.md Template

```markdown
---
name: domain-action
description: "<What it does in third person>. Use when <trigger conditions>."
# allowed-tools: [Read, Write, Bash]  # optional - omit for all tools
version: 1.0.0
---

# Skill Name

## Purpose
One sentence.

## When to Use
- Trigger condition 1
- Trigger condition 2

## When NOT to Use
- Non-trigger (use X instead)

## Workflow
1. Step with verification
2. Step with verification

## Inputs Expected (optional)
- File types, repo state, commands

## Outputs Produced (optional)
- Artifacts, files changed, format
```

## Critical Rules

### Description Field
- Third person voice
- Include BOTH what AND when
- Keep concise (platform limits apply - verify in docs if unsure)
- Good: "Extract text from PDFs. Use when working with PDF files or document extraction."
- Bad: "Helps with documents." (too vague, no trigger context)

### Frontmatter Constraints
- `name`: lowercase, hyphens only, short, no underscores
- `description`: non-empty, concise
- `allowed-tools`: YAML list `[Read, Write, Bash]` if restricting (omit for all tools)

### Conciseness
- Every token must earn its place
- Ask: "Does Claude need this explanation?"
- Move details to `references/` subdirectory (also helps caching)
- Target: minimum instructions that fix observed failures

### User Intent
- Never hardcode behavior that overrides user requests
- If skill conflicts with user instruction, ask for clarification

### References
- Keep ONE level deep from SKILL.md
- Add explicit read instructions: "Open `references/X.md` and follow..."
- Don't nest: `SKILL.md -> ref.md` good, `SKILL.md -> a.md -> b.md` bad

### Scripts (if needed)
- Place in `scripts/` subdirectory
- Make idempotent (safe to re-run)
- Document dependencies (`requirements.txt` for Python, equivalent for other runtimes)
- Use clear stdout/stderr/exit code conventions

## Anti-Patterns to Avoid
- Vague descriptions ("helps with documents")
- Over-explaining what Claude knows
- Multiple options without clear default
- Deep reference nesting
- Time-sensitive content
- Magic constants in scripts
- Hardcoded secrets/API keys in examples or scripts
- Windows paths (`scripts\helper.py` - use forward slashes)
- Inconsistent terminology (pick one term, use it everywhere)

## Verification
Before presenting the skill, analyze against these criteria:
1. Does the description match intended queries? (test with examples)
2. Does the description avoid unintended matches?
3. Are instructions minimal yet sufficient?
4. Test across model tiers if possible (Haiku: enough guidance? Opus: not over-explaining?)
