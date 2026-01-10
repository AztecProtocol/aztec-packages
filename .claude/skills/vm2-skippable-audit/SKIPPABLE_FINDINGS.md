# VM2 Skippable Condition Audit Findings

## Overview

This document compiles known bugs, fixes, and learnings related to skippable conditions in the VM2/AVM codebase. Skippable conditions are performance optimizations that allow the prover to skip sumcheck accumulation when certain column conditions are met.

**Key Insight**: Incorrect skippable conditions cause **completeness issues** (verification fails for valid traces), NOT soundness issues.

## Historical Bugs and Fixes

### Bug 1: SHA256 Wrong Skippable (PR #12099)

**Date**: Feb 2025
**Commit**: `08525884d8e`
**Severity**: Completeness (verification failure)

**Problem**: The SHA256 skippable condition `sel = 0` was incorrect. When combined with a verifier bug fix (#10598), valid traces failed verification.

**Root Cause**: The skippable condition did not properly account for all sub-relations in the SHA256 trace. Some relations were not nullified when `sel = 0`.

**Fix**: Disabled the skippable condition entirely (commented out):
```pil
// TODO: This skippable condition makes verification fail.
// #[skippable_if]
// sel = 0;
```

**Lesson**: When skippable causes verification failures, disable it and investigate before re-enabling.

---

### Bug 2: Bitwise/Keccak/Memory Overly Complex Skippable (PR #17065)

**Date**: Sep 2025
**Commit**: `49893cfaf5e`
**Severity**: Completeness (potential verification failure)

**Problem**: Several traces used compound skippable conditions like `sel + last = 0` instead of simple `sel = 0`.

**Files Affected**:
- `bitwise.pil`: `sel + last = 0` → `sel = 0`
- `keccak_memory.pil`: `sel + last = 0` → `sel = 0`
- `keccakf1600.pil`: `sel + last = 0` → `sel = 0`
- `memory.pil`: `sel + precomputed.first_row = 0` → `sel = 0`

**Root Cause**: The compound conditions were unnecessarily complex. For boolean selectors, `sel + last = 0` requires BOTH to be zero, but `last` being non-zero on inactive rows could break the optimization.

**Fix**: Simplified all to `sel = 0` and ensured tracegen sets all relevant columns to zero on inactive rows.

**Lesson**: Keep skippable conditions as simple as possible. Rely on tracegen to zero out columns rather than adding extra conditions.

---

### Bug 3: BC Hashing PC Increment Constraint (PR #18424)

**Date**: Nov 2025
**Commit**: `6eb399203f4`
**Severity**: Completeness

**Problem**: The `PC_INCREMENTS` constraint used `(sel + precomputed.first_row)` as its gating selector, but `precomputed.first_row` is non-zero on row 0.

**Before**:
```pil
(sel + precomputed.first_row) * (pc_index' - ...) = 0;
```

**After**:
```pil
sel' * (pc_index' - ...) = 0;
```

**Root Cause**: When the skippable condition `sel = 0` is satisfied, the first row still has `precomputed.first_row = 1`, so the constraint is NOT nullified. After row merging in sumcheck, the relation fails.

**Lesson**: Constraints involving `precomputed.first_row` must be carefully analyzed. Use `sel'` instead when checking shifted values on inactive rows.

---

## Common Bug Patterns

### Pattern 1: Non-Nullified Relations
**Symptom**: Skippable condition is `sel = 0`, but some relations are not gated by `sel`.

**Example**:
```pil
#[skippable_if]
sel = 0;

// WRONG: Not nullified when sel = 0
column_a * column_b = 0;

// CORRECT: Nullified when sel = 0
sel * column_a * column_b = 0;
```

### Pattern 2: Compound Conditions Too Strict
**Symptom**: Using `sel_a + sel_b = 0` when `sel_a = 0` alone would work.

**Problem**: Compound conditions require ALL terms to be zero. If tracegen doesn't enforce this, skipping fails.

### Pattern 3: precomputed.first_row Interference
**Symptom**: Skippable works for most rows but fails on row 0.

**Cause**: Row 0 has `precomputed.first_row = 1`. Constraints using this column are not nullified by `sel = 0`.

**Fix**: Use `sel'` for shifted value constraints, or restructure to be nullified by `sel = 0 AND sel' = 0`.

### Pattern 4: Column Non-Zero on Inactive Rows
**Symptom**: Skippable condition is met, but a non-gated column has a non-zero value.

**Cause**: Tracegen sets a column to non-zero even when `sel = 0`.

**Fix**: Ensure tracegen zeros all relevant columns on inactive rows.

---

## Verification Steps for Skippable Conditions

1. **List all sub-relations** in the namespace
2. **For each sub-relation**, verify it evaluates to 0 when skippable condition is true
3. **Check tracegen** zeros all columns referenced in non-gated relations
4. **Handle first row specially**: Check relations with `precomputed.first_row`
5. **Test with skippable enabled**: Run `check_circuit` with `skippable_enabled = true`

---

## Related PRs and Issues

| PR/Commit | Title | Type |
|-----------|-------|------|
| [#12099](https://github.com/AztecProtocol/aztec-packages/pull/12099) | fix(avm): disable wrong sha skippable | Bug Fix |
| [#17065](https://github.com/AztecProtocol/aztec-packages/pull/17065) | chore(avm)!: skippable review | Cleanup |
| [#18424](https://github.com/AztecProtocol/aztec-packages/pull/18424) | feat!: bc hashing PIL PC increment constraint should play nice with skippable | Bug Fix |
| [#16523](https://github.com/AztecProtocol/aztec-packages/pull/16523) | feat(avm): skippable check-circuit | Testing |
| [#15073](https://github.com/AztecProtocol/aztec-packages/pull/15073) | chore(bb-pilcom): support aliases in skippable | Tooling |
| [#11984](https://github.com/AztecProtocol/aztec-packages/pull/11984) | chore: Explanations about skippable | Documentation |

---

## Testing Skippable Conditions

The `check_circuit` function in `check_circuit.cpp` supports testing with skippable enabled:

```cpp
void run_check_circuit(AvmFlavor::ProverPolynomials& polys, size_t num_rows, bool skippable_enabled)
```

Environment variable `AVM_SKIPPABLE` can enable/disable skippable during tests.

---

## Key Documentation

- **Skippable Mechanism**: `barretenberg/cpp/pil/vm2/docs/skippable.md`
- **Check Circuit**: `barretenberg/cpp/src/barretenberg/vm2/constraining/check_circuit.cpp`
