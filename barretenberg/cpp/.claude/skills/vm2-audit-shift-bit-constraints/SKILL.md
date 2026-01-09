---
name: vm2-audit-shift-bit-constraints
description: Audit VM2/AVM PIL files for shift operation bit constraint issues. High severity soundness issue where shift operations (SHL, SHR) have unconstrained intermediate values when overflow is triggered, or undefined behavior for edge cases, enabling arbitrary shift outputs.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Shift Operation Bit Constraints Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for shift operation vulnerabilities. Shift operations (SHL, SHR) have unconstrained intermediate values when overflow is triggered, or undefined behavior for edge cases like shifting by the type width or more.

## Why This is Critical

Incorrect shift constraints enable serious exploits:
- **Output arbitrary values** for shift operations
- **Bypass range checks** through manipulated intermediates
- **Undefined behavior** leads to inconsistent results

## The Problem

Shift operations decompose values into parts:

```
For a >> b:
- a_lo: lower bits (shifted out)
- a_hi: upper bits (the result when no overflow)
- two_pow_shift_lo_bits: 2^b (the divisor)
```

When overflow is triggered (b >= type_bits), these intermediates may not be constrained.

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Find Shift Operations

```bash
# Find shift-related code
grep -rn "shl\|shr\|shift\|two_pow" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Find shift selectors
grep -rn "sel_op_shl\|sel_op_shr\|sel_shift" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 2: Identify Intermediate Values

For each shift operation, identify:
- `two_pow_shift_lo_bits` or similar (2^b)
- `a_lo`, `a_hi` or similar (decomposition parts)
- `overflow` indicator

```bash
# Find intermediate columns
grep -rn "two_pow\|_lo\|_hi\|overflow" barretenberg/cpp/pil/vm2/alu*.pil
```

### Step 3: Check Intermediate Constraints

For each intermediate value, verify it's constrained in ALL cases:

```bash
# Check for lookups on intermediates
grep -rn "two_pow.*in\|two_pow.*permute" barretenberg/cpp/pil/vm2/ --include="*.pil"

# Check decomposition constraints
grep -rn "a_lo\|a_hi" barretenberg/cpp/pil/vm2/ --include="*.pil"
```

### Step 4: Check Overflow Detection

```bash
# Find overflow handling
grep -rn "overflow" barretenberg/cpp/pil/vm2/alu*.pil
```

Verify:
- Overflow indicator is boolean constrained
- Overflow = 1 iff shift amount >= type bits
- Uses proper zero-check pattern

### Step 5: Verify Result on Overflow

When overflow = 1:
- SHR result should be 0
- SHL result should be 0 (or masked lower bits)

### Step 6: Check Edge Cases

Verify handling of:
- Shift by 0 (result = original value)
- Shift by type width (overflow case)
- Shift by more than type width (overflow case)

### Step 7: Check Tracegen/Simulation

```bash
# Find shift handling in simulation
grep -rn "shl\|shr\|shift\|>>\|<<" barretenberg/cpp/src/barretenberg/vm2/simulation/ --include="*.cpp"
```

Verify:
- No undefined C++ behavior for large shifts
- Consistent handling of edge cases

## Vulnerable vs Secure Patterns

### Vulnerable Pattern: Intermediate Unconstrained on Overflow

```pil
// VULNERABLE: two_pow_shift_lo_bits not constrained when overflow
pol commit a;
pol commit b;  // Shift amount
pol commit a_lo;
pol commit a_hi;
pol commit two_pow_shift_lo_bits;  // 2^b
pol commit overflow;
#[DECOMPOSITION]
```

### Vulnerable Pattern: Undefined C++ Behavior

```cpp
// VULNERABLE: Undefined behavior for large shifts
uint128_t result = value >> 128;  // Undefined in C++!
```

### Secure Pattern: Constrain Intermediates Always

```pil
// SECURE: Constrain two_pow_shift_lo_bits via lookup always
#[TWO_POW_LOOKUP]
sel_shift { b, two_pow_shift_lo_bits } in pow2_table.sel { pow2_table.exp, pow2_table.value };
```

### Secure Pattern: Constrain on No-Overflow Path

```pil
// SECURE: Constrain when claiming no overflow
#[TWO_POW_ON_NO_OVERFLOW]
(1 - overflow) { b, two_pow_shift_lo_bits } in pow2_table.sel { pow2_table.exp, pow2_table.value };
#[OVERFLOW_CORRECT]
```

### Secure Pattern: Handle C++ Edge Cases

```cpp
// SECURE: Explicit handling of large shifts
if (shift_amount >= 128) {
    return 0;
}
return value >> shift_amount;
```

## Edge Cases to Handle

### Case 1: Shift by 0

```pil
// a >> 0 = a
// a << 0 = a
// Must handle: two_pow_shift_lo_bits = 2^0 = 1
```

### Case 2: Shift by Type Width

```pil
// For U32:
// a >> 32 = 0 (overflow case)
// a << 32 = 0 (overflow case)
```

### Case 3: Shift by More Than Type Width

```pil
// a >> 128 for U128
// a << 256 for any type
// Should be handled as overflow = 1, result = 0
```

## Historical Examples

### Example 1: ALU Shift Underconstraint (PR #18192)

```pil
// BEFORE: two_pow_shift_lo_bits not constrained when overflow
// A malicious prover could:
// 1. Set overflow = 1 even when b < max_bits
// 2. Choose a_lo, a_hi to satisfy range checks
// 3. Set two_pow_shift_lo_bits = ((b - max_bits) - a_lo) / a_hi
// 4. Output 0 when actual result is non-zero

// AFTER: Proper constraint on two_pow_shift_lo_bits
// Either via lookup or explicit constraint
```
**Impact**: Arbitrary shift output.

### Example 2: Undefined C++ Behavior

```cpp
// BEFORE: Undefined behavior for large shifts
uint128_t result = value >> 128;  // Undefined in C++!

// AFTER: Explicit handling
if (shift_amount >= 128) {
    return 0;
}
return value >> shift_amount;
```
**Impact**: Inconsistent simulation results.

## References

- See PR history for examples

---

**Output Format**: See [_shared/OUTPUT_FORMAT.md](../_shared/OUTPUT_FORMAT.md) for required output structure.
