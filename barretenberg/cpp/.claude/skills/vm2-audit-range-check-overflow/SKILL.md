---
name: vm2-audit-range-check-overflow
description: Audit VM2/AVM PIL files for range check and overflow vulnerabilities. High severity soundness issue where arithmetic operations overflow without proper range checks, or range checks are incorrectly applied, enabling integer wrap-around, wrong memory access, size/gas manipulation.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Range Check and Overflow Audit

## Purpose
Find missing or incorrect range checks on arithmetic operations that enable integer wrap-around, wrong memory access, or gas manipulation.

## When to Use
- Auditing PIL files for overflow/underflow vulnerabilities
- Reviewing arithmetic operations (address calculations, gas, sizes)
- Checking range check table usage

## Severity Assessment
- **Soundness** (malicious prover exploits): Critical/High based on exploitability
- **Completeness** (honest prover fails): Low to Critical based on reachability
- Completeness bugs reachable via canonical simulation on valid inputs are **Critical**

## CRITICAL: Caller-Constrains-Inputs Principle

**Before reporting "missing range check", verify the value isn't already constrained by its source.**

Input columns (from lookup/permutation destinations) do NOT need local range checks if the source constrains them.

### Validation Steps
1. **Is it an input or locally computed?** - Check if value appears in lookup destination (right of `in`)
2. **For inputs, trace the source** - `grep -rn "column_name" pil/vm2/ | grep " in "`
3. **Verify source constraints** - Explicit range check, bounded computation, or public input
4. **Document the chain** - If safe, note why; if unsafe, the source needs the fix

### Common FALSE POSITIVES

| Pattern | Why Safe |
|---------|----------|
| Tree sizes from context | Initialized from public inputs, only incremented by 0/1 |
| Memory values with tags | Memory's `RANGE_CHECK_WRITE_TAGGED_VALUE` enforces bounds |
| Gas values | `gas.pil` out-of-gas checks ensure used <= limit |
| Counters with termination | Decrement gated by `(1 - last)`, won't fire when counter = 1 |
| Clock values | From `precomputed.clk` (row number), bounded by trace size |
| Lookup-validated indices | Forced to match existing rows, bounded by row count |

### Real Vulnerability Indicators
- Column is locally computed (not an input)
- Source trace does NOT constrain the value
- Prover can set arbitrary field elements
- Enables exploit (memory access, gas manipulation, etc.)

## Workflow

### Step 1: Find Arithmetic Operations
```bash
# Find all arithmetic in component
grep -En "(addr|offset|base|ptr|size|len|count|remaining|gas|sum|total).*[+\-*]|[+\-*].*(addr|offset|size|gas)" pil/vm2/<component>.pil
```

### Step 2: Check Range Check Lookups
```bash
grep -n "range_check\|U8\|U16\|U32\|U64" pil/vm2/<component>.pil
```

Expected pattern:
```pil
#[VALUE_RANGE_CHECK]
sel { value } in range_check.sel { range_check.value };
```

### Step 3: Check Overflow/Underflow Handling
```bash
grep -n "overflow\|underflow\|wrap\|carry" pil/vm2/<component>.pil
```
Verify: boolean constrained, triggers error/adjustment, both cases handled.

### Step 4: Verify Correct Range Table
- 8-bit: U8 table
- 16-bit: U16 table
- 32-bit: U32 table, etc.

## Vulnerable Patterns

### Unchecked Arithmetic
```pil
// VULNERABLE: Address calculation can overflow/wrap
pol next_addr = addr + offset;  // No range check!
```

### Missing Range Check
```pil
// VULNERABLE: Value assumed to fit in N bits without lookup
pol commit value;  // Assumed U32, but no range check lookup
```

### Uncaught Underflow
```pil
// VULNERABLE: If used > total, wraps to huge value
pol remaining = total - used;
```

### Incorrect Bound (Off-by-One)
```pil
// VULNERABLE: Should be <= or check against SIZE
addr < AVM_HIGHEST_ADDRESS;
```

## Secure Patterns

### Overflow Detection
```pil
pol commit overflow;
#[RANGE_CHECK_SUM]
(1 - overflow) { sum } in range_check.sel { range_check.value };
#[OVERFLOW_CHECK]
(1 - overflow) * (sum - addr - offset) = 0;
overflow * (sum - addr - offset + 2^32) = 0;
```

### Underflow Prevention
```pil
pol commit underflow;
#[UNDERFLOW_CHECK]
underflow * (used - total - 1) in range_check.sel { ... };
(1 - underflow) * (total - used) in range_check.sel { ... };
```

## Historical Examples

| PR | Bug | Impact |
|----|-----|--------|
| #14559 | Gas calculation overflow (`size * GAS_PER_BYTE`) | Gas undercharge |
| #14901 | Relative address overflow (`base + offset`) | Arbitrary memory access |
| #18503 | to_radix_mem underflow (`dst_addr + num_limbs - 1` when both 0) | Write to p-1 |
| #19076 | Log end address uint64 overflow | Incorrect bounds check |
| #17877 | Off-by-one (`< HIGHEST_ADDRESS` vs `<= HIGHEST_ADDRESS`) | Accept invalid/reject valid |

## Output Format

### 1. Markdown Report (stdout)

**Summary Table:**
| Item | Value |
|------|-------|
| Skill | `vm2-audit-range-check-overflow` |
| Target | `{path}` |
| Files Scanned | `{N}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` / `ERROR` |

**Finding Format:**
- **ID**: `vm2-audit-range-check-overflow-{filename}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### 2. JSON File (REQUIRED)

Write `vm2-audit-range-check-overflow.json` to specified output directory:

```json
{
  "skill": "vm2-audit-range-check-overflow",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-range-check-overflow-filename-123-issue-type",
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
