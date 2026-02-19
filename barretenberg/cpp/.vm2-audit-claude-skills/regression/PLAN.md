# Skill Regression Testing Plan

Test each audit skill against known historical bugs to measure detection rates, false positive rates, and coverage gaps.

## Approach

Test against a single **pre-audit baseline commit** (before the audit effort started). For bugs introduced after that baseline, use per-bug commit overrides.

## Data Model

**`bugs.json`** — the central registry of known bugs:

```json
{
  "baseline_commit": "abc123...",
  "baseline_date": "2025-10-01",
  "bugs": [
    {
      "id": "poseidon2-start-row",
      "title": "Poseidon2 start row vulnerability",
      "pr": "https://github.com/AztecProtocol/aztec-packages/pull/XXXX",
      "commit_before": "def456...",
      "commit_after": "789abc...",
      "files": ["pil/vm2/poseidon2_hash.pil"],
      "description": "Missing constraint on start row allows...",
      "severity": "critical",
      "introduced_after_baseline": false,
      "skills": ["vm2-audit-t1-unprotected-destination-selector", "vm2-audit-t2-missing-propagation"],
      "expected_findings": {
        "vm2-audit-t1-unprotected-destination-selector": {
          "min_severity": "high",
          "keywords": ["poseidon2", "start"]
        },
        "vm2-audit-t2-missing-propagation": {
          "min_severity": "medium",
          "keywords": ["poseidon2", "propagat"]
        }
      }
    }
  ]
}
```

Key fields:
- **`commit_before`**: last commit before the fix landed (used for `introduced_after_baseline` bugs)
- **`introduced_after_baseline`**: if `true`, check out `commit_before` instead of the baseline commit
- **`skills`**: which skills should detect this bug
- **`expected_findings`**: per-skill expectations — minimum severity and keywords to match in the finding description

## Directory Structure

```
.vm2-audit-claude-skills/
├── skills/                    # existing skill definitions
├── scripts/                   # existing batch runner
├── regression/
│   ├── PLAN.md                # this file
│   ├── bugs.json              # bug registry
│   ├── run-regression.sh      # main regression script
│   ├── results/               # output (gitignored)
│   │   ├── <skill>--<bug-id>/
│   │   │   ├── audit.md       # raw skill output
│   │   │   ├── audit.json     # structured findings
│   │   │   └── verdict.json   # pass/fail + analysis
│   │   └── REPORT.md          # aggregate report
│   └── .workdir/              # temp clone/worktree (gitignored)
```

## Script: `run-regression.sh`

### Usage

```bash
# Test all skills against all their mapped bugs
./run-regression.sh

# Test a specific skill against its bugs
./run-regression.sh --skill vm2-audit-t1-missing-boolean

# Test a specific bug against all mapped skills
./run-regression.sh --bug poseidon2-start-row

# Test one skill against one bug
./run-regression.sh --skill vm2-audit-t1-missing-boolean --bug poseidon2-start-row

# Use a specific model
./run-regression.sh --model opus

# Parallelism
./run-regression.sh --jobs 3
```

### Algorithm per (skill, bug) pair

1. **Determine checkout commit**: If `introduced_after_baseline`, use `commit_before`. Otherwise, use `baseline_commit`.
2. **Prepare workdir**: If `.workdir/` doesn't exist, create a git worktree (or shallow clone). Check out the target commit. Copy the current `.vm2-audit-claude-skills/` into the workdir (skills don't exist in old commits).
3. **Run the skill**: Invoke `run-vm2-audits.sh --skill <skill> --target pil/vm2` from the workdir. Use `--no-summarize` since we only need raw per-skill output.
4. **Evaluate output**: Parse the JSON findings and check:
   - **Detection**: Did any finding reference the expected files and match the keywords?
   - **Severity**: Was the finding severity >= `min_severity`?
   - **False positives**: Count findings that don't match any known bug for this commit.
5. **Write verdict**: `verdict.json` with pass/fail, matched findings, unmatched findings, severity accuracy.

### Workdir Management

- Use `git worktree add` to avoid a full clone — worktrees share the object store with the main repo.
- Group tests by commit: all (skill, bug) pairs that target the same commit share one checkout.
- Add `.workdir/` and `results/` to `.gitignore`.

## Aggregate Report

After all (skill, bug) pairs are tested, generate `REPORT.md`:

```markdown
## Per-Skill Scorecards

### vm2-audit-t1-missing-boolean
| Bug ID | Detected? | Severity Match? | False Positives |
|--------|-----------|-----------------|-----------------|
| alu-sel-unconstrained | YES | YES (Critical) | 1 |
| ecc-mem-sel-missing | YES | NO (Medium vs High) | 0 |
| **Total** | **2/2 (100%)** | **1/2 (50%)** | **1** |

### vm2-audit-t2-missing-propagation
| Bug ID | Detected? | Severity Match? | False Positives |
|--------|-----------|-----------------|-----------------|
| data-copy-context-id | YES | YES (Critical) | 0 |
| poseidon2-start-row | NO | — | 3 |
| **Total** | **1/2 (50%)** | **1/1 (100%)** | **3** |

... (one section per skill that has mapped bugs)

## Coverage Summary

- **Per-skill detection rates**: Each skill's hit rate against its expected bugs
- **Skills below 80% detection**: [list] → skill needs improvement
- **Skills with 0 detections**: [list] → skill may be ineffective
- **Bugs with 0 detecting skills**: [list] → need new skills or bug-to-skill mapping update
- **Uncovered bug categories**: Bugs not mapped to any skill → may need new skills

## False Positive Analysis

- Skill with most FPs: ...
- Common FP patterns: ...
- FP rate per skill: findings not matching any known bug / total findings
```

## Building `bugs.json`

### Step 1: Mine PRs

Query GitHub for merged PRs touching `pil/vm2/` or `src/barretenberg/vm2/` in the last 6 months:

```bash
gh pr list --repo AztecProtocol/aztec-packages \
  --state merged --limit 500 \
  --json number,title,mergedAt,url \
  --search "path:barretenberg/cpp/pil/vm2/ merged:>2025-08-01"
```

Not all fixes say "fix" or "bug" in the title — review each PR that modifies constraints.

### Step 2: Classify each PR

For each PR, determine: bug fix? new feature? refactor? Only bug fixes go in `bugs.json`.

### Step 3: Record bug metadata

For each bug fix PR:
- PR link and merge commit
- Parent commit (`commit_before` = merge_commit~1, or the base branch commit before merge)
- Which PIL files were changed
- 1-2 sentence vulnerability description
- Severity (critical/high/medium/low)
- Which skills should detect it

### Step 4: Choose baseline commit

Pick a commit from before the audit effort started (~4-6 months ago). All bugs present at that commit can be tested with one worktree checkout.

### Step 5: Flag post-baseline introductions

If a bug was introduced by a PR that landed after the baseline, mark `introduced_after_baseline: true`. These get tested against their specific `commit_before` instead of the baseline.

**Discovery approach**: If a skill can't find a bug on the baseline commit, investigate whether the bug existed at that point. If the relevant code didn't exist yet, it was introduced after baseline → flag it.

## Edge Cases

- **Bug in tracegen, not PIL**: Map only to skills like `t1-tracegen-pil-alignment` that cross-reference C++ code.
- **Bug spans multiple files**: List all affected files. Detection in any one counts as a hit.
- **Skill describes the bug differently**: Keyword matching is any-of (not all-of). Use multiple keywords per bug.
- **PIL structure changed between baseline and now**: If files were renamed or restructured, document these cases. The skill may need to be pointed at the old file path.
- **Bug was a missing constraint (not a wrong constraint)**: The "before" state simply lacks lines. Skills need to detect the absence.

## Next Steps

1. **Build `bugs.json`** — mine PRs from GitHub, classify, record metadata
2. **Write `run-regression.sh`** — orchestration script
3. **Run initial regression** — start with a few bugs to validate the approach
4. **Iterate** — refine skill mappings, add missing skills, tune keyword matching
