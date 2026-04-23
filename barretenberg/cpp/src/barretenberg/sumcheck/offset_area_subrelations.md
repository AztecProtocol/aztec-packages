---
name: Offset-area subrelations via row-disabling dual
description: Design for a sumcheck abstraction that routes subrelations through either (1-L) or L, letting some subrelations be enforced ONLY on the offset rows 0..3; reuses head-edge compute.
type: project
originSessionId: f3bf084c-1550-44f6-b640-ec92a15e8920
---
# Offset-area subrelations (`compute_offset_area_contribution`)

## Motivation

In Mega/Ultra Honk, `TRACE_OFFSET = NUM_DISABLED_ROWS_IN_SUMCHECK = 4`.
`lagrange_first = 1` at row 4. Rows 0..3 are the **offset area**:
- row 0 is zeroed for shiftability (`NUM_ZERO_ROWS = 1`);
- rows 1..3 hold random masks in ZK flavors, and are zero by construction in non-ZK.

The permutation relation + wire shiftability does **not** force wires to vanish on rows 1..3:
the chain `z_perm[i]·num(i) = z_perm[i+1]·denom(i)` degenerates to `0 = 0` once `z_perm` is 0
on the offset, so wire values are unconstrained by the verifier on those rows.

For Mega we want to be able to enforce boundary conditions like `ecc_op_wire_j = 0` on rows 0..3
in a verifier-checkable way. Row-disabling in sumcheck already extracts the offset-area
contribution (multiplied by `(1-L)`); we can reuse that machinery with factor `L` instead.

## Background on row-disabling

- `L = L_0 + L_1 + L_2 + L_3` is the Lagrange indicator of rows 0..3.
- Current sumcheck: main loop sums H over rows 4..n-1; `compute_disabled_contribution`
  (sumcheck_round.hpp:515) computes H on head edges times `(1-L)`.
- `RowDisablingPolynomial` tracks eval_at_0/1 of `(1-L)` per round; `evaluate_at_challenge`
  returns `1 - ∏_{k≥2}(1-u_k)` for the verifier.
- Round 0: `(1-L) = 0` on head edges, so disabled-contribution is 0. Dually, `L = 1` there.
- Doc: row_disabling_polynomial.hpp — full derivation.

## Proposed abstraction — relation-level, opt-in via concept

Tag whole relations (not subrelations) with a marker. Existing relations are untouched;
only relations that fire on the offset area declare the marker.

```cpp
// relations/relation_types.hpp
template <typename R>
concept IsOffsetOnlyRelation = requires { requires R::IS_OFFSET_ONLY; };
```

A relation opts in:

```cpp
class MegaOffsetBoundaryRelation {
public:
    static constexpr bool IS_OFFSET_ONLY = true;
    static constexpr size_t NUM_SUBRELATIONS = 4;
    static constexpr std::array<size_t, NUM_SUBRELATIONS>
        SUBRELATION_PARTIAL_LENGTHS = { 2, 2, 2, 2 };
    // subrelations: w_ecc_op_j for j = 1..4 — "value = 0" on offset rows
    template <typename AccTuple, typename AllEntities>
    static void accumulate(AccTuple&, const AllEntities&, const auto&, const FF&);
};
```

Flavor opts in by listing the relation in its `Relations` tuple — zero flag plumbing:

```cpp
// mega_flavor.hpp (non-ZK variant)
using Relations = std::tuple<
    UltraArithmeticRelation<FF>,
    ...existing...,
    MegaOffsetBoundaryRelation<FF>
>;
```

### Why relation-level, not subrelation-level

- Subrelations in one relation share `accumulate()`, entity reads, and degree bookkeeping.
  A mixed-domain relation would fragment all of it.
- Matches the granularity of existing compile-time dispatch in BB (`IsSkippable`, `HasZK`,
  etc.).
- No `SUBRELATION_DOMAINS` array on ~15 existing relation files.

### Dispatch (all `if constexpr`, zero runtime cost)

1. **Main-loop accumulation** (sumcheck_round.hpp ~490):
   ```cpp
   if constexpr (!IsOffsetOnlyRelation<R>) { accumulate<R>(...); }
   ```
   Offset-only relations never touch main-loop edges.

2. **α scaling** (generalized `scale_univariates`) — see next section:
   ```cpp
   if constexpr (IsOffsetOnlyRelation<R>)
       scale_by(alpha_j * L_uv);
   else
       scale_by(alpha_j * one_minus_L_uv);
   ```
   Per-relation branch, walked once per tuple element.

3. **Verifier final value**: same dispatch over the relation tuple — scale the
   per-relation value by `L(u)` or `(1-L(u))` before summing with α.

## Implementation steps

1. Add `IsOffsetOnlyRelation` concept in `relations/relation_types.hpp`.

2. Extend `RowDisablingPolynomial` with `L_eval_at_0/1` (= `1 - eval_at_0/1`) and
   `evaluate_L_at_challenge(u, log_n) = 1 - evaluate_at_challenge(u, log_n)`.

3. Main-loop accumulation: `if constexpr (!IsOffsetOnlyRelation<R>)` gate at the
   relation-tuple walk. Offset-only relations skip the main loop entirely.

4. Rename `compute_disabled_contribution` → `compute_offset_area_contribution`:
   - keep the single `extend_edges` + `accumulate_relation_univariates`;
   - fold the `L` / `(1-L)` factor into **α-batching** rather than a final post-multiply
     (see next section);
   - round 0: main relations head = 0 (via `(1-L) = 0`), offset relations fully alive
     (`L = 1` there).

### Fold factor into α-batching

`batch_over_relations` (sumcheck_round.hpp:599-608) does two steps:

```
Utils::scale_univariates(acc, challenge);          // per-subrelation, scalar α_j
extend_and_batch_univariates(acc, result, gs);     // sums, collapses subrelations
```

`scale_univariates` is the last stage where relations are still distinct. Generalize
it so on the head-edge pass each relation's α becomes a `Univariate<FF,2>` picked by the
concept:

```
// On the head-edge pass only:
Univariate<FF,2> one_minus_L({1 - rd.eval_at_0, 1 - rd.eval_at_1});
Univariate<FF,2> L          ({rd.eval_at_0,     rd.eval_at_1});
// For relation R, subrelation j:
//   alpha_uv = alpha[j] * (IsOffsetOnlyRelation<R> ? L : one_minus_L)
// scale_univariates then does univariate-by-univariate multiply, bumping each
// subrelation's degree by +1 — the same +1 we were paying via the final
// `result *= one_minus_L_extended` multiply, just distributed per-relation.
```

Effect:
- the final `result *= one_minus_L_extended` at sumcheck_round.hpp:541 goes away;
- no separate `extend_to<LENGTH>()` pass for the L-factor;
- Offset vs Main is a compile-time `if constexpr IsOffsetOnlyRelation<R>` at the scaling
  step; no branch in the hot path;
- main-loop accumulator unchanged (α stays scalar there — `(1-L) = 1`, `L = 0` away
  from the head, so there's nothing to fold).

Only change to `Utils::scale_univariates`: overload/generalize to accept a
`Univariate<FF,2>` α-factor (and produce degree `SUBRELATION_LENGTH`, already including
the +1).

5. Degree: round univariate max degree = `max(max_len(Main), max_len(Offset)) + 1`
   (same +1 as today because `L` and `(1-L)` are both degree 1).

6. Verifier: in final relation value, scale per-relation contributions by
   `(1-L(u))` or `L(u)` according to the concept, then batch with α. One extra scalar eval.

7. First user — `MegaOffsetBoundaryRelation`: subrelations `w_ecc_op_j = 0` for j=1..4,
   tagged `IS_OFFSET_ONLY = true`. Makes ecc_op_wires' offset-area zeros
   verifier-visible. Flavor opts in by listing it in its `Relations` tuple.

## Reused compute

- One `extend_edges` per head edge pair (instead of two if we naively added a second pass).
- One `accumulate_relation_univariates`; tuple-of-tuples splits at compile time.
- Verifier: one extra scalar `L(u)`, negligible.

## Caveats

- **ZK flavors**: rows 1..3 carry random masks. Offset-only relations constraining wires
  would fail there. Flavors that don't want offset checks simply don't list an offset
  relation in their `Relations` tuple — no flag propagation needed.
- **Gate separator (`pow_β`)**: unchanged — `L` and `(1-L)` are orthogonal selectors over
  the same hypercube; pow scheduling is untouched.
- **Proof/VK stability**: adding the concept and the generalized `scale_univariates` is a
  no-op for flavors that don't list an offset relation. Breaking change only arrives when
  a flavor opts in.

## Reusable boundary-relation template

Both Mega (`ecc_op_wire_j = 0`) and batched-Honk translator (its own boundary entities)
want the same pattern: a fixed list of entities forced to zero on rows 0..3. Encapsulate
this as one generic relation, parametrized by an entity accessor supplied by each flavor.

```cpp
// relations/offset_boundary_relation.hpp
template <typename Flavor, auto EntityAccessor>
class OffsetBoundaryRelation {
public:
    using FF = typename Flavor::FF;

    // Tag picked up by the sumcheck dispatch.
    static constexpr bool IS_OFFSET_ONLY = true;

    // One "= 0" subrelation per entity returned by EntityAccessor.
    // Subrelation length is 2 (pure identity check), +1 from L-factor happens at scaling.
    static constexpr size_t NUM_SUBRELATIONS =
        std::tuple_size_v<std::remove_cvref_t<decltype(EntityAccessor(std::declval<const typename Flavor::AllEntities<FF>&>()))>>;
    static constexpr std::array<size_t, NUM_SUBRELATIONS> SUBRELATION_PARTIAL_LENGTHS =
        [] { std::array<size_t, NUM_SUBRELATIONS> a{}; a.fill(2); return a; }();

    template <typename AccTuple, typename AllEntities>
    static void accumulate(AccTuple& acc,
                           const AllEntities& in,
                           const auto& /*params*/,
                           const FF& scaling_factor)
    {
        const auto boundary_entities = EntityAccessor(in);   // std::tuple / std::array of refs
        [&]<size_t... I>(std::index_sequence<I...>) {
            (( std::get<I>(acc) += std::get<I>(boundary_entities) * scaling_factor ), ...);
        }(std::make_index_sequence<NUM_SUBRELATIONS>{});
    }
};
```

Per-flavor wiring is a one-liner:

```cpp
// mega (non-ZK)
constexpr auto mega_ecc_op_entities = [](const auto& in) {
    return std::tie(in.ecc_op_wire_1, in.ecc_op_wire_2,
                    in.ecc_op_wire_3, in.ecc_op_wire_4);
};
using MegaEccOpBoundary = OffsetBoundaryRelation<MegaFlavor, mega_ecc_op_entities>;

// batched-honk translator
constexpr auto translator_boundary_entities = [](const auto& in) {
    return std::tie(/* translator-specific wires that must vanish on offset */);
};
using TranslatorBoundary = OffsetBoundaryRelation<TranslatorFlavor,
                                                  translator_boundary_entities>;
```

Both flavors just append their instantiation to `Flavor::Relations`. No sumcheck or
verifier code learns about either use case.

### What this buys

- One relation implementation, two (or more) zero-sum callers.
- Uniform audit surface: every boundary condition reduces to "entities in list X vanish
  on rows 0..3."
- The `IS_OFFSET_ONLY` tag is on the template itself, so every instantiation inherits
  the correct dispatch — no risk of forgetting to mark a new boundary relation.
- If later we want "= constant" boundary (not just "= 0"), extend the accessor to return
  pairs `(entity, expected_value)` and subtract — still one relation.

## Exposing the row-disabling split for batched Honk translator

Batched Honk translator runs on **MegaZK** (rows 1..3 carry masks), so it does *not*
get its own offset-only relation — those would collide with the masks. What it does
need is a clean, stable API surface that exposes the row-disabling split so the
translator-side prover/verifier can:

- query `L(u)` and `(1-L(u))` at the sumcheck challenge;
- reuse the head-edge univariate contribution as a first-class building block rather
  than inlining it via `compute_disabled_contribution`.

Keep the encapsulation minimal and share one source of truth.

### Prover surface

```cpp
// RowDisablingPolynomial  — holder of both (1-L) and L round evals.
struct RowDisablingPolynomial<FF> {
    FF eval_at_0{1}, eval_at_1{1};                              // (1-L) evals, as today
    FF L_eval_at_0() const { return FF::one() - eval_at_0; }    // new
    FF L_eval_at_1() const { return FF::one() - eval_at_1; }    // new

    void update_evaluations(FF round_challenge, size_t round_idx);   // unchanged
    static FF evaluate_at_challenge(std::span<const FF> u, size_t log_n);   // (1-L)(u)
    static FF evaluate_L_at_challenge(std::span<const FF> u, size_t log_n); // L(u)
};

// Sumcheck round — single entry point for head-edge contribution.
template <typename Flavor>
SumcheckRoundUnivariate compute_offset_area_contribution(
    Polynomials& polys,
    const RelationParameters<FF>& params,
    const GateSeparatorPolynomial<FF>& gate_separators,
    const SubrelationSeparators& alphas,
    const RowDisablingPolynomial<FF>& rd);
```

`compute_offset_area_contribution` handles both factors internally (Main × (1-L),
Offset × L — via `IsOffsetOnlyRelation`). Translator uses it unmodified.

### Verifier surface

```cpp
// Single helper that takes per-relation sumcheck values + α, and returns the batched
// relation value with the correct L vs (1-L) scaling applied. Used by both Mega and
// the translator flow (and any future caller).
template <typename Flavor>
FF batch_relations_with_row_disabling(
    const RelationValuesTuple& per_relation_values,
    const SubrelationSeparators& alphas,
    FF L_at_u,          // RowDisablingPolynomial::evaluate_L_at_challenge
    FF one_minus_L_at_u // RowDisablingPolynomial::evaluate_at_challenge
);
```

Translator-side code that needs the split just calls
`RowDisablingPolynomial::evaluate_{L,}_at_challenge` directly — one function, one fact.
No duplication of the Lagrange-product logic across prover and verifier.

### Why this encapsulation is enough

- Only two public entry points on the prover (`compute_offset_area_contribution` +
  `RowDisablingPolynomial` helpers) and two on the verifier (`batch_relations_...` +
  the same helpers).
- `IsOffsetOnlyRelation` stays entirely inside the sumcheck machinery — translator
  doesn't see it, doesn't need to.
- MegaZK remains unchanged as a flavor: its `Relations` tuple contains no offset-only
  relations (correctly, because of masks), so `compute_offset_area_contribution`
  collapses to exactly today's `compute_disabled_contribution` behavior for it.
- Translator can layer its own protocol-level use of `L(u)` / `(1-L)(u)` on top
  without reaching into sumcheck internals.

## Key files

- `barretenberg/cpp/src/barretenberg/polynomials/row_disabling_polynomial.hpp`
- `barretenberg/cpp/src/barretenberg/sumcheck/sumcheck_round.hpp` (compute_disabled_contribution ~515)
- `barretenberg/cpp/src/barretenberg/sumcheck/sumcheck.hpp`
- `barretenberg/cpp/src/barretenberg/relations/permutation_relation.hpp` (reference for subrelation structure)
- `barretenberg/cpp/src/barretenberg/constants.hpp` (NUM_DISABLED_ROWS_IN_SUMCHECK = 4)
