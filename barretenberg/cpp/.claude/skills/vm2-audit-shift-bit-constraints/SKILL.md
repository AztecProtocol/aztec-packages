---
name: vm2-audit-shift-bit-constraints
description: Audit VM2/AVM PIL files for shift operation bit constraint issues. High severity soundness issue where shift operations (SHL, SHR) have unconstrained intermediate values when overflow is triggered, or undefined behavior for edge cases, enabling arbitrary shift outputs.
---

# VM2 Shift Operation Bit Constraints Audit

## Purpose
Detect unconstrained intermediates in shift operations (SHL, SHR) that enable arbitrary outputs.

## When to Use
- Auditing shift operation PIL constraints
- Reviewing ALU bit manipulation logic
- Checking shift simulation for undefined C++ behavior

## Severity Assessment
- **Soundness** (prover exploits): Critical/High - arbitrary shift outputs
- **Completeness** (honest prover fails): Critical if blocks valid inputs

## The Bug Pattern

Shift operations decompose values:
```
a >> b requires:
- a_lo: bits shifted out
- a_hi: result (when no overflow)
- two_pow_shift_lo_bits: 2^b (divisor)
```

**Vulnerability**: When `overflow=1` (b >= type_bits), intermediates may be unconstrained, allowing prover to set arbitrary values.

## Workflow

### 1. Find Shift Operations
```bash
grep -rn "shl\|shr\|shift\|two_pow" pil/vm2/ --include="*.pil"
grep -rn "sel_op_shl\|sel_op_shr" pil/vm2/ --include="*.pil"
```

### 2. Identify Intermediates
Look for: `two_pow_shift_lo_bits`, `a_lo`, `a_hi`, `overflow`

### 3. Verify Constraints
Check intermediates are constrained in ALL cases (including overflow):
```bash
grep -rn "two_pow.*in\|two_pow.*permute" pil/vm2/ --include="*.pil"
```

### 4. Check Overflow Handling
- `overflow` is boolean constrained
- `overflow = 1` iff shift_amount >= type_bits
- Result = 0 when overflow

### 5. Check Tracegen
```bash
grep -rn "shl\|shr\|>>\|<<" src/barretenberg/vm2/simulation/ --include="*.cpp"
```
Verify no undefined C++ behavior: `value >> 128` is undefined!

## Vulnerable vs Secure Patterns

### VULNERABLE: Intermediate unconstrained on overflow
```pil
pol commit two_pow_shift_lo_bits;  // 2^b
pol commit overflow;
// No constraint on two_pow_shift_lo_bits when overflow=1
// Prover can manipulate decomposition
```

### VULNERABLE: Undefined C++ behavior
```cpp
uint128_t result = value >> 128;  // Undefined!
```

### SECURE: Constrain via lookup always
```pil
#[TWO_POW_LOOKUP]
sel_shift { b, two_pow_shift_lo_bits } in pow2_table.sel { pow2_table.exp, pow2_table.value };
```

### SECURE: Constrain on no-overflow path
```pil
#[TWO_POW_ON_NO_OVERFLOW]
(1 - overflow) { b, two_pow_shift_lo_bits } in pow2_table.sel { ... };
```

### SECURE: Handle C++ edge cases
```cpp
if (shift_amount >= 128) return 0;
return value >> shift_amount;
```

## Edge Cases
| Case | Expected | Check |
|------|----------|-------|
| Shift by 0 | result = a | two_pow = 1 |
| Shift by type_width | result = 0 | overflow = 1 |
| Shift > type_width | result = 0 | overflow = 1 |

## Real Example: PR #18192

**Before**: `two_pow_shift_lo_bits` not constrained when overflow=1

**Attack**:
1. Set `overflow = 1` even when `b < max_bits`
2. Choose `a_lo`, `a_hi` to satisfy range checks
3. Set `two_pow_shift_lo_bits = ((b - max_bits) - a_lo) / a_hi`
4. Output 0 when actual result is non-zero

**Impact**: Arbitrary shift output.

## Output Format

### Summary Table
| Item | Value |
|------|-------|
| Skill | `vm2-audit-shift-bit-constraints` |
| Target | `{path audited}` |
| Files Scanned | `{number}` |
| Findings | `{e.g., "2 Critical, 1 High" or "None"}` |
| Status | `COMPLETED_WITH_FINDINGS` / `COMPLETED_NO_FINDINGS` |

### Finding Format
- **ID**: `vm2-audit-shift-bit-constraints-{filename}-{line}-{type}`
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.pil:line`
- **Description**: Brief description
- **Fix**: One-line suggestion

### JSON Output (write to specified path)
```json
{
  "skill": "vm2-audit-shift-bit-constraints",
  "status": "COMPLETED_WITH_FINDINGS",
  "findings": [
    {
      "id": "vm2-audit-shift-bit-constraints-filename-123-type",
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
