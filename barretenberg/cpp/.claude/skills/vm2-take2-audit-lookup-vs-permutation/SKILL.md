---
name: vm2-audit-lookup-vs-permutation
description: Audit VM2/AVM PIL files for lookup vs permutation misuse. Critical soundness issue where lookups are used when permutations are required for operations with side effects, allowing duplicate operations, extra insertions, or skipped operations.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Lookup vs Permutation Audit

Audits for lookup vs permutation misuse. Lookups (many-to-one) vs Permutations (bijection). Using lookups on side-effectful operations allows duplicate/skipped operations.

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

### Summary Table

| Item | Value |
|------|-------|
| Skill | `{skill-name}` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Findings Format

- **ID**: `{skill-name}-{file}-{line}-{subtype}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### Machine-Readable JSON (REQUIRED)

<!-- MACHINE-READABLE FINDINGS -->
```json
{
  "skill": "{skill-name}",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "{skill-name}-{file}-{line}-{subtype}",
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
<!-- END MACHINE-READABLE FINDINGS -->

For no findings:
<!-- MACHINE-READABLE FINDINGS -->
```json
{
  "skill": "{skill-name}",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```
<!-- END MACHINE-READABLE FINDINGS -->
