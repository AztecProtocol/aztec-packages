# Sumcheck Round Cleanup Plan

## Goal

Simplify `sumcheck_round.hpp` by separating four concerns that are currently interleaved:

- edge materialization
- edge range planning
- edge accumulation scheduling
- relation batching

The current branch adds useful optimizations, but they are integrated as local branches inside `SumcheckProverRound`.
The target shape is a small pipeline where each stage owns one policy decision.

```cpp
SumcheckRoundUnivariate compute_univariate(...)
{
    const auto ranges = make_edge_ranges<Flavor>(polynomials, round_size, excluded_head_size);
    const auto chunks = make_edge_chunks(ranges, SumcheckFlavorPolicy<Flavor>::rows_per_chunk);

    auto accumulators = accumulate_edge_chunks<Flavor>(
        polynomials, chunks, relation_parameters, gate_separators);

    return batch_relation_accumulators<Flavor, SumcheckRoundUnivariate>(
        accumulators, alphas, gate_separators, row_disabling_polynomial);
}
```

## Current Problems

### Edge Loading Has Multiple Interfaces

The file currently has three ways to load edge data:

- eager `extend_edges(...)`
- AVM `ExtendedEdges(polynomials)` with `set_current_edge(...)`
- short-monomial `LazyExtendedEdges`

`make_extended_edges(...)` and `load_edge(...)` partially hide this, but AVM still has its own accumulation loop.

### Row Range Planning Is Mixed With Scanning

`compute_contiguous_round_size(...)` computes the effective size, chooses static versus dynamic row skipping, scans
dynamic ranges, merges blocks, and returns the final manifest. These are separate decisions and should have separate
names.

### Accumulation Loops Are Duplicated

The non-row-skipping branch, manifest branch, AVM branch, offset contribution, and virtual contribution all repeat the
same basic edge accumulation sequence:

- create an edge container
- load an edge
- compute the scaling factor
- call `accumulate_relation_univariates(...)`

The differences are edge source, chunk source, and scaling policy.

### Relation Batching Policy Is Embedded In Generic Code

`extend_and_batch_univariates(...)` now contains both serial and parallel batching. The parallel choice is controlled by
a heuristic expression in generic sumcheck code:

```cpp
Flavor::NUM_SUBRELATIONS * ExtendedUnivariate::LENGTH * ExtendedUnivariate::LENGTH > 20000
```

This is a useful optimization for heavy relation sets, but it should be a named flavor policy or helper.

### Prover-Only Relation Fast Paths Use Type Shape As Intent

Several relation fast paths are guarded by:

```cpp
if constexpr (requires { Accumulator::LENGTH; }) {
    ...
}
```

That works, but it encodes "prover univariate accumulator" as "has a `LENGTH` member". A named concept would make the
relation code clearer.

## Proposed Steps

### 1. Introduce `EdgeSource`

Add a small edge-loading abstraction, likely in `sumcheck/edge_source.hpp`.

```cpp
auto edge_source = make_edge_source<Flavor>(polynomials);

for (size_t edge_idx = chunk.begin; edge_idx < chunk.end; edge_idx += 2) {
    const auto& edges = edge_source.load(edge_idx);
    accumulate_relation_univariates(accum, edges, relation_parameters, scaling_factor);
}
```

Implementations:

- eager source: owns reusable `ExtendedEdges`, calls `extend_edges(...)`
- AVM source: owns AVM lazy edge view, calls `set_current_edge(...)`
- short-monomial source: owns `LazyExtendedEdges`, calls `set_current_edge(...)`

After this, `compute_univariate_avm(...)` should be removed or become a thin wrapper around shared accumulation.

### 2. Rename `BlockOfContiguousRows` To `EdgeRange`

Replace:

```cpp
struct BlockOfContiguousRows {
    size_t starting_edge_idx;
    size_t size;
};
```

with:

```cpp
struct EdgeRange {
    size_t begin;
    size_t end;
};
```

Use `[begin, end)` consistently. This removes ambiguity between rows, edge pairs, and range sizes.

### 3. Split Edge Range Planning

Factor range planning into named helpers:

- `normal_edge_ranges(...)`
- `static_prefix_edge_ranges(...)`
- `dynamic_skip_edge_ranges(...)`
- `merge_edge_ranges(...)`

Then expose one entry point:

```cpp
auto ranges = make_edge_ranges<Flavor>(polynomials, round_size, excluded_head_size);
```

Flavor-specific behavior should be selected by traits, not by concrete flavor names inside generic sumcheck code.

Suggested policy:

```cpp
enum class RowSkipManifestKind {
    NONE,
    TIGHT_ACTIVE_PREFIX,
    DYNAMIC_SKIP_PREDICATE,
};

template <typename Flavor> struct SumcheckFlavorPolicy {
    static constexpr RowSkipManifestKind row_skip_manifest = RowSkipManifestKind::NONE;
    static constexpr size_t rows_per_chunk = 64;
    static constexpr bool parallel_relation_batching = false;
};
```

### 4. Factor One Edge Accumulation Loop

Create one helper that owns:

- per-slot accumulators
- per-slot edge source
- chunk stealing
- edge scaling
- accumulator merge

The helper should receive chunks and return accumulated relation univariates. It should not batch relations.

```cpp
auto accumulators = accumulate_edge_chunks<Flavor>(
    polynomials, chunks, relation_parameters, gate_separators);
```

This should replace the duplicated bodies in the AVM, non-manifest, and manifest paths.

### 5. Introduce `RelationBatcher`

Move serial versus parallel batching out of `extend_and_batch_univariates(...)`.

```cpp
template <typename Flavor, typename ExtendedUnivariate, typename Tuple>
struct RelationBatcher {
    static ExtendedUnivariate run(const Tuple& tuple,
                                  const GateSeparatorPolynomial<FF>& gate_separators,
                                  const RowDisablingPolynomial<FF>* row_disabling);
};
```

The parallel path should be enabled by a named policy, for example:

```cpp
SumcheckFlavorPolicy<Flavor>::parallel_relation_batching
```

If the runtime-to-constexpr scan remains measurable in ECCVM, replace it with a compile-time generated job table.

### 6. Add Shared Prover Relation Helpers

Introduce a semantic concept:

```cpp
template <typename Accumulator>
concept ProverUnivariateAccumulator = requires { Accumulator::LENGTH; };
```

Use it in permutation and Poseidon2 relation fast paths.

For Poseidon2, factor repeated pow5 logic into one helper:

```cpp
template <typename Accumulator, typename CoeffAcc>
Accumulator prover_optimized_pow5_from_linear(const CoeffAcc& x);
```

The helper should keep verifier behavior unchanged while letting the prover square once in coefficient basis before
promotion.

## Suggested PR Split

1. Pipeline refactor only, no intended performance change.
2. `EdgeSource` support for short-monomial lazy loading.
3. Edge range planning cleanup for ECCVM and Translator.
4. Relation batching policy/helper for heavy relation sets.
5. Relation algebra helper cleanup for permutation and Poseidon2 fast paths.

## Tests To Add Or Run

- Existing sumcheck/prover tests for Ultra, Mega, ECCVM, Translator, and AVM.
- Unit tests for edge range planning:
  - normal single range
  - static prefix with zero prefix
  - static prefix overlapping the final edge pair
  - dynamic skip with adjacent and separated live blocks
- Lazy edge source equivalence test against eager edge source for one short-monomial flavor.
- Serial versus parallel `RelationBatcher` equivalence test for ECCVM accumulators.
- Poseidon2 pow5 helper equivalence test against the promote-then-square path.
- Permutation fast-path equivalence tests:
  - general path
  - `lagrange_first = lagrange_last = 0`
  - first and last edge cases where the fast path must not trigger
