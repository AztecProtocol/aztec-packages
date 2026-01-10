---
name: vm2-skippable-audit
description: Audit VM2/AVM PIL skippable conditions for completeness issues. Use when reviewing skippable_if annotations, debugging verification failures, or ensuring constraints are properly nullified when selectors are inactive. Covers sumcheck row merging, tracegen alignment, and first row edge cases.
allowed-tools: Read, Glob, Grep, Bash, Write
---

# VM2 Skippable Condition Audit Skill

## Overview

Skippable conditions (`#[skippable_if]`) are prover-side performance optimizations that skip sumcheck accumulation when certain column conditions are met. **Incorrect skippable conditions cause completeness issues** - valid traces from normal simulation/tracegen fail verification.

This skill helps audit skippable conditions to find **real completeness bugs** - not artificial exploits.

## What is a REAL Completeness Bug?

A real completeness bug is one where:
1. You run **normal simulation** (not manually manipulating columns)
2. **Tracegen produces a trace** following its normal code paths
3. That trace **fails verification** due to skippable condition issues

**NOT a real bug**: Manually setting `double_op = 2` on an inactive row. Tracegen would never do this.

**IS a real bug**: Tracegen setting `last = 1` on row 0, causing polynomial non-constancy at random challenge points.

## Key Concepts

### How Skippable Affects Verification

During sumcheck, two contiguous rows are "merged" using a random challenge α:
```
ColMerged_i = (1 - α) * Col_i + α * Col_{i+1}
```

**Critical insight**: Even if individual rows satisfy constraints, the **merged polynomial values** at random challenge points may not!

Example: If `last = 1` on row 0 and `last = 0` on row 1:
- Each row satisfies `last * (1 - last) = 0` (1×0=0 and 0×1=0)
- But merged value: `last_merged = (1-α)*1 + α*0 = 1-α`
- At random α: `(1-α) * (1 - (1-α)) = (1-α) * α ≠ 0` **VERIFICATION FAILS!**

### check_circuit vs Real Verification

- **check_circuit (default)**: Uses `skippable_enabled=true`, skips rows where skip condition is met
- **Real verifier**: Does NOT skip - evaluates ALL constraints at random challenge point

A trace can pass check_circuit but fail real verification!

## Finding Real Completeness Bugs

### Pattern 1: Tracegen Setting Non-Zero Values on Row 0 (HIGHEST PRIORITY)

**The Bug**: Tracegen unconditionally sets a column value on row 0, even when there are no events.

```cpp
// BUG: Always sets last=1 on row 0
void process(events, trace) {
    trace.set(C::component_last, 0, 1);  // <-- UNCONDITIONAL
    for (const auto& event : events) { ... }
}
```

**Why it's a real bug**:
- If no events: `sel = 0` everywhere, but `last = 1` on row 0
- Polynomial for `last` is non-constant
- At random challenge point, `last(u) ∉ {0, 1}`
- Ungated constraint `last * (1 - last) = 0` fails

**The Fix**:
```cpp
// FIXED: Only set last=1 when there are events
void process(events, trace) {
    if (!events.empty()) {
        trace.set(C::component_last, 0, 1);
    }
    for (const auto& event : events) { ... }
}
```

**How to find**: Search tracegen for unconditional row 0 assignments:
```bash
grep -n "trace\.set.*,\s*0," barretenberg/cpp/src/barretenberg/vm2/tracegen/*.cpp
```

Then check if the column appears in an ungated constraint in the corresponding PIL.

### Pattern 2: Missing Boolean Constraint on Selector (HIGH PRIORITY)

**The Bug**: A selector column lacks `sel * (1 - sel) = 0` constraint.

```pil
pol commit sel;
// MISSING: sel * (1 - sel) = 0;

#[skippable_if]
sel = 0;
```

**Why it's a real bug**:
- Without boolean constraint, `sel` is technically unconstrained on inactive rows
- Recent fix (commit fbcc6a10294) added missing boolean constraints to ecc_mem.pil and to_radix_mem.pil

**How to find**:
```bash
# Find all selector declarations and check for boolean constraints
grep -A2 "pol commit sel" barretenberg/cpp/pil/vm2/*.pil | grep -v "1 - sel"
```

### Pattern 3: precomputed.first_row Interference (MEDIUM PRIORITY)

**The Bug**: Constraint uses `(sel + precomputed.first_row)` which isn't nullified on row 0.

```pil
#[skippable_if]
sel = 0;

// BUG: On row 0, (0 + 1) * expr = expr, NOT nullified!
(sel + precomputed.first_row) * (pc_index' - expected) = 0;
```

**Historical example**: PR #18424 fixed this exact bug in bc_hashing.pil.

**The Fix**:
```pil
// Use sel' instead - it's 0 on row 1 when sel=0 on row 0
sel' * (pc_index' - expected) = 0;
```

### Pattern 4: Compound Skippable Conditions (LOW PRIORITY)

**The Bug**: Skippable condition requires multiple columns to be zero.

```pil
#[skippable_if]
sel + last = 0;  // Requires BOTH sel=0 AND last=0
```

**Why it can be problematic**:
- Tracegen might set `last = 1` on row 0 even when `sel = 0`
- Skippable condition not satisfied, but constraints might still fail

**Historical example**: PR #17065 simplified these to just `sel = 0`.

## Audit Workflow

### Step 1: Check Tracegen for Row 0 Assignments

```bash
# Find all row 0 assignments in tracegen
grep -rn "trace\.set.*,\s*0," barretenberg/cpp/src/barretenberg/vm2/tracegen/

# Look for unconditional assignments (not inside if (!events.empty()))
```

For each found, verify:
1. Is it conditional on events existing?
2. Does the column appear in an ungated constraint?

### Step 2: Check for Missing Boolean Constraints on Selectors

```bash
# Find selector declarations
grep -n "pol commit sel" barretenberg/cpp/pil/vm2/*.pil

# For each, verify boolean constraint exists
grep -A3 "pol commit sel" <file> | grep "1 - sel"
```

### Step 3: Check for first_row Usage in Constraints

```bash
grep -n "first_row" barretenberg/cpp/pil/vm2/*.pil | grep -v "//"
```

For each, verify the constraint is properly nullified when `sel = 0`.

### Step 4: Run Tests with Skippable Disabled

```bash
# This catches issues that check_circuit with skippable=true would miss
AVM_DISABLE_SKIPPABLE=1 ./build/bin/vm2_tests
```

## Historical Bugs (Reference)

| PR | Bug | Pattern |
|----|-----|---------|
| #18424 | `(sel + first_row) * expr` not nullified | Pattern 3 |
| #17065 | `last = 1` set unconditionally on row 0 | Pattern 1 |
| #17065 | Compound skippable `sel + last = 0` | Pattern 4 |
| #12099 | SHA256 skippable disabled entirely | Multiple issues |
| fbcc6a10294 | Missing `sel * (1 - sel)` in ecc_mem, to_radix_mem | Pattern 2 |

## Output Requirements

**IMPORTANT**: After completing the audit, write findings to:
```
barretenberg/cpp/pil/vm2/claude-audits/skippable/<category>-audit.md
```

### Report Format

```markdown
# Skippable Condition Audit: <Category>

**Date**: YYYY-MM-DD
**Files Audited**: <list of files>

## Summary

| File | Skippable Condition | Status | Real Bug? |
|------|---------------------|--------|-----------|
| file1.pil | `sel = 0` | PASS/ISSUE | Yes/No |

## Real Completeness Bugs Found

### Bug 1: <description>

**File**: `path/to/file.pil` and `path/to/tracegen.cpp`
**Pattern**: (1/2/3/4 from above)

**PIL Constraint** (line X):
```pil
<the problematic constraint>
```

**Tracegen Code** (line Y):
```cpp
<the problematic tracegen code>
```

**Why it's a real bug**:
- Normal simulation would...
- Tracegen would set...
- This causes verification to fail because...

**Reproduction**: Can be triggered by running <specific test/scenario>

**Suggested Fix**: <code change>

## Non-Issues (Artificial Exploits Only)

These constraints are ungated but NOT real bugs because tracegen never sets invalid values:
- Line X: `col * (1 - col) = 0` - tracegen always sets col ∈ {0, 1}
```

## Build and Test Commands

```bash
# Build VM2 tests
vmb  # or: cmake --preset build && cd build && ninja vm2_tests

# Run tests with skippable DISABLED (catches real bugs)
AVM_DISABLE_SKIPPABLE=1 vmt

# Run specific component test
AVM_DISABLE_SKIPPABLE=1 vmtg "BitwiseConstraining*"
```

## Key References

- [Skippable Documentation](../../../../barretenberg/cpp/pil/vm2/docs/skippable.md) - Technical explanation
- [Check Circuit](../../../../barretenberg/cpp/src/barretenberg/vm2/constraining/check_circuit.cpp) - Testing implementation
- Historical PRs: #18424, #17065, #12099
