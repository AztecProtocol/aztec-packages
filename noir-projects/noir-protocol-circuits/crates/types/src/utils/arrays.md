# Arrays

Start with a side-effect array [T; M] from an app.

We don't validate that the LHS is non-empty,
to save constraints. We'll validate it in a later circuit.
(although it's only 600 constraints saved in the Kernel Inner)
                        |
                        |
                        |
                    ____|____    ___________ We don't validate that the RHS is empty,
                   |  |  |  |   |  |  |  |   we accept what the app tells us.
                   v  v  v  v   v  v  v  v
app:             [ a, b, c, d | ?, ?, ?, ?]
                   ^  ^  ^  ^ ^
                   |  |  |  | |____length - unvalidated until the tail, but propagated as though correct.
   assert_equal----|  |  |  | |
                   |  |  |  | |
                   v  v  v  v v
out hint:        [ a, b, c, d | ?, ?, ?, ?]
                                ^  ^  ^  ^
                                |__|__|__|__ We don't check that these are 0.
                                             The prover might have populated them with any data (through hints).
                                             We know the length is correct, so we can safely
                                             overwrite these in the next kernel iteration.


Assertions:
- `length` is equal in both arrays.
- The LHS values are equal (up to the length), noting that they could cheekily be 0s at this point.

The RHS values of the out array are not validated. The prover could have snuck anything in there. We'll catch them in a later circuit.



                                                LHS _any_ values
                                                (incl 0s)
                                                   |_    _________________ Not validated to be empty yet.
                                                  |  |  |  |  |  |  |  |
                                                  v  v  v  v  v  v  v  v
prev kernel: [ a, b, c, d| ?, ?, ?, ?]     app: [ e, f| ?, ?, ?, ?, ?, ?]
               ^  ^  ^  ^^                        ^  ^^
               |  |  |  ||___________             |  ||
               |  |  |  |   ________ |____________|  ||
               |  |  |  |  |   _____ | ______________||
               |  |  |  |  |  | _____|________________|
               |  |  |  |  |  ||     sum the lengths
               v  v  v  v  v  vv
out hint:    [ a, b, c, d, e, f| ?, ?]

Assertions:
- prev.length + app.length == out.length
- prev LHS values equal the out values, up to the prev.length.
- app LHS values equal the out values, between prev.length and out.length

The RHS values of the out array are not validated. The prover could have snuck anything in there. We'll catch them in a later circuit.


RESET CIRCUIT:

prev kernel: [ a, b, c, d, e, f| ?, ?]
               ^  ^  ^  ^  ^  ^
               |  |  |  |  |  |
               |  |  X  |  X  |  squash
               |  |   __|     |
               |  |  |   _____|
               |  |  |  |
               v  v  v  v
"kept" hint: [ a, b, d, f| ?, ?, ?, ?]

Before sorting, we need to ensure there are no rogue nonempty values on the RHS,
so that they don't get sneakily sorted into the LHS.

             [ a, b, d, f| 0, 0, 0, 0] <--- assert RHS zero


sorted:      [ b, f, a, d| 0, 0, 0, 0] (sorted by counter; not shown here)


(siloed & made unique - neither steps are shown here)

padded after the sorted length (in this example to length 7),

then RHS asserted to be 0

out hint:    [ a, b, d, f, p, p, p| 0]

---

# arrays.nr Audit Report by Claude

**File**: `noir-projects/noir-protocol-circuits/crates/types/src/utils/arrays.nr`

---

## Overview

This file provides array utilities for the Aztec protocol circuits, including:
- Basic array operations (`subarray`, `array_merge`, `array_length`)
- Index finding functions (`find_index_hint`, `find_index_hint_in_reverse`)
- Validation utilities (`check_permutation`, `array_padded_with`, `array_length_until`)
- The `ClaimedLengthArray` wrapper struct for kernel circuit use

The file also re-exports from submodules:
- `assert_trailing_zeros` from `assert_trailing_zeros.nr`
- `find_first_index`, `find_last_index` from `find_index.nr`
- `get_sorted_tuples`, `SortedTuple` from `get_sorted_tuples.nr`

---

## Issues Found

### 1. Bad/Unclear Comments

#### 1.1 Inverted assertion message in `array_length_until` (lines 170-173)

**Location**: `arrays.nr:170-173`

```noir
assert(
    stop == false,
    "matching element found after already encountering a non-matching element",
);
```

**Problem**: The error message is backwards. When this assertion fails:
- `stop` is `true` → a matching element was previously encountered
- We're in the `else` branch → current element is non-matching

**Correct message**: `"non-matching element found after already encountering a matching element"`

**Severity**: Medium - causes confusion during debugging

---

#### 1.2 Confusing assertion message in `assert_dense_trimmed` (line 241)

**Location**: `arrays.nr:241`

```noir
assert(!self.array[i].is_empty(), "LHS of input array is not dense")
```

**Problem**: The message phrasing is awkward. If the assertion fails, the element IS empty, so the LHS is NOT dense. The message is technically correct but reads strangely as an error.

**Suggested fix**: `"Expected LHS of array to be dense, but found empty element at index"`

**Severity**: Low - grammatically correct but confusing

---

#### 1.3 Cryptic comment about constructor (line 232)

**Location**: `arrays.nr:232`

```noir
// No constructor. Append to an empty one.
```

**Problem**: This comment is cryptic. It's not clear what "append to an empty one" means.

**Suggested fix**:
```noir
// Create instances using `ClaimedLengthArray::empty()` then call `push()`,
// or use `ClaimedLengthArray::from_bounded_vec()`.
```

**Severity**: Low

---

#### 1.4 Inconsistent example in `for_each_i` comment (lines 284-285)

**Location**: `arrays.nr:284-285`

```noir
// E.g.
// dest.for_each_i(|source_item, i| { assert_eq(dest.array[i], source_item); })
```

**Problem**:
- Uses `dest` as the receiver but `source_item` as parameter name
- The lambda receives items from `self.array`, not from a "source"
- Accessing `dest.array[i]` inside a method called on `dest` is redundant

**Suggested fix**:
```noir
// E.g. comparing two arrays:
// self.for_each_i(|item, i| { assert_eq(other.array[i], item); })
```

**Severity**: Low

---

#### 1.5 Vague TODO about compiler bug (line 301)

**Location**: `arrays.nr:301`

```noir
// TODO: compiler bug. No idea why this is needed, if we have #[derive(Eq)] above the struct definition.
```

**Problem**:
- The struct does NOT have `#[derive(Eq)]` - only `#[derive(Deserialize, Serialize)]`
- The comment claims there's a compiler bug but provides no issue reference
- This may be stale or the author forgot to add the derive

**Action needed**: Either:
1. Add `#[derive(Eq)]` to see if it works now and remove manual impl
2. File a Noir issue and reference it here
3. Investigate and document why the derive doesn't work

**Severity**: Low - but indicates technical debt

---

#### 1.6 Unexplained acronym "RHS" (lines 102-103)

**Location**: `arrays.nr:102-103`

```noir
// Returns an array length defined by fully trimming _all_ "empty" items
// from the RHS.
```

**Problem**: "RHS" (Right Hand Side) may not be obvious to all readers.

**Suggested fix**: `"...from the end of the array."`

**Severity**: Very low

---

#### 1.7 Misleading test comment (line 413)

**Location**: `arrays.nr:413`

```noir
assert_eq(array_padded_with(array, 5, 44), true); // Index out of bounds.
```

**Problem**: The comment says "Index out of bounds" but:
- The index is NOT out of bounds in the traditional sense
- Passing `from_index=5` for a 5-element array means the loop never checks anything
- The function correctly returns `true` because no elements fail the check

**Suggested fix**: `// from_index past array end, so nothing is checked`

**Severity**: Very low

---

### 2. Missing Documentation

#### 2.1 `check_permutation` has no documentation (line 180)

**Location**: `arrays.nr:180-196`

```noir
pub fn check_permutation<T, let N: u32>(
    original_array: [T; N],
    permuted_array: [T; N],
    original_indexes: [u32; N],
)
```

**Problem**: Public function with no doc comment. Should explain:
- What the function verifies
- The meaning of `original_indexes` (maps permuted index → original index)
- The assertion behavior

**Suggested documentation**:
```noir
/// Verifies that `permuted_array` is a valid permutation of `original_array`.
///
/// # Arguments
/// * `original_array` - The source array
/// * `permuted_array` - The permuted result to verify
/// * `original_indexes` - For each index `i` in `permuted_array`, `original_indexes[i]`
///   gives the index in `original_array` where that element came from
///
/// # Panics
/// * "Invalid index" - if `permuted_array[i] != original_array[original_indexes[i]]`
/// * "Duplicated index" - if any index in `original_indexes` is used more than once
```

---

#### 2.2 `assert_dense_trimmed` has no documentation (line 236)

**Location**: `arrays.nr:236-248`

**Problem**: Important validation method with no doc comment.

**Suggested documentation**:
```noir
/// Validates that the array is properly structured:
/// - All elements at indices `0..self.length` are non-empty (dense)
/// - All elements at indices `self.length..N` are empty (trimmed)
///
/// This is used to validate that the claimed length matches the actual array contents.
```

---

#### 2.3 `get_sorted_tuples` has no documentation (get_sorted_tuples.nr:15)

**Location**: `get_sorted_tuples.nr:15-27`

**Problem**: No doc comment explaining the function or the `ordering` parameter.

**Suggested documentation**:
```noir
/// Sorts an array while preserving original indices.
///
/// # Arguments
/// * `array` - The array to sort
/// * `ordering` - Comparison function. Returns `true` if first argument should come before second.
///                For ascending order: `|a, b| a < b`
///                For descending order: `|a, b| a > b`
///
/// # Returns
/// Array of `SortedTuple` where each tuple contains the element and its original index.
```

---

#### 2.4 `SortedTuple` struct has no documentation (get_sorted_tuples.nr:1)

**Location**: `get_sorted_tuples.nr:1-4`

**Suggested documentation**:
```noir
/// A tuple pairing an element with its original index before sorting.
/// Used by `get_sorted_tuples` to track element origins after sorting.
pub struct SortedTuple<T> {
    /// The element value
    pub elem: T,
    /// The index this element had in the original unsorted array
    pub original_index: u32,
}
```

---

### 3. Potential Bugs

#### 3.1 Error message inversion in `array_length_until`

**Location**: `arrays.nr:170-173`

As described in section 1.1, the error message states the opposite of what's happening. This is a UX/debugging bug that would cause confusion when the assertion fails.

**Impact**: Medium - incorrect error messages waste developer time

---

### 4. Missing Tests

#### 4.1 Functions in `arrays.nr` with no tests

| Function | Lines | Notes |
|----------|-------|-------|
| `subarray` | 19-28 | No tests |
| `array_merge` | 120-138 | No tests |
| `array_merge_helper` | 140-159 | Unconstrained helper, could test indirectly |
| `trimmed_array_length_hint` | 104-116 | No tests |

#### 4.2 `ClaimedLengthArray` methods with no tests

| Method | Line | Notes |
|--------|------|-------|
| `assert_dense_trimmed` | 236 | Critical validation, needs tests |
| `assert_empty` | 250 | Needs tests |
| `assert_length_within_bounds` | 257 | Needs tests |
| `push` | 261 | Needs tests including overflow case |
| `pop` | 269 | Needs tests including underflow case |
| `for_each` | 279 | Needs tests |
| `for_each_i` | 286 | Needs tests |
| `from_bounded_vec` | 296 | Needs tests |
| `empty` (Empty impl) | 315 | Needs tests |
| `eq` (Eq impl) | 306 | Needs tests |

#### 4.3 Submodule test gaps

**`assert_trailing_zeros.nr`**:
- No tests at all
- Should test: valid trailing zeros, non-zero after breakpoint, edge cases (empty, all zeros, no zeros)

**`get_sorted_tuples.nr`**:
- Only one test (ascending u64)
- Missing tests for:
  - Descending order
  - Empty arrays (if N=0 is valid)
  - Single element arrays
  - Arrays with duplicate values
  - Stability (same values maintain relative order?)
  - Different types

**`find_index.nr`**:
- Has good test coverage ✓

---

## Code Quality Observations

### Positive

1. Good use of `unconstrained` for hint functions that are verified separately
2. Safety comments explain why `unsafe` blocks are sound
3. `ClaimedLengthArray` is well-designed for the kernel circuit use case
4. `for_i_in_0_` usage avoids runtime-dependent loop bounds

### Areas for Improvement

1. **Deprecation annotation**: `array_length` is marked as "Deprecated" in doc comment but lacks `#[deprecated]` attribute
2. **Consistency**: Some functions have doc comments (`///`), others have regular comments (`//`)
3. **Section organization**: The "FREE ARRAY FUNCTIONS (to deprecate...)" section header suggests technical debt

---

## Recommended Actions

### High Priority
1. Fix inverted error message in `array_length_until` (line 172)
2. Add tests for `ClaimedLengthArray` methods
3. Add tests for `assert_trailing_zeros`

### Medium Priority
4. Add documentation for `check_permutation`
5. Add documentation for `assert_dense_trimmed`
6. Add tests for `subarray`, `array_merge`, `trimmed_array_length_hint`
7. Clarify the "No constructor" comment

### Low Priority
8. Investigate and resolve the `#[derive(Eq)]` TODO
9. Expand `get_sorted_tuples` test coverage
10. Fix misleading test comment about "Index out of bounds"
11. Consider adding `#[deprecated]` attribute to `array_length`

---

## File Structure

```
arrays.nr
├── Module declarations & re-exports (lines 1-11)
├── ARRAY section (lines 13-63)
│   ├── subarray
│   ├── find_index_hint
│   └── find_index_hint_in_reverse
├── FREE ARRAY FUNCTIONS section (lines 65-211)
│   ├── array_length (deprecated)
│   ├── trimmed_array_length_hint
│   ├── array_merge + helper
│   ├── array_length_until
│   ├── check_permutation
│   └── array_padded_with
├── ARRAY WRAPPERS section (lines 213-318)
│   ├── ClaimedLengthArray struct
│   ├── ClaimedLengthArray impl (methods)
│   ├── Eq impl
│   └── Empty impl
└── Tests (lines 320-415)
    ├── array_length tests
    ├── array_length_until tests
    ├── find_index_hint tests
    ├── check_permutation tests
    └── array_padded_with tests
```

---

## Submodule Summary

| File | Functions | Test Coverage |
|------|-----------|---------------|
| `assert_trailing_zeros.nr` | `assert_trailing_zeros` | None |
| `find_index.nr` | `find_first_index`, `find_last_index` | Good |
| `get_sorted_tuples.nr` | `get_sorted_tuples`, `SortedTuple` | Minimal |
