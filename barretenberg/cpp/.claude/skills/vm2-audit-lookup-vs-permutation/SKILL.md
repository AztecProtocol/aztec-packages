---
name: vm2-audit-lookup-vs-permutation
description: Audit VM2/AVM PIL files for lookup vs permutation misuse. Critical soundness issue where lookups are used when permutations are required for operations with side effects, allowing duplicate operations, extra insertions, or skipped operations.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
---

# VM2 Lookup vs Permutation Audit

Detect misuse of lookups (many-to-one) vs permutations (bijection). Using lookups on side-effectful operations allows duplicate/skipped operations.

## When to Use
- Auditing PIL files for interaction correctness
- Reviewing memory, emission, or dispatch operations
- Validating side-effectful operations use permutations

## When NOT to Use
- Auditing precomputed table lookups (those are correct)
- Reviewing pure computation without side effects

## Severity Assessment

- **Soundness**: Typically Critical/High - malicious prover can duplicate or skip operations
- **Completeness**: Low to Critical based on reachability via canonical simulation

## Workflow

### Step 1: Find All Interactions
```bash
grep -n "} in \|} permute " pil/vm2/<component>.pil
```

### Step 2: Classify Each Lookup Destination

**MUST use `permute` (side-effectful)**:
- Memory read/write
- State tree operations (storage)
- Emissions (nullifiers, note hashes, logs, L2-to-L1)
- Call dispatch/return
- Any external state changes

**Can use `in` (pure/precomputed)**:
- Range check tables (U8, U16, etc.)
- Constant/precomputed tables
- Pure function results

### Step 3: Check Suspicious Lookups
```bash
# Memory interactions using lookup (suspicious)
grep -n "memory\." pil/vm2/<component>.pil | grep "} in "

# Emission interactions using lookup (suspicious)
grep -n "emit\|append\|nullifier\|note_hash" pil/vm2/<component>.pil | grep "} in "

# Dispatch interactions using lookup (suspicious)
grep -n "call\|dispatch\|execution" pil/vm2/<component>.pil | grep "} in "
```

### Step 4: Verify Permutation Counts Match
For permutations, source count must equal destination count (check tracegen).

## Vulnerable Patterns

```pil
// VULNERABLE: Lookup for memory (allows duplicate reads/writes)
sel_mem { addr, value } in memory.sel { ... };

// VULNERABLE: Lookup for dispatch (allows extra calls)
sel_dispatch { call_id, args } in execution.sel { ... };

// VULNERABLE: Lookup for emission (allows duplicate nullifiers)
sel_emit { nullifier } in nullifier_trace.sel { ... };
```

## Secure Patterns

```pil
// SECURE: Permutation for memory
sel_mem { clk, addr, value } permute memory.sel { ... };

// SECURE: Permutation for dispatch
sel_dispatch { call_id, args } permute execution.sel { ... };

// SECURE: Lookup for range checks (precomputed, no side effects)
sel { value } in range_check.sel { range_check.value };
```

## Real Example: PR #18336

```pil
// BEFORE (vulnerable)
#[DISPATCH_PUBLIC_CALL]
sel_dispatch { call_id, args } in execution.sel { ... };

// AFTER (secure)
#[DISPATCH_PUBLIC_CALL]
sel_dispatch { call_id, args } permute execution.sel { ... };
```
**Impact**: Could insert extra public call requests.

## Output Format

### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-lookup-vs-permutation` |
| Target | `{path}` |
| Files Scanned | `{N}` |
| Findings | `{e.g., "2 Critical" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

### Finding Format
- **ID**: `vm2-audit-lookup-vs-permutation-{filename}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON Output (write to specified path)

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
