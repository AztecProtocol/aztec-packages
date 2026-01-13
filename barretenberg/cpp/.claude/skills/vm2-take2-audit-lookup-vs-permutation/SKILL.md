---
name: vm2-audit-lookup-vs-permutation
description: Audit VM2/AVM PIL files for lookup vs permutation misuse. Critical soundness issue where lookups are used when permutations are required for operations with side effects, allowing duplicate operations, extra insertions, or skipped operations.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Lookup vs Permutation Audit

Audits for lookup vs permutation misuse. Lookups (many-to-one) vs Permutations (bijection). Using lookups on side-effectful operations allows duplicate/skipped operations.

## Severity Assessment

**Assess severity case-by-case** based on impact and reachability:

- **Soundness** (malicious prover exploits): Typically Critical/High based on exploitability
- **Completeness** (honest prover fails): Ranges from Low (theoretical/unreachable) to Critical (blocks valid inputs)

**Key principle**: Completeness bugs reachable via canonical simulation and tracegen on valid inputs are **Critical** - the system doesn't work.

## Instructions

> **Note**: Use `find pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Find All Interactions and Classify

```bash
# Find all lookups and permutations
grep -n "} in \|} permute " pil/vm2/<component>.pil
```

For each interaction, classify the destination:

| Destination Type | Correct Interaction |
|------------------|---------------------|
| Range check table | Lookup (`in`) |
| Precomputed constants | Lookup (`in`) |
| Memory operations | **Permutation** (`permute`) |
| State tree operations | **Permutation** (`permute`) |
| Emissions (nullifiers, notes) | **Permutation** (`permute`) |
| Call dispatch/return | **Permutation** (`permute`) |

### Step 2: Verify Side-Effectful Use Permutations

```bash
# Find memory-related lookups (should be permutations!)
grep -rn "memory\." pil/vm2/ --include="*.pil" | grep "} in "

# Find emission-related lookups
grep -rn "emit\|nullifier\|note_hash" pil/vm2/ --include="*.pil" | grep "} in "
```

Any `} in ` for memory/emission/call operations is a finding.

## Patterns

### Vulnerable: Lookup for Memory
```pil
sel_mem { addr, value } in memory.sel { ... };  // WRONG!
```

### Secure: Permutation for Memory
```pil
sel_mem { addr, value } permute memory.sel { ... };  // Correct
```

### Valid: Lookup for Range Check
```pil
sel { value } in range_check.sel { ... };  // OK - precomputed table
```

## Examples

### Example 1: TX Public Call Dispatch (PR #18336)
```pil
// BEFORE: Could insert extra public call requests
sel_dispatch { ... } in execution.sel { ... };

// AFTER: Permutation enforces 1:1
sel_dispatch { ... } permute execution.sel { ... };
```

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-lookup-vs-permutation` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `vm2-audit-lookup-vs-permutation-filename-123-issue-type` (MUST use full skill name: `vm2-audit-lookup-vs-permutation`)
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write a `vm2-audit-lookup-vs-permutation.json` file to the output directory with:

```json
{
  "skill": "vm2-audit-lookup-vs-permutation",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-lookup-vs-permutation-filename-123-issue-type",
      "severity": "critical",
      "file": "path/to/file.pil",
      "line": 123,
      "description": "Brief description",
      "exploitability": "high",
      "fix": "Suggested fix"
    }
  ]
}
```

For no findings:
```json
{
  "skill": "vm2-audit-lookup-vs-permutation",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```

**IMPORTANT**: The audit prompt will specify where to write the JSON file. Use the Write tool to create the JSON at that path.