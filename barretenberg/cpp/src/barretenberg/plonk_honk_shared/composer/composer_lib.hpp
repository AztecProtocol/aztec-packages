#pragma once
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/polynomials/polynomial_store.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"

#include <memory>

namespace bb {

template <typename Flavor>
void construct_lookup_table_polynomials(RefArray<typename Flavor::Polynomial, 4> table_polynomials,
                                        const typename Flavor::CircuitBuilder& circuit,
                                        size_t dyadic_circuit_size,
                                        size_t additional_offset = 0)
{
    // Create lookup selector polynomials which interpolate each table column.
    // Our selector polys always need to interpolate the full subgroup size, so here we offset so as to
    // put the table column's values at the end. (The first gates are for non-lookup constraints).
    // [0, ..., 0, ...table, 0, 0, 0, x]
    //  ^^^^^^^^^  ^^^^^^^^  ^^^^^^^  ^nonzero to ensure uniqueness and to avoid infinity commitments
    //  |          table     randomness
    //  ignored, as used for regular constraints and padding to the next power of 2.
    // WORKTODO: eventually just construct the tables (and therefore the counts) at the top of the trace
    ASSERT(dyadic_circuit_size > circuit.get_tables_size() + additional_offset);
    size_t offset = dyadic_circuit_size - circuit.get_tables_size() - additional_offset;

    for (const auto& table : circuit.lookup_tables) {
        const fr table_index(table.table_index);

        for (size_t i = 0; i < table.size(); ++i) {
            table_polynomials[0][offset] = table.column_1[i];
            table_polynomials[1][offset] = table.column_2[i];
            table_polynomials[2][offset] = table.column_3[i];
            table_polynomials[3][offset] = table_index;
            ++offset;
        }
    }
}

/**
 * @brief WORKTODO
 *
 */
template <typename Flavor>
typename Flavor::Polynomial construct_lookup_read_counts(typename Flavor::Polynomial& read_counts,
                                                         typename Flavor::Polynomial& read_tags,
                                                         typename Flavor::CircuitBuilder& circuit,
                                                         size_t dyadic_circuit_size)
{
    // WORKTODO: eventually just construct the tables (and therefore the counts) at the top of the trace
    size_t offset = dyadic_circuit_size - circuit.get_tables_size();

    size_t table_offset = offset; // offset of the present table in the table polynomials
    for (auto& table : circuit.lookup_tables) {
        table.initialize_index_map();

        for (auto& entry : table.lookup_gates) {
            auto data = entry.to_sorted_list_components(table.use_twin_keys);

            // find the index of the current lookup gate in the table
            auto index_in_table = table.index_map[data];

            // increment the read count at the corresponding index in the full polynomial
            size_t index_in_poly = table_offset + index_in_table;
            read_counts[index_in_poly]++;
            read_tags[index_in_poly] = 1;
        }
        table_offset += table.size();
    }

    return read_counts;
}

} // namespace bb
