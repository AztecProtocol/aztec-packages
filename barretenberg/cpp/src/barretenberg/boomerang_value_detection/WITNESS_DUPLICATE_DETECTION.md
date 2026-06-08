# Witness Duplicate Detection

This document describes the current witness duplicate detection mechanism in
`boomerang_value_detection`. It is a description of how the analyzer works today, not a redesign plan.

Producer-side integrations can be found with this search tag:

```text
BOOMERANG_DUPLICATE_PROVENANCE
```

Every piece of code outside `boomerang_value_detection/` that reads, writes, propagates, or supports
the construction-time duplicate provenance channel should carry that tag near the integration point
and point back to this file.

## What The Analyzer Looks For

The analyzer searches for repeated witness values that are not explained by the circuit. A repeated
value is suspicious when two real witness variables have the same assigned field value but are not
forced equal by copy constraints, gate constraints, table consistency, or a known deterministic
materialization rule.

The report is value-first: the analyzer groups real witness indices by `builder.get_variable(idx)`.
A value with only one occurrence is ignored. A value with several occurrences stays visible until one
of the explanation mechanisms proves that all occurrences are non-problematic.

The safe default is to report. A duplicate must not be hidden only because its value resembles a
common gadget constant or table output.

## Graph Model

The analyzer builds a graph over real witness indices. Edges in the main graph represent ordinary
constraint dependencies: if a gate ties several wires together, their real witness indices are
connected. Copy constraints are already encoded through `real_variable_index`, so two copy-equal
witness indices collapse to one real index before duplicate detection.

Duplicate suppression also uses duplicate-search overlays. These overlays are separate from the main
graph. They do not change circuit semantics and are used only to decide whether a repeated value is
already explained by a known structural relation.

A duplicate value is suppressed by a structural overlay only when all occurrences of that value are
in the same duplicate component. If only some occurrences touch an overlay, the value remains
visible. Partial explanations are treated as incomplete evidence.

## Candidate Filtering Pipeline

`StaticAnalyzer::fill_witness_duplicate_map` applies the pipeline below.

1. Build `filtered_witness_value_map` from witness value to the set of real witness indices carrying
   that value. Candidate construction does not drop values just because they are common constants,
   table values, or caller-provided mock-proof values.
2. Remove values with a single occurrence.
3. Build duplicate-search overlays for known relations.
4. Remove a value if all its occurrences are connected by the databus overlay.
5. Remove a value if all its occurrences are explained by the narrow cryptographic-binding rule for
   the batch-merge ECC-op hash rehash.
6. Remove a value if all its occurrences are connected by the combined structural overlay components.
7. Keep values that only partially intersect databus, cryptographic-binding, or structural overlays.
8. Remove caller-supplied rerun-varying filter values. These values are computed by rebuilding
   the same circuit shape with randomized inputs and comparing the original duplicate witness slots
   against the rerun witness slots.
9. In `TRIAGE_VALUE_FILTERS` mode only, remove common high-volume values and caller-provided filter
   values after source-aware checks. `EXPLANATION_ONLY` mode skips this value-only step.
10. Apply narrow materialization filters for MSM, ECC-op, elliptic, modulus arithmetic, constants,
   and fixed witnesses.
11. Print any remaining repeated values with their indices and gate-type distribution.

The gate-type distribution in the output is intentionally part of triage. A remaining duplicate in
ordinary arithmetic rows is more interesting than one isolated to expected materialization rows.

## Structural Overlays

The current overlay set includes these explanation sources:

- ROM/RAM memory table structure;
- databus reads;
- non-native-field derivations;
- arithmetic derivations;
- elliptic operation derivations;
- ECC-op table structure;
- lookup table structure;
- Straus table structure;
- construction-time duplicate provenance groups;
- a cryptographic-binding duplicate explanation for the batch-merge ECC-op hash rehash.

The older overlays recognize established gate/table layouts. They remain narrow and source-aware:
they should explain only values whose repeated occurrences are produced by the same structural
relation.

The construction-time provenance overlay is produced by
`build_provenance_duplicate_adjacency`. It groups real witness indices by provenance key and connects
all indices in each group.

## Suggested Review Order

For a human review, the diff is easiest to audit in this order:

1. `duplicate_provenance.hpp` and the `CircuitBuilderBase` API, including `assert_equal` propagation.
2. Producer tags, one category at a time: bigfield, databus, Poseidon2, ECC-op, MSM/Straus, lookup,
   and range decomposition.
3. Analyzer consumption in `graph.cpp`: provenance overlay, structural overlays, then materialization
   filters in `fill_witness_duplicate_map`.
4. Focused provenance tests in `graph_description_provenance.test.cpp` and producer-specific tests.
5. Slow recursive duplicate tests, which are the integration signal that no remaining duplicates are
   currently considered dangerous.

## Construction-Time Provenance

Some producers know more than the analyzer can recover from selectors after the fact. Those producers
tag derived witnesses at construction time using the analyzer-only channel on `CircuitBuilderBase`:

```cpp
std::unordered_map<uint32_t, DuplicateProvenance> witness_duplicate_provenance;
```

The map key is a real variable index. The value is a structured group key:

```cpp
struct DuplicateProvenance {
    DuplicateProvenanceCategory category;
    std::vector<uint64_t> local_id;
};
```

`category` identifies the producer family. `local_id` is a producer-scoped sequence of identity
words. Producer-local ids should be built with `duplicate_provenance_local_id`,
`append_duplicate_provenance_identity`, and the builder-local interned provenance identity helper, so
nested provenance and raw witness identities are encoded consistently without recursively expanding
large keys. Interned ids are assigned by exact `DuplicateProvenance` equality inside one builder; the
hash table is only an implementation detail for lookup. Producer-local discriminator words should be
named enums or constants, not unexplained literals.

The public API is:

```cpp
static DuplicateProvenance make_duplicate_provenance(DuplicateProvenanceCategory category,
                                                     DuplicateProvenanceLocalId local_id);
static DuplicateProvenance make_duplicate_provenance(DuplicateProvenanceCategory category,
                                                     std::initializer_list<uint64_t> local_id);
static DuplicateProvenance make_duplicate_provenance(DuplicateProvenanceCategory category, uint64_t local_id);
void tag_duplicate_provenance(uint32_t witness_index, const DuplicateProvenance& group_key);
const std::unordered_map<uint32_t, DuplicateProvenance>& get_duplicate_provenance() const;
uint64_t get_duplicate_provenance_id(const DuplicateProvenance& group_key);
DuplicateProvenanceLocalId get_duplicate_provenance_interned_identity(const DuplicateProvenance& group_key);
```

`tag_duplicate_provenance` canonicalizes the witness through `real_variable_index`. The channel is
not serialized and is not part of proving.

`assert_equal` propagates provenance across copy constraints. If the canonical representative lacks a
key and the merged witness has one, the key is copied to the canonical real index. If both sides have
different keys, the old key is rewritten to the canonical key throughout the map, because the new copy
constraint makes those groups forced equal.

`POSEIDON2_CRYPTOGRAPHIC_BINDING` is deliberately excluded from this normal provenance overlay. It
marks a different kind of evidence, described below, and must not be treated as constraint-forced
equality.

## Provenance Soundness Rule

A producer may assign the same duplicate provenance group key to two witnesses only if the circuit
constraints force those two witnesses to hold equal values on every satisfying assignment.

Good local ids are based on witness identity and the deterministic operation that created the output.
They should use real variable indices, operation discriminators, table ids, row or column slots, and
fixed-width parameters. They must not be based on runtime values alone.

Two independently assigned witnesses with equal values must receive different provenance keys unless
a constraint forces them equal.

Prefer under-tagging to over-tagging. Untagged duplicates are noisy. Incorrectly grouped duplicates
can hide real bugs.

## Current Provenance Categories

`BIGFIELD_REDUCTION`

Covers deterministic reduction intermediates:

- double-width limb decomposition outputs;
- `self_reduce` quotient and remainder limbs;
- `unsafe_evaluate_multiply_add` carry limbs.

Keys include an operation discriminator, relevant input limb identities, width parameters where
needed, and an output slot.

`MSM_TABLE`

Covers deterministic group-operation and table materializations:

- `cycle_group` double outputs;
- `cycle_group` add/subtract outputs;
- Straus ROM table cell coordinates;
- Straus ROM read outputs;
- Straus plookup read outputs.

Keys include operation discriminators, affine field identities, table identity, selected table slot,
and coordinate slot. The x and y coordinates of one point use distinct coordinate slots.

`POSEIDON2_PERMUTATION`

Covers Poseidon2 round intermediates. The key is derived from the identity of the four input-state
elements before the initial linear layer mutates the state plus the exact generated-state slot
(initial layer, external/internal round, and state element). Different slots in one permutation use
different keys.

`POSEIDON2_CRYPTOGRAPHIC_BINDING`

Covers the single intended Chonk/batch-merge rehash pattern. The hiding kernel first computes the
running ECC-op commitment hash from `witness_commitments.get_ecc_op_wires()`. The batch-merge
recursive verifier then recomputes the same hash as the transcript challenge `HASH_i` over the
proof-supplied `COLUMN_0_i` through `COLUMN_3_i` commitments.

This category is not a normal provenance group: the two computations are bound by
`BatchMergeVerifier::check_hash_consistency`, which compares the selected transcript hash with
`split_challenge(running_hash)[0]` and carries the existing 2^-127 collision caveat. The analyzer
suppresses duplicates in this category only when every duplicate occurrence is in the same
cryptographic-binding group and the group contains both roles: `RUNNING_HASH` and `TRANSCRIPT_HASH`.
A same-role duplicate remains visible.

`DATABUS_READ`

Covers fixed-slot databus materializations and variable-index read outputs. Appended bus entries and
constant/fixed-index reads use a `(bus_idx, slot)` identity. Non-fixed index reads use `(bus_idx,
index witness identity)` and deliberately do not share the source slot key merely because the current
index value selects that slot.

`ECC_OP_TABLE`

Covers the four point limbs materialized into Mega's `ecc_op` block. The key is based on opcode,
per-circuit serialization slot, and limb slot. Random ops are not tagged. The four limbs of one op
must not share one key, because they are not forced equal to each other.

`LOOKUP_TABLE`

Covers generic lookup accumulator witnesses. Keys include table identity, one-key or two-key mode,
key witness identities, column, and row. If a key witness already has duplicate provenance, that key
is included in the lookup key identity. Distinct key witnesses that merely hold the same field value
must not share a lookup provenance key.

`RANGE_DECOMPOSITION`

Covers limbed range-decomposition outputs. Keys include the input real variable identity, total bit
length, target limb width, and limb slot.

## Rerun-Varying Filters

Some gadgets, notably AES lookup-heavy circuits, can produce repeated witness values that are tied to
runtime inputs rather than to a fixed reused witness. The analyzer supports an opt-in rerun filter for
these cases:

1. Build the baseline circuit and call `fill_witness_duplicate_map` in `EXPLANATION_ONLY` mode.
2. Rebuild the same circuit shape with randomized inputs one or more times.
3. Call `get_rerun_varying_duplicate_values` on the baseline analyzer with the rerun builders.
4. Rebuild or re-analyze the baseline circuit with those values passed as `rerun_varying_filter_values`.

The comparison is slot-based. For each remaining duplicate value in the baseline map, the helper
checks the same real witness indices in each rerun builder. If any corresponding rerun witness has a
different value, the baseline value is considered input-dependent and can be filtered. This catches
small values as well as high-entropy values, because the decision does not depend on the numeric
magnitude of the field element.

This is deliberately not a default suppression. It is appropriate for known noisy diagnostics where
the circuit shape is stable across reruns. It should not replace provenance or structural overlays for
a relation that can be explained directly by constraints.

## Materialization Filters

After structural overlays, the analyzer applies narrow use-site filters. These remove values only
when every occurrence is confined to a known non-problematic materialization pattern:

- `MSM_TABLE` provenance mixed only with memory-only ROM/RAM copies;
- every occurrence has `ECC_OP_TABLE` provenance and appears only in `ecc_op` plus fixed/modulus or
  Poseidon materialization rows;
- elliptic outputs mixed only with fixed/modulus materialization rows;
- fixed witnesses and BN254 modulus-arithmetic rows;
- ordinary constants and `fix_witness` rows.

These filters check where a witness is used, not just what value it holds. A provenance category by itself is not enough
to suppress a duplicate; the occurrences must still be explained by a precise key/component or by a narrow use-site
pattern.

## Adding Or Reviewing A Suppression

When adding a new suppression mechanism, answer these questions:

1. What exact constraint or table relation forces all grouped witnesses equal?
2. Does the grouping key use witness identity rather than runtime value?
3. Which operation, table, row, column, coordinate, or limb slot prevents unrelated outputs from
   sharing a key?
4. Can key construction add gates? If yes, it is not acceptable.
5. What happens when two distinct witnesses happen to carry the same field value?
6. Is partial-overlay contact kept visible?
7. Is there a positive test for the intended suppression and a negative test for a same-valued but
   unrelated duplicate?

If any answer is unclear, keep the duplicate visible.
