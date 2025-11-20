// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"

#include <memory>

namespace bb {

/**
 * @brief Construct polynomials containing the concatenation of all lookup tables used in the circuit.
 * @details The first three polynomials contain the table data, while the fourth polynomial contains a table index that
 * simply reflects the order in which the tables were added to the circuit.
 *
 * @tparam Flavor
 * @param table_polynomials Polynomials to populate with table data
 * @param circuit
 */
template <typename Flavor>
void construct_lookup_table_polynomials(const RefArray<typename Flavor::Polynomial, 4>& table_polynomials,
                                        const typename Flavor::CircuitBuilder& circuit)
{
    size_t offset = 0;
    for (const auto& table : circuit.get_lookup_tables()) {
        for (size_t i = 0; i < table.size(); ++i) {
            table_polynomials[0].at(offset) = table.column_1[i];
            table_polynomials[1].at(offset) = table.column_2[i];
            table_polynomials[2].at(offset) = table.column_3[i];
            table_polynomials[3].at(offset) = table.table_index;
            offset++;
        }
    }
}

/**
 * @brief Construct polynomial whose value at index i is the number of times the table entry at that index has been
 * read.
 * @details Read counts are needed for the log derivative lookup argument. The table polynomials are constructed as a
 * concatenation of basic 3-column tables. Similarly, the read counts polynomial is constructed as the concatenation of
 * read counts for the individual tables.
 */
template <typename Flavor>
void construct_lookup_read_counts(typename Flavor::Polynomial& read_counts,
                                  typename Flavor::Polynomial& read_tags,
                                  typename Flavor::CircuitBuilder& circuit)
{
    // loop over all tables used in the circuit; each table contains data about the lookups made on it
    size_t table_offset = 0;
    for (auto& table : circuit.get_lookup_tables()) {
        table.initialize_index_map();

        for (auto& gate_data : table.lookup_gates) {
            // convert lookup gate data to an array of three field elements, one for each of the 3 columns
            auto table_entry = gate_data.to_table_components(table.use_twin_keys);

            // find the index of the entry in the table
            auto index_in_table = table.index_map[table_entry];

            // increment the read count at the corresponding index in the full polynomial
            size_t index_in_poly = table_offset + index_in_table;
            read_counts.at(index_in_poly)++;
            read_tags.at(index_in_poly) = 1; // tag is 1 if entry has been read 1 or more times
        }
        table_offset += table.size(); // set the offset of the next table within the polynomials
    }
}

} // namespace bb
