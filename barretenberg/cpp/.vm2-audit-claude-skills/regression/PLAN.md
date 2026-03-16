# Skill Regression Testing Plan

Test each audit skill against known historical bugs to measure detection rates, false positive rates, and coverage gaps.

## Approach — Per-File Mode

Each skill runs **once per PIL file**, targeting a single gadget per Claude session. For regression testing, we only run skills against PIL files that are relevant to at least one known bug mapped to that skill. This keeps the session count manageable while testing focused detection.

A bug is "detected" if ANY per-file run for that skill finds it — e.g., if a bug spans `tx.pil` and `discard.pil`, the skill running on either file can detect it.

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
      "skills": ["vm2-audit-t1-unprotected-destination-selector"],
      "expected_findings": {
        "vm2-audit-t1-unprotected-destination-selector": {
          "min_severity": "high",
          "keywords": ["poseidon2", "start"]
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
- **`expected_findings`**: per-skill expectations — minimum severity and keywords to match
- **`pil_targets`** (optional): override which PIL files to audit. If absent, derived from `files[]` by filtering for `.pil` extensions. Required for bugs that only reference C++ files.

## Directory Structure

```
.vm2-audit-claude-skills/
├── skills/                    # existing skill definitions
├── scripts/                   # batch runner + summarizer
├── regression/
│   ├── PLAN.md                # this file
│   ├── bugs.json              # bug registry
│   ├── run-regression.sh      # main regression script
│   ├── results/               # output (gitignored)
│   │   ├── {skill}--{pil_key}--{commit_short}/
│   │   │   ├── audit.md       # raw skill output
│   │   │   ├── audit.json     # structured findings
│   │   │   ├── run-meta.json  # status + duration
│   │   │   └── verdict-{bug}.json  # per-bug pass/fail
│   │   └── REPORT.md          # aggregate report
│   └── .workdir/              # temp worktrees (gitignored)
```

## Script: `run-regression.sh`

### Usage

```bash
# Test all skills against all their mapped bugs
./run-regression.sh

# Test Tier 1 skills only (recommended starting point)
./run-regression.sh -T 1

# Test a specific skill against its bugs
./run-regression.sh --skill vm2-audit-t1-missing-boolean

# Test a specific bug against all mapped skills
./run-regression.sh --bug poseidon2-start-row

# Use a specific model
./run-regression.sh --model opus

# Parallelism
./run-regression.sh --jobs 8

# List all runs that would happen
./run-regression.sh --list -T 1

# Regenerate report from existing results
./run-regression.sh --report-only
```

### Algorithm per (skill, pil_file, commit) run

1. **Determine checkout commit**: If `introduced_after_baseline`, use `commit_before`. Otherwise, use `baseline_commit`.
2. **Prepare workdir**: Create a git worktree at the target commit. Copy current skills into the workdir.
3. **Run the skill**: Invoke `claude -p` with the skill's SKILL.md focused on the specific PIL file. The prompt instructs the session to:
   - Read the target PIL file first
   - Check C++ siblings (simulation, tracegen, events)
   - Read related PIL files for interaction context
4. **Evaluate output**: Parse the JSON findings and check against each bug mapped to this (skill, pil_file):
   - **Detection**: Did any finding reference the expected files and match the keywords?
   - **Severity**: Was the finding severity >= `min_severity`?
5. **Write verdict**: `verdict-{bug_id}.json` per bug, plus `run-verdict.json` summary.

### Aggregation

A bug is "detected" for a skill if ANY per-file run for that skill detects it. The report shows:
- Per-skill scorecards with which PIL file triggered detection
- Coverage summary (skills below 80%, undetected bugs)

## Aggregate Report

After all runs complete, `REPORT.md` is generated:

```markdown
## Per-Skill Scorecards

### vm2-audit-t1-missing-boolean

| Bug ID | Detected? | Severity Match? | Detecting File |
|--------|-----------|-----------------|----------------|
| alu-missing-booleans-shift | YES | YES (Critical) | alu |
| ecc-mem-sel-missing | YES | NO (Medium) | ecc_mem |
| **Total** | **2/2 (100%)** | **1** | |

## Coverage Summary
- Skills below 80% detection: [list]
- Bugs not detected by any skill: [list]
```

## PIL Key Convention

PIL file paths are converted to keys for directory/file naming:
- `pil/vm2/alu.pil` → `alu`
- `pil/vm2/bytecode/bc_hashing.pil` → `bytecode__bc_hashing`
- `pil/vm2/execution/addressing.pil` → `execution__addressing`
