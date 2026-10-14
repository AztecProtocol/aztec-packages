// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"

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
    size_t offset = circuit.blocks.lookup.trace_offset();
    for (const auto& table : circuit.get_lookup_tables()) {
        for (size_t i = 0; i < table.size(); ++i) {
            table_polynomials[0].at(offset) = table.column_1[i];
            table_polynomials[1].at(offset) = table.column_2[i];
            table_polynomials[2].at(offset) = table.column_3[i];
            table_polynomials[3].at(offset) = table.table_index;
            offset++;
        }
    }
    BB_ASSERT(offset <= table_polynomials[0].end_index(),
              "construct_lookup_table_polynomials: total lookup table entries exceed polynomial size");
}

/**
 * @brief Construct polynomial whose value at index i is the number of times the table entry at that index has been
 * read.
 * @details Read counts are needed for the log derivative lookup argument. The table polynomials are constructed as a
 * concatenation of basic 3-column tables. Similarly, the read counts polynomial is constructed as the concatenation of
 * read counts for the individual tables.
 *
 * The row of each lookup is resolved in parallel (read-only queries of the table's entry-index map) and the counts are
 * then accumulated per table as integers. The entry-index maps are built on the calling thread: building them on
 * worker threads places them in the workers' malloc arenas, which raised peak RSS.
 */
template <typename Flavor>
void construct_lookup_read_counts(typename Flavor::Polynomial& read_counts,
                                  typename Flavor::Polynomial& read_tags,
                                  typename Flavor::CircuitBuilder& circuit)
{
    auto& tables = circuit.get_lookup_tables();
    for (auto& table : tables) {
        table.initialize_index_map();
    }

    // loop over all tables used in the circuit; each table contains data about the lookups made on it
    size_t table_offset = circuit.blocks.lookup.trace_offset();
    std::vector<size_t> indices_in_table;
    std::vector<uint32_t> counts;
    for (auto& table : tables) {
        const auto& lookup_gates = table.lookup_gates;
        indices_in_table.resize(lookup_gates.size());
        parallel_for_heuristic(
            lookup_gates.size(),
            [&](size_t gate_idx) {
                // convert lookup gate data to an array of three field elements, one for each of the 3 columns
                auto table_entry = lookup_gates[gate_idx].to_table_components(table.use_twin_keys);
                // find the index of the entry in the table
                indices_in_table[gate_idx] = table.index_map[table_entry];
            },
            thread_heuristics::FF_MULTIPLICATION_COST * 8);

        counts.assign(table.size(), 0);
        for (const size_t index_in_table : indices_in_table) {
            counts.at(index_in_table)++;
        }
        for (size_t index_in_table = 0; index_in_table < counts.size(); ++index_in_table) {
            if (counts[index_in_table] == 0) {
                continue;
            }
            // add the read count at the corresponding index in the full polynomial
            size_t index_in_poly = table_offset + index_in_table;
            read_counts.at(index_in_poly) += counts[index_in_table];
            read_tags.at(index_in_poly) = 1; // tag is 1 if entry has been read 1 or more times
        }
        table_offset += table.size(); // set the offset of the next table within the polynomials
    }
}

} // namespace bb
