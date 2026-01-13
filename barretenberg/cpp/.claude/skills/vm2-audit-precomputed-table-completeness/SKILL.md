---
name: vm2-audit-precomputed-table-completeness
description: Audit VM2/AVM precomputed trace tables for missing entries. Completeness issue where precomputed tables skip edge cases (index 0, 1, max) or invalid-but-queryable values, causing lookup failures when execution trace queries those indices.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Precomputed Table Completeness Audit

Audits precomputed tables for missing entries. **Completeness issue** - execution trace can query any index, including edge cases and error conditions. Missing precomputed entries cause lookup failures.

## Severity Assessment

**Assess severity case-by-case** based on impact and reachability:

- **Soundness** (malicious prover exploits): Typically Critical/High based on exploitability
- **Completeness** (honest prover fails): Ranges from Low (theoretical/unreachable) to Critical (blocks valid inputs)

**Key principle**: Completeness bugs reachable via canonical simulation and tracegen on valid inputs are **Critical** - the system doesn't work.

## The Problem

Precomputed tables are generated at startup. If they skip certain indices, lookups into those indices fail:

```cpp
// BUG: Skipped radix=0,1 entries (decomposition_len == 0)
for (size_t i = 0; i < p_limbs_per_radix.size(); ++i) {
    size_t decomposition_len = p_limbs_per_radix[i].size();
    if (decomposition_len > 0) {  // SKIPS i=0 and i=1!
        trace.set(C::precomputed_sel_to_radix_p_limb_counts, i, 1);
    }
}

// Execution trace: ToRadix with radix=1 (invalid, will error)
// Still does gas lookup into precomputed table at index 1
// Lookup fails because row 1 has sel=0!
```

## Instructions

### Step 1: Identify Precomputed Tables

```bash
# Find precomputed trace generation
ls barretenberg/cpp/src/barretenberg/vm2/tracegen/precomputed_trace.cpp

# Find precomputed column definitions
grep -n "precomputed\." barretenberg/cpp/pil/vm2/ -r --include="*.pil"
```

### Step 2: Identify Lookup Sources

For each precomputed table, find what queries it:

```bash
# Find lookups INTO precomputed tables
grep -rnE '}\s*(in|is)\s+precomputed\.' barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 3: Analyze Query Index Range

For each lookup, determine:
1. What index values can the source query?
2. Can it query edge cases (0, 1, max)?
3. Can it query during error conditions?

```bash
# Check what drives the lookup index
grep -B5 "in precomputed\." barretenberg/cpp/pil/vm2/<component>.pil
```

### Step 4: Check Table Population

```bash
# Find how table is populated
grep -n "precomputed_sel_\|precomputed_to_\|precomputed_" \
    barretenberg/cpp/src/barretenberg/vm2/tracegen/precomputed_trace.cpp
```

Verify:
- Does it populate ALL possible query indices?
- Does it handle boundary values (0, 1, max)?
- Does it populate indices for error/invalid inputs?

### Step 5: Check for Conditional Population

Look for patterns that skip entries:

```bash
# Find conditional population (potential skips)
grep -n "if.*decomposition\|if.*size\|if.*len\|continue" \
    barretenberg/cpp/src/barretenberg/vm2/tracegen/precomputed_trace.cpp
```

## Patterns

### Vulnerable: Skip Zero/Edge Cases

```cpp
// VULNERABLE: Skips entries where result is empty
for (size_t i = 0; i < table.size(); ++i) {
    if (table[i].size() > 0) {  // Skips i where table[i] is empty!
        trace.set(C::precomputed_sel, i, 1);
    }
}
```

### Vulnerable: Invalid Input Not Populated

```cpp
// VULNERABLE: Only populates valid radix values (2-256)
for (size_t radix = 2; radix <= 256; ++radix) {
    trace.set(C::precomputed_sel_radix, radix, 1);
}
// But execution can query radix=0,1 during error path!
```

### Secure: Populate All Queryable Indices

```cpp
// SECURE: Populate all indices, use fallback for invalid
for (size_t i = 0; i < table.size(); ++i) {
    trace.set(C::precomputed_sel, i, 1);  // Always set selector
    size_t value = table[i].size() > 0 ? table[i].size() - 1 : 0;
    trace.set(C::precomputed_value, i, value);
}
```

## Examples

### Example 1: ToRadix P-Limbs (PR #19266)

```cpp
// BEFORE (BUG): Skipped radix=0,1 (p_limbs_per_radix[0,1] are empty)
for (size_t i = 0; i < p_limbs_per_radix.size(); ++i) {
    size_t decomposition_len = p_limbs_per_radix[i].size();
    if (decomposition_len > 0) {
        trace.set(C::precomputed_sel_to_radix_p_limb_counts, i, 1);
        trace.set(C::precomputed_to_radix_safe_limbs, i, decomposition_len - 1);
    }
}

// AFTER (FIX): Always populate, use 0 as fallback
for (size_t i = 0; i < p_limbs_per_radix.size(); ++i) {
    size_t decomposition_len = p_limbs_per_radix[i].size();
    trace.set(C::precomputed_sel_to_radix_p_limb_counts, i, 1);
    trace.set(C::precomputed_to_radix_safe_limbs, i,
              decomposition_len > 0 ? decomposition_len - 1 : 0);
    trace.set(C::precomputed_to_radix_num_limbs_for_p, i, decomposition_len);
}
```

**Impact**: ToRadix with invalid radix (0 or 1) triggers error in subtrace, but execution trace still does gas lookup at that index. Missing precomputed row causes lookup failure.

**Why missed by tests**: Bug only manifests when:
1. Invalid radix (0 or 1) used
2. FULL precomputed trace generated (not mocked)
3. FULL execution trace generated
4. Lookup constraint actually checked

## Key Files

- `src/barretenberg/vm2/tracegen/precomputed_trace.cpp` - Precomputed generation
- `pil/vm2/precomputed.pil` - Precomputed column definitions
- `pil/vm2/execution.pil` - Gas lookups into precomputed

## Checklist

Before marking a precomputed table as safe:
- [ ] Table populates index 0?
- [ ] Table populates index 1?
- [ ] Table populates max valid index?
- [ ] Table populates indices for invalid/error inputs?
- [ ] No `if (size > 0)` or similar guards that skip entries?

## REQUIRED OUTPUT FORMAT

You MUST produce TWO output files:

### 1. Markdown Report (stdout)

#### Summary Table

| Item | Value |
|------|-------|
| Skill | `vm2-audit-precomputed-table-completeness` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

#### Findings Format

- **ID**: `vm2-audit-precomputed-table-completeness-filename-123-issue-type` (MUST use full skill name: `vm2-audit-precomputed-table-completeness`)
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.cpp:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED - separate file)

Write a `vm2-audit-precomputed-table-completeness.json` file to the output directory with:

```json
{
  "skill": "vm2-audit-precomputed-table-completeness",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-precomputed-table-completeness-filename-123-issue-type",
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

For no findings:
```json
{
  "skill": "vm2-audit-precomputed-table-completeness",
  "status": "COMPLETED_NO_FINDINGS",
  "findings": []
}
```

**IMPORTANT**: The audit prompt will specify where to write the JSON file. Use the Write tool to create the JSON at that path.
