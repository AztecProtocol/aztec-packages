---
name: vm2-audit-t1-lookup-vs-permutation
description: Audit VM2/AVM PIL files for lookup vs permutation misuse. Critical soundness issue where lookups are used when permutations are required for operations with side effects, allowing duplicate operations, extra insertions, or skipped operations.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Lookup vs Permutation Audit

## Purpose
Detect lookup/permutation misuse in PIL. Lookups (many-to-one) allow duplicate/skipped operations; Permutations (bijection) enforce 1:1 matching required for side effects.

## AUDITOR DOCTRINE — READ THIS FIRST

You are a **prosecutor**, not a defense attorney. Your job is to find and report vulnerabilities.

**RULE 1 — Report first, dismiss later.** Every `} in` (lookup) where the destination involves state or side effects is a PRELIMINARY FINDING. Report ALL of them first, then only remove in a final pass.

**RULE 2 — No freeform safety arguments.** You may ONLY dismiss a finding if:
  - (a) **Destination is a precomputed/range-check table**: The destination is provably read-only with no state mutation (quote the destination namespace and show it's precomputed).
  - (b) **Lookup is intentionally many-to-one**: The design explicitly requires many sources to map to one destination row, and you can explain why duplicate operations are harmless in this context (quote the specific interaction and explain).
  You MUST NOT invent novel "it's safe because..." reasoning.

**RULE 3 — Quote or report.** For ANY dismissal, quote the EXACT interaction line and destination file proving it's safe.

**RULE 4 — Severity floor.** When in doubt, report as **High**. Only downgrade with evidence the interaction cannot cause duplicate/skipped side effects. Do NOT downgrade to Low or Medium based on vague "likely safe by design" reasoning — if a lookup is used where a permutation is needed, the default is High even if root-chaining provides partial mitigation.

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

### Step 1: Exhaustive Interaction Enumeration

> **CRITICAL**: Enumerate ALL interactions across ALL PIL files in one pass. Do not limit to a single component.

```bash
# Find ALL lookups across the entire codebase
grep -rn "} in " pil/vm2/ --include="*.pil"

# Find ALL permutations across the entire codebase
grep -rn "} is " pil/vm2/ --include="*.pil"
```

Build a complete table of every interaction:

| File:Line | Interaction Name | Type (in/is) | Destination | Side-Effect? |
|-----------|-----------------|--------------|-------------|-------------|

**Classification Rule:**

| Destination | Correct Interaction |
|-------------|---------------------|
| Range check, precomputed constants | Lookup (`in`) |
| Memory, state trees, emissions, calls, context stack, dispatch | **Permutation** (`is`) |
| **Any stack push/pop interaction** | **Permutation** (`is`) — stacks MUST enforce 1:1 correspondence |

### Step 2: Flag Misuses

From the table above, every `} in` (lookup) where the destination involves state/side-effects is a potential finding:

```bash
# Quick filter for high-value targets
grep -rn "memory\.\|emit\|nullifier\|note_hash\|context_stack\|call_stack\|public_data\|tree_check\|stack" pil/vm2/ --include="*.pil" | grep "} in "
```

Any `} in ` for memory/emission/call/tree/stack operations is a finding.

**Stack pattern rule**: Any interaction that pushes to or pops from a stack (context stack, call stack, internal call stack) MUST be a permutation. A lookup allows duplicating pushes or skipping pops, breaking stack integrity. Flag ALL stack-related lookups.

### Step 3: Exhaustive File Coverage (MANDATORY)

Enumerate ALL PIL files to ensure no file is missed:
```bash
find pil/vm2/ -name "*.pil" | sort
```

Cross-reference this complete list against the files that appeared in Step 1 grep results. For any file NOT appearing in the grep output, read it and manually check for interactions. Files like `context_stack.pil`, `tx.pil`, and other dispatch/coordination files may use non-standard interaction patterns.

### Step 4: Coverage Assertion (MANDATORY)

At the end, assert: "I examined N total interactions across M files. K were lookups, J were permutations. I flagged F lookups as potential findings." If N < total interactions in codebase, explain which files were not reached.

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

## Illustrative Example: Dispatch Interaction Misuse
```pil
// VULNERABLE: Could insert extra dispatch requests
sel_dispatch { ... } in handler.sel { ... };

// SECURE: Permutation enforces 1:1
sel_dispatch { ... } permute handler.sel { ... };
```

## Output Format

### 1. Markdown Report (stdout)

**Summary Table:**
| Item | Value |
|------|-------|
| Skill | `vm2-audit-t1-lookup-vs-permutation` |
| Target | `{path}` |
| Files Scanned | `{N}` |
| Findings | `{e.g., "2 Critical" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

**Finding Format:**
- **ID**: `vm2-audit-t1-lookup-vs-permutation-{filename}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (required)

Write `vm2-audit-t1-lookup-vs-permutation.json` to the specified output directory:

```json
{
  "skill": "vm2-audit-t1-lookup-vs-permutation",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-t1-lookup-vs-permutation-filename-123-issue",
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
