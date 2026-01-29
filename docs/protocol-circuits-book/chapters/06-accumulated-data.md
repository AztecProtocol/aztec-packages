# Chapter 6: Accumulated Data Flow

## What is Accumulated Data?

Accumulated data refers to the side effects and requests emitted from private functions that aggregate through the kernel circuits:

| Data Type | Description |
|-----------|-------------|
| `note_hashes` | Commitments to new private notes |
| `nullifiers` | Values marking notes as consumed |
| `l2_to_l1_msgs` | Messages sent from L2 to L1 |
| `private_logs` | Encrypted log data |
| `contract_class_logs_hashes` | Contract class deployment logs |
| `public_call_requests` | Requests to call public functions |
| `private_call_stack` | Stack of pending private calls |

## Data Representation

Arrays are represented using `ClaimedLengthArray<T, N>`:

```rust
struct ClaimedLengthArray<T, N> {
    items: [T; N],      // Fixed-size array
    length: u32,        // Claimed number of valid items
}
```

The `length` field indicates how many items are "valid." Items beyond the length may contain garbage data from hints.

## Guarantees

All valid values emitted from private functions are guaranteed to:

### 1. Be Non-Empty

Although values may initially be empty, kernel circuits add the contract address to each item. This scoping ensures resulting items are non-empty.

### 2. Have Unique Counters

Each side effect has a counter for ordering. The kernel validates:
- Counters are strictly increasing within each call
- Call counter ranges don't overlap
- Counters are non-zero (except for specific edge cases)

```
Call 1: counters [1, 2, 3]
Call 2: counters [4, 5, 6, 7]
Call 3: counters [8, 9]

All counters unique and increasing.
```

## Flow Through Kernel Circuits

### Init Circuit

The first private call's side effects are scoped and appended to empty arrays:

```
Input (from first private call):
  note_hashes: [A, B]        (raw, unscoped)
  nullifiers: [N1]           (raw, unscoped)

Output:
  note_hashes: [Scoped(A, contract), Scoped(B, contract)]
  nullifiers: [protocol_nullifier, Scoped(N1, contract)]
```

**Key validation functions:**
- `assert_array_appended_to_empty_dest_and_scoped`: Verifies items are scoped and appended to empty destination
- `assert_array_appended_reversed_to_empty_dest`: Verifies call stack items are reversed (LIFO order)

### Inner Circuit

Previous data is prepended; new data is scoped and appended:

```
Previous kernel output:
  note_hashes: [Scoped(A, c1), Scoped(B, c1)]

Current call (contract c2):
  note_hashes: [C, D]

Output:
  note_hashes: [Scoped(A, c1), Scoped(B, c1), Scoped(C, c2), Scoped(D, c2)]
```

**Key validation functions:**
- `assert_array_prepended`: Verifies previous items are at the start
- `assert_array_appended_and_scoped`: Verifies new items are scoped and appended
- `assert_array_prepended_up_to_some_length`: For call stack (excludes popped item)

### Reset Circuit

Transient pairs are squashed. Optionally, data is siloed, padded, and sorted:

```
Input:
  note_hashes: [A, B, C, D]
  nullifiers: [N1, N_B, N2]   // N_B nullifies note B

After squashing:
  note_hashes: [A, C, D]      // B removed
  nullifiers: [N1, N2]        // N_B removed

After siloing:
  note_hashes: [silo(A), silo(C), silo(D)]
  nullifiers: [silo(N1), silo(N2)]

After sorting (by counter):
  note_hashes: [silo(C), silo(A), silo(D)]  // sorted by creation order

After padding (to fixed size 7):
  note_hashes: [silo(C), silo(A), silo(D), pad, pad, pad, pad]
```

**Key validation functions:**
- `assert_sorted_padded_transformed_array_capped_size`: Verifies squashing, siloing, sorting, and padding

### Tail Circuit

Remaining data is sorted and transformed to rollup format:

```
Input:
  note_hashes: [Scoped<Counted<NoteHash>>]
  l2_to_l1_msgs: [Scoped<Counted<L2ToL1Message>>]

Output:
  note_hashes: [Field]                    // Just the hash values
  l2_to_l1_msgs: [Scoped<L2ToL1Message>]  // Scoped but no counter
```

**Key validation functions:**
- `assert_sorted_transformed_array`: Verifies sorting and transformation
- `assert_transformed_array`: Verifies transformation only (for pre-sorted data)
- `assert_dense_trimmed_array`: Verifies no nullish items within claimed length

### TailToPublic Circuit

Data is sorted, split by revertibility, and transformed:

```
Input:
  note_hashes: [A(counter=3), B(counter=7), C(counter=12)]
  min_revertible_side_effect_counter = 10

Output (non-revertible, counter < 10):
  note_hashes: [A, B]

Output (revertible, counter >= 10):
  note_hashes: [C]
```

**Key validation functions:**
- `assert_split_sorted_transformed_arrays`: Verifies sorting and splitting
- `assert_split_transformed_arrays_from_sorted_padded_array`: For pre-sorted data

## Visual Flow

```
            App Circuit
                |
                v
        +---------------+
        |  Init Kernel  |  Scope + Initialize
        +---------------+
                |
                v
        +---------------+
        | Inner Kernel  |  Prepend + Append
        +---------------+
                |
               ...       (repeat for each call)
                |
                v
        +---------------+
        | Reset Kernel  |  Squash + Silo + Sort
        +---------------+
                |
        +-------+-------+
        |               |
        v               v
+---------------+ +-------------------+
|  Tail Kernel  | | TailToPublic      |
+---------------+ +-------------------+
        |               |
        v               v
    To Rollup      To Public (AVM)
```

## Array Handling Details

### The RHS Problem

Arrays have a fixed size, but only part is "valid." The Right-Hand Side (RHS) may contain garbage:

```
Logical view:   [A, B, C, D | ?, ?, ?, ?]
                 ^^^^^^^^     ^^^^^^^^^
                  Valid         Garbage (RHS)
                  (LHS)
```

The kernel circuits:
1. Don't validate RHS is empty (to save constraints)
2. Trust the claimed length
3. Validate RHS is zeroed in later circuits

### Validation Deferred

```
App -> Init Kernel:
  - LHS validated (items match)
  - RHS not validated (may have garbage)

Init -> Inner Kernel:
  - Previous LHS validated
  - New LHS validated
  - RHS still not validated

... (continue through kernels) ...

Reset Kernel (final iteration):
  - RHS MUST be validated as zero before sorting
  - Otherwise garbage could be sorted into LHS
```

### The Final Check

Before sorting in Reset:

```
Before validation:
  [A, B, C, D | ?, ?, ?, ?]
               ^^^^^^^^^
               Must verify these are 0

After validation + sort:
  [B, D, A, C | 0, 0, 0, 0]
```

## Summary Table

| Circuit | Data Transformation | Key Validation |
|---------|---------------------|----------------|
| **Init** | Scope + Append to empty | `assert_array_appended_to_empty_dest_and_scoped` |
| **Inner** | Prepend prev + Append new (scoped) | `assert_array_prepended`, `assert_array_appended_and_scoped` |
| **Reset** | Squash, optionally silo/pad/sort | `assert_sorted_padded_transformed_array_capped_size` |
| **Tail** | Sort and transform to rollup format | `assert_sorted_transformed_array` |
| **TailToPublic** | Sort, split, transform to public format | `assert_split_sorted_transformed_arrays` |

\newpage
