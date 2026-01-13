---
name: vm2-audit-precomputed-table-completeness
description: Audit VM2/AVM precomputed trace tables for missing entries. Completeness issue where precomputed tables skip edge cases (index 0, 1, max) or invalid-but-queryable values, causing lookup failures when execution trace queries those indices.
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
version: 1.0.0
---

# VM2 Precomputed Table Completeness Audit

## Purpose
Detect missing precomputed table entries that cause lookup failures when execution trace queries edge cases or error paths.

## When to Use
- Auditing precomputed trace generation
- Reviewing changes to `precomputed_trace.cpp`
- Investigating lookup failures in tests

## When NOT to Use
- Runtime trace issues (use tracegen-pil-alignment skill)
- PIL constraint audits (use other vm2-audit skills)

## Severity Assessment

**Completeness issue** - honest prover fails on valid inputs.

- **Critical**: Reachable via canonical simulation on valid inputs - system broken
- **High**: Reachable via unusual but valid inputs
- **Medium**: Theoretical edge cases
- **Low**: Unreachable in practice

## The Bug Pattern

Precomputed tables generated at startup. If they skip indices, lookups fail:

```cpp
// BUG: Skips radix=0,1 (p_limbs_per_radix[0,1] are empty)
for (size_t i = 0; i < p_limbs_per_radix.size(); ++i) {
    if (p_limbs_per_radix[i].size() > 0) {  // SKIPS i=0,1!
        trace.set(C::precomputed_sel_to_radix_p_limb_counts, i, 1);
    }
}
// ToRadix with radix=1 (invalid) still does gas lookup at index 1
// Lookup fails because row 1 has sel=0!
```

## Workflow

### Step 1: Find Precomputed Tables and Their Lookups

```bash
# Precomputed trace generation
cat barretenberg/cpp/src/barretenberg/vm2/tracegen/precomputed_trace.cpp

# Lookups INTO precomputed tables
grep -rnE '}\s*(in|is)\s+precomputed\.' barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 2: For Each Table, Check Population vs Query Range

For each precomputed selector/table:
1. **What indices can be queried?** (Check lookup source - often opcode index, radix value, etc.)
2. **Does population cover ALL queryable indices?** Including 0, 1, max, and error inputs
3. **Any conditional population that skips entries?**

```bash
# Find conditional population (potential skips)
grep -n "if.*size\|if.*len\|continue" \
    barretenberg/cpp/src/barretenberg/vm2/tracegen/precomputed_trace.cpp
```

### Step 3: Check Edge Cases

- **Index 0**: Often skipped by `if (size > 0)` guards
- **Index 1**: Similar issue
- **Max index**: Boundary conditions
- **Invalid inputs**: Error paths still do lookups before erroring

## Vulnerable Patterns

### Skip Zero/Edge Cases
```cpp
// VULNERABLE
for (size_t i = 0; i < table.size(); ++i) {
    if (table[i].size() > 0) {  // Skips empty entries!
        trace.set(C::precomputed_sel, i, 1);
    }
}
```

### Invalid Input Not Populated
```cpp
// VULNERABLE: Only populates valid radix (2-256)
for (size_t radix = 2; radix <= 256; ++radix) {
    trace.set(C::precomputed_sel_radix, radix, 1);
}
// Execution can query radix=0,1 during error path!
```

### Secure: Populate All Queryable Indices
```cpp
// SECURE: Always set selector, use fallback for invalid
for (size_t i = 0; i < table.size(); ++i) {
    trace.set(C::precomputed_sel, i, 1);  // Always
    trace.set(C::precomputed_value, i,
              table[i].size() > 0 ? table[i].size() - 1 : 0);
}
```

## Real Bug Example: ToRadix P-Limbs (PR #19266)

```cpp
// BEFORE (BUG)
for (size_t i = 0; i < p_limbs_per_radix.size(); ++i) {
    size_t decomposition_len = p_limbs_per_radix[i].size();
    if (decomposition_len > 0) {  // Skips i=0,1!
        trace.set(C::precomputed_sel_to_radix_p_limb_counts, i, 1);
    }
}

// AFTER (FIX)
for (size_t i = 0; i < p_limbs_per_radix.size(); ++i) {
    size_t decomposition_len = p_limbs_per_radix[i].size();
    trace.set(C::precomputed_sel_to_radix_p_limb_counts, i, 1);  // Always
    trace.set(C::precomputed_to_radix_safe_limbs, i,
              decomposition_len > 0 ? decomposition_len - 1 : 0);
}
```

**Why missed by tests**: Only manifests when invalid radix (0/1) used with FULL precomputed and execution traces.

## Key Files

- `src/barretenberg/vm2/tracegen/precomputed_trace.cpp` - Precomputed generation
- `pil/vm2/precomputed.pil` - Column definitions
- `pil/vm2/execution.pil` - Gas lookups

## Checklist

Before marking a table safe:
- [ ] Populates index 0?
- [ ] Populates index 1?
- [ ] Populates max valid index?
- [ ] Populates indices for invalid/error inputs?
- [ ] No `if (size > 0)` guards that skip entries?

## Output Format

### 1. Markdown Report

| Item | Value |
|------|-------|
| Skill | `vm2-audit-precomputed-table-completeness` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

**Finding format**:
- **ID**: `vm2-audit-precomputed-table-completeness-{filename}-{line}-{issue}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.cpp:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED)

Write to output directory specified in audit prompt:

```json
{
  "skill": "vm2-audit-precomputed-table-completeness",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-precomputed-table-completeness-filename-123-issue",
      "severity": "medium",
      "file": "path/to/file.cpp",
      "line": 123,
      "description": "Brief description",
      "exploitability": "low",
      "fix": "Suggested fix"
    }
  ]
}
```
