## Lookups and permutations

**Declaring interactions**

- Each trace builder declares its lookups and permutations with `InteractionDefinition().add<InteractionType::X, <settings>>(...)` (`interaction_def.hpp`). See `bitwise_trace.cpp` for an example.
- The settings classes (`lookup_*_settings`, `perm_*_settings`) are generated from PIL and name the selector and tuple columns.
- Pass the full destination-table selector as the optional constructor argument (`outer_dst_selector`) when the lookup's own destination selector is a granular per-caller column (for example `C::precomputed_sel_range_16` in `bitwise_trace.cpp`). The builder then searches the full table and sets the granular selector to 1 on each matched row.

**Choosing a type** (`InteractionType`)

- `LookupGeneric`: lookup into a non-precomputed (dynamic) table. `LookupIntoDynamicTableGeneric` builds an index of the destination tuples and shares it through `SharedIndexCache`.
- `LookupSequential`: lookup into a dynamic table whose rows are in the same order as the source rows. `LookupIntoDynamicTableSequential` scans forward and does not support reusing destination rows.
- `LookupIntoBitwise`, `LookupIntoIndexedByRow`, `LookupIntoPDecomposition`: lookups into precomputed tables. Each implements `find_in_dst`, which finds the destination row for a tuple in O(1).
- `Permutation`, `MultiPermutation`: permutations. `PermutationBuilder` fills nothing in tracegen; it exists so tests can use the checked version. `MultiPermutationBuilder` sets the destination selector of each permutation.

**Counts and inverses**

- The lookup builders fill the destination counts. The indexed builders call `find_in_dst` once per active source row.
- The prover computes the inverse columns (`constraining/prover.cpp`). `resize_inverses` sizes each inverse column to the larger end index of its source and destination selectors.
- An inverse is computed for every row where the source or destination selector is 1 (`inverse_polynomial_is_computed_at_row` in `constraining/relations/interactions_base.hpp`). This is expensive for lookups into large precomputed tables.
- Computing inverses only for rows with the source selector or a non-zero count (INVERSES_SELECTOR) is not implemented. It would need a selector such as `sel_count_nonzero`, constrained by `sel_count_nonzero == 1 <=> count != 0`, used in place of the destination selector, or the same predicate baked into the lookup relation to avoid the extra column.
- `compute_logderivative_inverse` visits every row up to the resized length. It does not skip directly to the non-zero rows.
