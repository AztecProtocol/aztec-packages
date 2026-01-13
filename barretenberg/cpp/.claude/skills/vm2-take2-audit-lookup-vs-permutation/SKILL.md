---
name: vm2-take2-audit-lookup-vs-permutation
description: Audit VM2/AVM PIL files for lookup vs permutation misuse. Critical soundness issue where lookups are used when permutations are required for operations with side effects, allowing duplicate operations, extra insertions, or skipped operations.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Lookup vs Permutation Audit

## Purpose
Detect lookup/permutation misuse in PIL. Lookups (many-to-one) allow duplicate/skipped operations; Permutations (bijection) enforce 1:1 matching required for side effects.

## When to Use
- Auditing PIL files for soundness issues
- Reviewing interactions between VM components
- User asks about lookup vs permutation correctness

## When NOT to Use
- General PIL constraint analysis (use other audit skills)
- Range check or precomputed table interactions (lookups are correct there)

## Severity Assessment
**Case-by-case** based on impact:
- **Soundness** (malicious prover exploits): Critical/High
- **Completeness** (honest prover fails): Low to Critical depending on reachability

Completeness bugs reachable via canonical simulation on valid inputs are **Critical**.

## Workflow

### Step 1: Find and Classify Interactions
```bash
grep -n "} in \|} permute " pil/vm2/<component>.pil
```

**Classification Rule:**

| Destination | Correct Interaction |
|-------------|---------------------|
| Range check, precomputed constants | Lookup (`in`) |
| Memory, state trees, emissions, calls | **Permutation** (`permute`) |

### Step 2: Flag Misuses
```bash
# Memory lookups (should be permutations)
grep -rn "memory\." pil/vm2/ --include="*.pil" | grep "} in "

# Emission lookups
grep -rn "emit\|nullifier\|note_hash" pil/vm2/ --include="*.pil" | grep "} in "
```

Any `} in ` for memory/emission/call operations is a finding.

## Patterns

**WRONG** - Lookup for side effect:
```pil
sel_mem { addr, value } in memory.sel { ... };
```

**CORRECT** - Permutation for side effect:
```pil
sel_mem { addr, value } permute memory.sel { ... };
```

**OK** - Lookup for precomputed table:
```pil
sel { value } in range_check.sel { ... };
```

## Example: TX Public Call Dispatch (PR #18336)
```pil
// BEFORE: Could insert extra public call requests
sel_dispatch { ... } in execution.sel { ... };

// AFTER: Permutation enforces 1:1
sel_dispatch { ... } permute execution.sel { ... };
```

## Output Format

### 1. Markdown Report (stdout)

**Summary Table:**
| Item | Value |
|------|-------|
| Skill | `vm2-take2-audit-lookup-vs-permutation` |
| Target | `{path}` |
| Files Scanned | `{N}` |
| Findings | `{e.g., "2 Critical" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

**Finding Format:**
- **ID**: `vm2-take2-audit-lookup-vs-permutation-{filename}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (required)

Write `vm2-take2-audit-lookup-vs-permutation.json` to the specified output directory:

```json
{
  "skill": "vm2-take2-audit-lookup-vs-permutation",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-take2-audit-lookup-vs-permutation-filename-123-issue",
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
