---
name: vm2-audit-range-check-overflow
description: Audit VM2/AVM PIL files for range check and overflow vulnerabilities. High severity soundness issue where arithmetic operations overflow without proper range checks, or range checks are incorrectly applied, enabling integer wrap-around, wrong memory access, size/gas manipulation.
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
---

# VM2 Range Check and Overflow Audit Skill

## Overview

This skill audits VM2/AVM PIL constraints for range check and overflow vulnerabilities. Arithmetic operations can overflow without proper range checks, or range checks are incorrectly applied, allowing values outside expected bounds.

**Bug Type**: Soundness
**Severity**: High
**Frequency**: Medium

> **⚠️ CRITICAL: Caller-Constrains-Inputs Principle**
>
> Before reporting any "missing range check" finding, you MUST verify that the value isn't already constrained by its source. Columns that come from other traces via lookup/permutation are inputs - the receiving component doesn't need to range-check them if the caller/source already does. See the "Avoiding False Positives" section for detailed guidance.

## Why This is Critical

Missing or incorrect range checks enable critical exploits:
- **Integer wrap-around enables arbitrary values**: 2^32 - 1 + 10 = 9
- **Address calculations can access wrong memory**: Overflow to low addresses
- **Size calculations can underflow/overflow**: Negative sizes wrap to huge values
- **Gas calculations can be manipulated**: Undercharge for expensive operations

## Audit Instructions

> **Note**: PIL files exist in subdirectories (e.g., `bytecode/`, `opcodes/`). Use `find barretenberg/cpp/pil/vm2 -name "*.pil"` to list all PIL files.

### Step 1: Identify All Arithmetic Operations

```bash
# Find additions that could overflow
grep -n "+ \|addr.*offset\|base.*+\|sum\|total" barretenberg/cpp/pil/vm2/<component>.pil

# Find subtractions that could underflow
grep -n "- \|remaining\|size.*-\|count.*-" barretenberg/cpp/pil/vm2/<component>.pil

# Find multiplications that could overflow
grep -n "\* \|gas.*\*\|cost.*\*\|size.*\*" barretenberg/cpp/pil/vm2/<component>.pil
```

### Step 2: Check for Range Check Lookups

For each arithmetic result, verify there's a range check:

```bash
# Find range check lookups
grep -n "range_check\|in.*range\|U8\|U16\|U32\|U64" barretenberg/cpp/pil/vm2/<component>.pil
```

Expected pattern:
```pil
#[VALUE_RANGE_CHECK]
sel { value } in range_check.sel { range_check.value };
```

### Step 3: Check Overflow/Underflow Detection

Look for overflow indicator columns and their constraints:

```bash
# Find overflow handling
grep -n "overflow\|underflow\|wrap\|carry" barretenberg/cpp/pil/vm2/<component>.pil
```

Verify:
- Overflow indicator is boolean constrained
- Overflow correctly triggers error or adjustment
- Both overflow and non-overflow cases are handled

### Step 4: Check Address Calculations

```bash
# Find address calculations
grep -n "addr\|address\|offset\|base\|ptr" barretenberg/cpp/pil/vm2/<component>.pil
```

Verify:
- Base + offset additions are range checked
- Array index calculations are bounded
- Memory bounds checks are correct (no off-by-one)

### Step 5: Check Size/Length Calculations

```bash
# Find size calculations
grep -n "size\|length\|len\|count\|remaining\|num_" barretenberg/cpp/pil/vm2/<component>.pil
```

Verify:
- Subtractions can't underflow
- Remaining space calculations are safe
- Comparisons use correct bounds (< vs <=)

### Step 6: Verify Range Check Table Usage

```bash
# Check which range check tables are used
grep -n "range_check\." barretenberg/cpp/pil/vm2/<component>.pil
```

Verify correct table for the bit width:
- 8-bit: U8 range table
- 16-bit: U16 range table
- 32-bit: U32 range table
- etc.

## CRITICAL: Avoiding False Positives - The Caller-Constrains-Inputs Principle

**Before reporting any finding, apply this principle:**

When a column's value comes from another trace via lookup or permutation (i.e., it's an "input" to the component), the receiving component does NOT need to range-check it locally. Instead, you must verify that the **caller/source** properly constrains the value.

### How to Identify Input Columns

Input columns typically:
1. Appear in lookup/permutation **destination** (right side of `in`)
2. Are documented as coming from another trace
3. Have comments like "from execution", "from context", "from public_inputs"

```pil
// This component RECEIVES tree_size from caller - it's an INPUT
#[LOOKUP_FROM_CALLER]
caller.sel { caller.tree_size, ... }
in
this_gadget.sel { this_gadget.tree_size_before_write, ... };
```

### Step-by-Step: Validating "Missing Range Check" Findings

When you find a column without a local range check:

**Step 1: Determine if it's an input or locally computed**
- Input: Value comes from lookup/permutation from another trace
- Local: Value is computed within this PIL file

**Step 2: For inputs, trace the source**
```bash
# Find where this column is used in lookups (as destination)
grep -rn "this_column" pil/vm2/ | grep " in "
```

**Step 3: Verify the source constrains it**
Check if the source trace:
- Range-checks the value explicitly, OR
- Computes it from already-bounded values, OR
- Receives it from public inputs (validated by rollup), OR
- Only ever increments/decrements by bounded amounts (e.g., +1, boolean)

**Step 4: Document the constraint chain**
If safe, note WHY it's safe. If unsafe, the source is where the fix belongs.

### Common FALSE POSITIVE Patterns

#### 1. Tree sizes from context propagation
```pil
// FALSE POSITIVE: tree_size_before_write "not range checked"
// ACTUALLY SAFE: Initialized from public inputs, only incremented by 0 or 1
tree_size_after_write = tree_size_before_write + should_insert;  // should_insert is boolean
```

#### 2. Values from memory with tag validation
```pil
// FALSE POSITIVE: offset and copy_size "could be field elements"
// ACTUALLY SAFE: Come from memory reads with U32 tag
// Memory's #[RANGE_CHECK_WRITE_TAGGED_VALUE] ensures U32 values are 32-bit bounded
```

#### 3. Gas values protected by gas system
```pil
// FALSE POSITIVE: "l2_gas_limit - l2_gas_used could underflow"
// ACTUALLY SAFE: gas.pil's #[IS_OUT_OF_GAS_L2] ensures used <= limit
// The constraint chain guarantees non-negative result
```

#### 4. Counters with termination conditions
```pil
// FALSE POSITIVE: "bytes_remaining - 1 could underflow"
// ACTUALLY SAFE: Constraint only fires when (1 - last) = 1
// When bytes_remaining = 1, last = 1, so decrement doesn't happen
```

#### 5. Clock values from execution trace
```pil
// FALSE POSITIVE: "clk not range checked in this file"
// ACTUALLY SAFE: clk comes from precomputed.clk (row number)
// Inherently bounded by trace size
```

#### 6. Values validated by lookup existence
```pil
// FALSE POSITIVE: "calldata_size not range checked"
// ACTUALLY SAFE: Lookup forces it to equal an existing index
// Indices start at 0 and increment by 1, so bounded by row count
```

### Transitive Constraint Chains

Many bounds are enforced transitively. Document these chains:

```
Example: Gas ingestion after nested call exit

parent_l2_gas_used + nested_l2_gas_used <= parent_l2_gas_limit

Proof:
1. Gas clamping: nested_l2_gas_limit <= l2_gas_left = parent_l2_gas_limit - parent_l2_gas_used
2. Out-of-gas check: nested_l2_gas_used <= nested_l2_gas_limit
3. Substituting: nested_l2_gas_used <= parent_l2_gas_limit - parent_l2_gas_used
4. Rearranging: parent_l2_gas_used + nested_l2_gas_used <= parent_l2_gas_limit ✓
```

### When IS It a Real Vulnerability?

A missing range check is a REAL issue when:
1. The column is locally computed (not an input)
2. The source trace does NOT constrain the value
3. The value can be set to arbitrary field elements by the prover
4. The lack of constraint enables an exploit (memory access, gas manipulation, etc.)

### Audit Checklist Addition

Before reporting a "missing range check" finding:
- [ ] Is this column an input from another trace?
- [ ] If yes, did I trace where the value comes from?
- [ ] Did I verify the source constrains it (explicitly or transitively)?
- [ ] Can I document the constraint chain that makes it safe?
- [ ] If I can't find constraints, did I check public_inputs and precomputed?

## Vulnerable Patterns

### Pattern 1: Unchecked Arithmetic

```pil
// VULNERABLE: Address calculation can overflow
pol next_addr = addr + offset;
// If addr + offset > 2^32, it wraps around!
```

### Pattern 2: Missing Range Check

```pil
// VULNERABLE: Value assumed to fit in N bits
pol commit value;  // Assumed to be U32
// No lookup to range check table!
```

### Pattern 3: Underflow on Subtraction

```pil
// VULNERABLE: Subtraction can underflow
pol remaining = total - used;
// If used > total, remaining wraps to large value
```

### Pattern 4: Incorrect Range Check Bound

```pil
// VULNERABLE: Off-by-one in bound check
addr < AVM_HIGHEST_ADDRESS;  // Should be <= or check against SIZE
```

### Pattern 5: Missing Overflow Indicator

```pil
// VULNERABLE: No overflow detection
pol sum = a + b;
// If a + b >= 2^N, sum wraps but no indicator
```

## Secure Patterns

### Secure Pattern: Explicit Overflow Detection

```pil
// SECURE: Explicit overflow detection
pol commit addr;
pol commit offset;
pol commit sum;
pol commit overflow;

// Range check the sum
#[RANGE_CHECK_SUM]
(1 - overflow) { sum } in range_check.sel { range_check.value };

// Overflow indicator properly constrained
#[OVERFLOW_CHECK]
(1 - overflow) * (sum - addr - offset) = 0;  // No overflow: sum = addr + offset
overflow * (sum - addr - offset + 2^32) = 0;  // Overflow: adjusted
```

### Secure Pattern: Underflow Prevention

```pil
// SECURE: Underflow prevention
pol remaining = total - used;
pol commit underflow;  // 1 if used > total

#[UNDERFLOW_CHECK]
underflow * (used - total - 1) in range_check.sel { ... };  // used > total check
(1 - underflow) * (total - used) in range_check.sel { ... };  // Positive remainder
```

### Secure Pattern: Range Check Lookup

```pil
// Use range check lookup for bounded values
pol commit value;  // Should fit in N bits

#[VALUE_RANGE_CHECK]
sel { value } in range_check.sel { range_check.value };
```

## Historical Examples

### Example 1: AVM Gas Overflows (PR #14559)

```cpp
// BEFORE: Dynamic gas calculation could overflow
uint32_t dynamic_gas = size * GAS_PER_BYTE;
// Large size * cost could exceed uint32_t

// AFTER: Range check lookup for overflow
#[GAS_RANGE_CHECK]
sel { dynamic_gas } in range_check.sel { range_check.value };
```
**Impact**: Manipulate gas to undercharge for operations.

### Example 2: Addressing Relative Overflow (PR #14901)

```pil
// BEFORE: Relative address calculation unchecked
pol resolved = base + relative_offset;
// Could overflow address space

// AFTER: Overflow detection and handling
#[RELATIVE_OVERFLOW]
overflow_indicator { ... } in range_check.sel { ... };
```
**Impact**: Access arbitrary memory locations.

### Example 3: to_radix_mem Underflow (PR #18503)

```pil
// BEFORE: Write address underflows
// If dst_addr = 0 and num_limbs = 0
// write_addr = dst_addr + num_limbs - 1 = -1 = p - 1

// AFTER: Handle edge case
#[ADDR_BOUNDS_CHECK]
// Proper bounds checking
```
**Impact**: Write to unintended memory location.

### Example 4: Emit Unencrypted Log (PR #19076)

```cpp
// BEFORE: end_log_address computed with uint64 overflow
uint64_t end_addr = start_addr + size - 1;
// Interpreted differently in trace vs gadget

// AFTER: Compare with size instead
// Check addr + 1 vs AVM_MEMORY_SIZE
```
**Impact**: Incorrect bounds checking.

### Example 5: Data Copy Bounds (PR #17877)

```pil
// BEFORE: Off-by-one in bounds check
max_read_addr < AVM_HIGHEST_ADDRESS;  // Wrong comparison

// AFTER: Correct comparison
max_read_addr <= AVM_HIGHEST_ADDRESS;
// Or: max_read_addr < AVM_MEMORY_SIZE;
```
**Impact**: Reject valid operations or accept invalid ones.

## Test Patterns

### Test 1: Address Overflow

```cpp
TEST_F(ComponentTest, NegativeAddressOverflow)
{
    // Create trace with overflowing address
    auto trace = TestTraceContainer({
        {{ C::sel, 1 },
         { C::base_addr, UINT32_MAX - 5 },
         { C::offset, 10 },
         { C::resolved_addr, 4 },      // Wrapped value
         { C::overflow, 0 }},          // Claims no overflow (INVALID)
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "OVERFLOW"
    );
}
```

**Interpretation**:
- **Test passes (throws)**: Overflow detected - secure
- **Test fails (no throw)**: Overflow not caught - vulnerable

### Test 2: Size Underflow

```cpp
TEST_F(ComponentTest, NegativeSizeUnderflow)
{
    auto trace = TestTraceContainer({
        {{ C::sel, 1 },
         { C::total_size, 5 },
         { C::used_size, 10 },         // More than total!
         { C::remaining, UINT32_MAX - 4 }}, // Underflowed
    });

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<ComponentRelation>(trace),
        "UNDERFLOW"
    );
}
```

### Test 3: Missing Range Check

```cpp
TEST_F(ComponentTest, NegativeValueNotRangeChecked)
{
    auto trace = TestTraceContainer({
        {{ C::sel, 1 },
         { C::value, FF(1) << 64 }},  // Too large for U32!
    });

    // If properly range checked, should fail
    EXPECT_THROW(
        check_all_interactions<ComponentTraceBuilder>(trace),
        std::exception
    );
}
```

### Test 4: Off-by-One Bound Check

```cpp
TEST_F(ComponentTest, NegativeOffByOneBound)
{
    auto trace = TestTraceContainer({
        {{ C::sel, 1 },
         { C::addr, AVM_MEMORY_SIZE }},  // Exactly at boundary
    });

    // Should fail if addr must be < AVM_MEMORY_SIZE
    // Should pass if addr must be <= AVM_MEMORY_SIZE - 1
    EXPECT_THROW(
        check_relation<ComponentRelation>(trace),
        std::runtime_error
    );
}
```

## Audit Checklist

1. **Identify all arithmetic operations**:
   - [ ] Additions that could overflow
   - [ ] Subtractions that could underflow
   - [ ] Multiplications that could overflow

2. **For each operation, classify the operands**:
   - [ ] Are operands locally computed or inputs from other traces?
   - [ ] For inputs: trace the source and verify caller constraints
   - [ ] For local values: verify range checks exist

3. **Apply caller-constrains-inputs principle** (CRITICAL for avoiding false positives):
   - [ ] Identify columns that come from lookups/permutations
   - [ ] Trace each input to its source
   - [ ] Verify source provides bounds (explicit check, bounded computation, or public input)
   - [ ] Document the constraint chain if safe

4. **For genuinely unconstrained arithmetic, check**:
   - [ ] Can the result overflow/underflow?
   - [ ] Is there a range check lookup?
   - [ ] Is overflow/underflow properly detected and handled?

5. **Check address calculations**:
   - [ ] Base + offset additions
   - [ ] Array index calculations
   - [ ] Memory bounds checks

6. **Check size/length calculations**:
   - [ ] Subtraction of counts
   - [ ] Remaining space calculations
   - [ ] Off-by-one errors in comparisons (< vs <=)

7. **Verify range check lookups**:
   - [ ] Correct table (U8, U16, U32, etc.)
   - [ ] Selector properly gated
   - [ ] All code paths covered

8. **Before finalizing any finding**:
   - [ ] Re-verify it's not a false positive per the patterns above
   - [ ] Confirm the value is truly unconstrained by any source
   - [ ] Confirm an exploit is possible (not just theoretical)

## Fix Pattern

```pil
// Add overflow detection
pol commit a;
pol commit b;
pol commit sum;
pol commit overflow;

#[SUM_CORRECT]
sum = a + b - overflow * 2^N;  // N = bit width

#[OVERFLOW_BOOL]
overflow * (1 - overflow) = 0;

#[SUM_RANGE]
(1 - overflow) { sum } in range_check.sel { range_check.value };

#[OVERFLOW_WITNESS]
overflow * (a + b - 2^N) in range_check.sel { ... };  // Proves a + b >= 2^N
```

## Build and Test Commands

```bash
# Regenerate C++ from PIL
vmp  # or: ../../bb-pilcom/target/release/bb_pil pil/vm2

# Build VM2 tests
vmb  # or: cmake --preset build && cd build && ninja vm2_tests

# Run all VM2 tests
vmt  # or: ./build/bin/vm2_tests

# Run specific component test
vmtg "ComponentConstraining*"
```

## Common Locations to Audit

Range check vulnerabilities are critical in:
- **Memory addressing**: `memory.pil`, `*_mem.pil`
- **Gas calculations**: `execution.pil`, gas cost computations
- **Data copy**: `data_copy.pil`, `calldata.pil`, `returndata.pil`
- **ALU operations**: `alu.pil` - all arithmetic
- **Address derivation**: `address_derivation.pil`
- **Radix conversion**: `to_radix_mem.pil`

## References

- [Detailed Skill Documentation](../../../pil/vm2/claude-skills/13-range-check-overflow.md)
- [Tag Validation Skill](../vm2-audit-tag-validation/SKILL.md)
- [Missing Error Gating Skill](../vm2-audit-missing-error-gating/SKILL.md)
