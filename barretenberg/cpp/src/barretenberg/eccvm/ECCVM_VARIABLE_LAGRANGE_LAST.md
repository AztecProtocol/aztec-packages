# ECCVM Variable Lagrange Last

## Problem

ECCVM proving is dyadic: the trace must be padded to the next power of 2 because `lagrange_last` and ZK masking are fixed at the last rows. If actual trace has 2^15 + 1 rows, we pad to 2^16 — nearly doubling prover work.

## Design

### Key idea
Move masking rows to the **top** of the trace (rows 0-3) and make `lagrange_last` a **committed witness** polynomial at a variable position `idx`. The verifier never learns `idx`, preserving ZK.

### Trace layout

| Rows | Content |
|------|---------|
| 0-3 | Masking (random values, disabled by precomputed row-disabling) |
| 4 | Initialization (was `lagrange_first` at row 0) |
| 5 | Hiding operation (was `lagrange_second` at row 1) |
| 6 | First real operation (was `lagrange_third` at row 2) |
| 4..idx | Active trace |
| idx+1..n-1 | Padding (no-op rows, relations satisfied by construction) |

### Row-disabling polynomial (precomputed, verifier-computable)

Disables the first 4 rows. The sum L_0 + L_1 + L_2 + L_3 evaluated at multilinear challenge (u_0, ..., u_{d-1}) collapses to:

```
prod_{i >= 2} (1 - u_i)
```

because the first two bits exhaust all 4 combinations. Row-disabling = `1 - prod_{i>=2}(1 - u_i)`.

The verifier computes this independently — no witness needed.

### Constraining lagrange_last as a witness

`lagrange_last` is a committed, masked witness polynomial. Constrained via:

1. **Boolean**: `lagrange_last * (1 - lagrange_last) = 0` (degree 2)
2. **Running sum** `S` starting at row 4:
   - `lagrange_fourth * S = 0` (S starts at 0 at row 4)
   - `S_shift - S - lagrange_last = 0` (S increments where lagrange_last = 1, degree 1)
   - At dyadic boundary: `S(n-1) = 1` (checked via precomputed lagrange for dyadic last row)

Boolean + sum-to-1 forces `lagrange_last` to be exactly 1 at one row and 0 everywhere else = valid Lagrange basis polynomial.

### Masking

- `lagrange_last` is masked in rows 0-3 like all other witnesses (random values)
- Running sum `S` is also masked in rows 0-3
- Row-disabling kills rows 0-3 in all relations, so random masking values don't affect constraint checks
- Running sum relation lives inside row-disabling (starts at row 4), so masking values don't corrupt the accumulation

### ECCVM-Translator integration: translation masking shift

The translation polynomials (`op`, `Px`, `Py`, `z1`, `z2`) are opened as univariates at a challenge point `x`. Their masking uses the formula:

```
x * A = ∑ T_i(x) * v^i - x^N * masking_term_eval
```

where `N = circuit_size - NUM_DISABLED_ROWS_IN_SUMCHECK` is the unmasked witness size. The verifier computes `x^N` via `shift_translation_masking_term_eval` (in `goblin/translation_evaluations.hpp`).

With masking at the top, the masking terms occupy the first `NUM_DISABLED_ROWS_IN_SUMCHECK` coefficients and the real data starts at index 4. The shift factor changes accordingly but remains a fixed, known quantity — no dependence on `idx`.

### What stays the same

- Padding rows after `idx` satisfy relations by construction (same as current ECCVM padding)
- Row-disabling polynomial is precomputed and verifier-computable (just relocated to the top)
- Shifted polynomial mechanics unchanged
- PCS / Gemini / Shplemini unchanged

### Implementation touch points

- **ECCVM flavor**: relocate `lagrange_first/second/third` to rows 4/5/6; add `lagrange_fourth`; add `lagrange_last` and running sum `S` as witness columns
- **ECCVM relations**: update all references to `lagrange_first/second/third` to point to new positions
- **Row-disabling polynomial**: new evaluation formula `1 - prod_{i>=2}(1-u_i)` for first-4-rows variant
- **ECCVM trace builder**: place masking at rows 0-3; start trace at row 4
- **Sumcheck**: handle first-rows row-disabling (currently assumes last rows)
- **Masking tail data**: masking at top instead of bottom — adjust offset logic

### Tradeoff

Extra cost: committing + opening `lagrange_last` and `S` (2 extra polynomials through PCS) + 2 simple constraint relations.

Savings: avoid padding to next power of 2 — can choose tighter dyadic size. For traces much smaller than the dyadic bound, significant prover savings in trace construction and commitment computation.

