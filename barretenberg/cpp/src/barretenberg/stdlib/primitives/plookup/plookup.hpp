// === CODE ROLE: Stdlib interface (conditionally modifies builder) ===
// This file provides the stdlib (circuit) interface for plookup operations. The key function is
// get_lookup_accumulators(), which has two code paths:
//
//   1. CONSTANT PATH (builder-agnostic): If all inputs are constants, wraps native values as
//      field_t<Builder> constants. No witnesses or gates are created.
//
//   2. VARIABLE PATH (builder-modifying): If any input is a witness, calls
//      builder->create_gates_from_plookup_accumulators() to create actual lookup gates.
//
// This is the main entry point for stdlib code that needs table lookups. It bridges the native
// plookup_tables.cpp computation to circuit gate creation in ultra_circuit_builder.cpp.
// =====================

#pragma once
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"
#include <array>
#include <vector>

namespace bb::stdlib {

template <typename Builder> class plookup_read {
    typedef field_t<Builder> field_pt;

  public:
    static std::pair<field_pt, field_pt> read_pair_from_table(const plookup::MultiTableId id, const field_pt& key);
#ifndef __wasm__
    // Select C2[0] and C3[last]; all lookup witnesses and constraints are still generated.
    static std::pair<field_pt, field_pt> read_first_and_last_from_table(const plookup::MultiTableId id,
                                                                        const field_pt& key);
#endif

    static field_pt read_from_2_to_1_table(const plookup::MultiTableId id,
                                           const field_pt& key_a,
                                           const field_pt& key_b);
    static field_pt read_from_1_to_2_table(const plookup::MultiTableId id, const field_pt& key_a);

    static plookup::ReadData<field_pt> get_lookup_accumulators(const plookup::MultiTableId id,
                                                               const field_pt& key_a,
                                                               const field_pt& key_b = 0,
                                                               const bool is_2_to_1_lookup = false);

    /**
     * @brief Return lookup[columns[i]][rows[i]] for each i, where lookup = get_lookup_accumulators(id, key).
     * @details Creates the same witnesses and gates as get_lookup_accumulators(id, key) but constructs only the
     * selected result wrappers. Instantiated for N = 3 and N = 8.
     */
    template <size_t N>
    static std::array<field_pt, N> read_rows_from_table(const plookup::MultiTableId id,
                                                        const field_pt& key,
                                                        const std::array<plookup::ColumnIdx, N>& columns,
                                                        const std::array<size_t, N>& rows);
};
} // namespace bb::stdlib
