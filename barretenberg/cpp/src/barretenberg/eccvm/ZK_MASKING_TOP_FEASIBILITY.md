# Feasibility: Moving ZK Masking to Top of Trace (All Flavors)

## Goal

Move ZK masking from the bottom of the trace (rows n-4..n-1) to the top (rows 0..3) for UltraZK, MegaZK, and ECCVM simultaneously. This eliminates branching in sumcheck and the row-disabling polynomial, and is a prerequisite for variable `lagrange_last` in ECCVM.

## Current Layout (All Flavors)

```
Row 0:           Zero row (for shift mechanism)
Rows 1..n-5:     Active trace
Rows n-4..n-1:   Disabled (row-disabling polynomial kills these)
  n-3, n-2, n-1: Masked with random values (ZK)
  n-4:           Shift buffer for masked rows
```

## Proposed Layout

```
Rows 0..3:       Disabled (row-disabling polynomial kills these)
  0, 1, 2:       Masked with random values (ZK)
  3:              Shift buffer for masked rows
Row 4:           Zero row (for shift mechanism) — or implicit via start_index
Rows 5..n-1:     Active trace
```

---

## Infrastructure Changes (Shared)

### Row-disabling polynomial (`row_disabling_polynomial.hpp`)
Currently hardcoded for `L_{n-1} + L_{n-2} + L_{n-3} + L_{n-4}`. Must change to `L_0 + L_1 + L_2 + L_3`.

The new evaluation at multilinear challenge `(u_0, ..., u_{d-1})` collapses to `∏_{i≥2}(1 - u_i)` — simpler than the current formula and **independent of circuit size**.

**Complexity: Low.** Clean formula swap. The `evaluate_at_challenge` and round-by-round update logic both simplify.

### Masking tail data (`masking_tail_data.hpp`)
Currently: tails at positions `{n-3, n-2, n-1}`, shifted tails at `{n-4, n-3, n-2}`.
New: tails at positions `{0, 1, 2}` (for unshifted with `start_index=0`), shifted tails at `{0, 1, 2}` (shifted polys have `start_index=0`).

`register_all_masked_polys`, `fold_masking_values`, and `apply_claimed_eval_corrections` all compute `start = dyadic_size - NUM_MASKED_ROWS`. This changes to `start = 0`.

The Lagrange basis positions for corrections change from `{n-3, n-2, n-1}` to `{0, 1, 2}`, which dramatically simplifies the folding math in round 0.

**Complexity: Low-Medium.** Position arithmetic changes, folding formulas simplify.

### Sumcheck round (`sumcheck_round.hpp`)
Currently: `excluded_tail_size = 4`, computed from the end (`start_edge_idx = round_size - excluded_tail_size`). Must change to compute from the start (`start_edge_idx = 0`, process first 4 edge pairs).

**Complexity: Low.** Index flip.

---

## UltraZK

PR #16557 ("remove padding indicator array") already started this work. The key insight: with masking at the top, the row-disabling polynomial is independent of circuit size, eliminating `padding_indicator_array` from all verifiers.

**Relations:** UltraZK relations use `lagrange_first`, `lagrange_second` etc. as abstract selectors. They don't hardcode row indices. Moving lagrange positions to rows 4/5 is a polynomial initialization change, not a relation logic change.

**Complexity: Low.** Mostly done by PR #16557; may need finishing touches.

---

## MegaZK

### ECC Op Wires — The Main Challenge

The `EccOpQueueRelation` enforces:
```
lagrange_ecc_op[i] * (ecc_op_wire[i] - w_shift[i]) = 0    // inside block
(1 - lagrange_ecc_op[i]) * ecc_op_wire[i] = 0              // outside block
```

Currently:
- `ecc_op_wire` stores data starting at index 0
- `lagrange_ecc_op` is 1 at rows `[0, num_ecc_ops)`
- `ecc_op_wire[i] = wire[i + NUM_ZERO_ROWS]` (populated in `trace_to_polynomials.cpp:105`)
- The ecc_op block **must be first** in the execution trace for this mapping to hold

With masking at top (rows 0-3 disabled):
- The ecc_op block shifts to start at row `NUM_DISABLED_ROWS_IN_SUMCHECK + NUM_ZERO_ROWS = 5`
- `ecc_op_wire` data starts at index 4 (or index `NUM_DISABLED_ROWS_IN_SUMCHECK`)
- `lagrange_ecc_op` is 1 at rows `[4, 4 + num_ecc_ops)`
- The mapping becomes: `ecc_op_wire[i + 4] = wire[i + 4 + NUM_ZERO_ROWS]`

**The relation itself doesn't change** — it uses `lagrange_ecc_op` as a selector, which is position-agnostic. Only the trace population code changes:

```cpp
// Current (trace_to_polynomials.cpp)
ecc_op_wire.at(i) = wire[i + NUM_ZERO_ROWS];
ecc_op_selector.at(i) = 1;

// New
const size_t offset = NUM_DISABLED_ROWS_IN_SUMCHECK;
ecc_op_wire.at(i + offset) = wire[i + NUM_ZERO_ROWS + offset];
ecc_op_selector.at(i + offset) = 1;
```

**Complexity: Low.** One offset constant in `add_ecc_op_wires_to_prover_instance`.

### Execution Trace Block Ordering

`compute_offsets()` currently starts at offset 1 (for the zero row):
```cpp
uint32_t offset = 1; // start at 1 because the 0th row is unused
```
Must change to:
```cpp
uint32_t offset = NUM_DISABLED_ROWS_IN_SUMCHECK + NUM_ZERO_ROWS; // = 5
```

**Complexity: Low.** One constant change.

### Merge Protocol

The merge prover/verifier operates on the `ECCOpQueue`'s ultra_ops_table columns independently of the execution trace layout. It proves `M_j(X) = L_j(X) + X^k * R_j(X)` for each wire column. This is completely separate from where ecc_op_wires sit in the trace.

**The merge protocol is NOT affected by moving masking to the top.**

The merge verifier receives commitments to the merged table columns and verifies them against the ecc_op_wire commitments. The ecc_op_wire commitments change (because the data is at different positions), but the merge protocol's algebraic structure is position-independent.

**Complexity: None.** No changes needed.

### Shifted Wire Mechanism

Wires are allocated as `Polynomial::shiftable(size, dyadic_size)` with `start_index = NUM_ZERO_ROWS = 1`. `wire[0]` is always 0 by construction (below `start_index`). The shifted version `wire_shift` has `start_index = 0`, so `wire_shift[0] = wire[1]`.

With masking at top: masking tails add random values at the top positions of the polynomial. Since `wire.start_index = 1`, the masking tail for unshifted wires would be at positions `{1, 2, 3}`. For shifted wires, at `{0, 1, 2}`. This is consistent — shifted tails start one position earlier, same as current bottom-of-trace layout.

The zero row (`wire[0] = 0`) is preserved because it's below `start_index`. Masking values go into `{1, 2, 3}` which are within the disabled region (rows 0-3), killed by row-disabling.

**Complexity: Low.** Masking tail positions change but the mechanism is the same.

### Grand Product / Permutation

The grand product `z_perm` is computed over `[0, unmasked_witness_size)`. Currently `unmasked_witness_size = n - 4`. With masking at top, it becomes `n - 4` as well (the total active range stays the same, just shifted). `lagrange_first` initializes the grand product at the first active row.

**Complexity: Low.** Boundary initialization shifts but the relation uses `lagrange_first` abstractly.

---

## ECCVM

The ECCVM has its own independent trace builder and relations. No shared execution trace infrastructure with Ultra/Mega.

### Lagrange polynomial relocation
`lagrange_first` → row 4 (was row 0), `lagrange_second` → row 5 (was row 1), `lagrange_third` → row 6 (was row 2). These are just polynomial initialization changes.

### Relations
All ECCVM relations reference `lagrange_first/second/third/last` as abstract selectors. They don't hardcode row indices. No relation code changes needed.

### Trace builder
The three trace sections (transcript, MSM, point table) must start populating at row `NUM_DISABLED_ROWS_IN_SUMCHECK` instead of row 0. The parallel_for_range loops get an offset.

### Translation masking shift
With masking at the top, the shift factor in `shift_translation_masking_term_eval` becomes `x^NUM_DISABLED_ROWS_IN_SUMCHECK` (a fixed, small constant) instead of `x^{n - NUM_DISABLED_ROWS_IN_SUMCHECK}`. Simpler and independent of circuit size.

**Complexity: Low-Medium.** Trace builder offsets + lagrange relocation. Clean and self-contained.

---

## Complexity Summary

| Component | UltraZK | MegaZK | ECCVM | Shared |
|-----------|---------|--------|-------|--------|
| Row-disabling polynomial | — | — | — | **Low** (formula swap) |
| Masking tail data | — | — | — | **Low-Med** (position flip) |
| Sumcheck round | — | — | — | **Low** (index flip) |
| Relations | None | None | None | — |
| ECC op wire population | — | **Low** (offset) | — | — |
| Trace block ordering | — | **Low** (offset) | — | — |
| Merge protocol | — | **None** | — | — |
| Lagrange relocation | **Low** | **Low** | **Low** | — |
| Trace builder offsets | — | — | **Low-Med** | — |
| Translation masking shift | — | — | **Low** | — |
| Grand product boundaries | **Low** | **Low** | **Low** | — |
| VK / hardcoded hashes | **Low** | **Low** | **Low** | — |

**Overall complexity: Medium.** The changes are spread across many files but each individual change is small and mechanical. No algorithmic redesign needed. The hardest part is getting all the offsets right and testing thoroughly.

## Recommendation

Do all three flavors at once. The shared infrastructure (row-disabling, masking tail, sumcheck round) changes once and benefits all flavors. The flavor-specific changes are small. Doing them separately would require branching in the shared code, which is exactly what we're trying to eliminate.

## Risk

The main risk is subtle off-by-one errors in the offset arithmetic, particularly around:
- Shifted vs unshifted masking tail positions
- ECC op wire mapping in MegaZK
- Grand product boundary conditions

Mitigation: each flavor has comprehensive tests (ECCVM prove/verify, Ultra/Mega prove/verify) that will catch any misalignment.
