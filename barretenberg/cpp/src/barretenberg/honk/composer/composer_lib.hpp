#pragma once
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"

#include <atomic>
#include <cstdint>
#include <exception>
#include <limits>

namespace bb {

namespace lookup_read_count_detail {
/**
 * A transient read-only row index. Slots hold a fingerprint and row number, not a second copy of the three field
 * columns. One caller-owned slot buffer is reused across tables; workers only query it while the table stays live.
 */
class RowIndex {
    static constexpr uint64_t EMPTY = std::numeric_limits<uint64_t>::max();
    const plookup::BasicTable* table = nullptr;
    std::vector<uint64_t> slots;
    plookup::LookupHashTable::HashFunction hash;

    static uint64_t mix(uint64_t value)
    {
        // Public-domain MurmurHash3 fmix64 (Austin Appleby) spreads the field hash across power-of-two slots.
        value ^= value >> 33;
        value *= 0xff51afd7ed558ccdULL;
        value ^= value >> 33;
        value *= 0xc4ceb9fe1a85ec53ULL;
        return value ^ (value >> 33);
    }
    bool equal(size_t row, const plookup::LookupHashTable::Key& key) const
    {
        return table->column_1[row] == key[0] && table->column_2[row] == key[1] && table->column_3[row] == key[2];
    }

  public:
    static bool eligible(const plookup::BasicTable& input)
    {
        // Row UINT32_MAX is reserved by EMPTY. The second bound also makes capacity rounding/allocation safe.
        return input.index_map.index_map.empty() && input.size() < std::numeric_limits<uint32_t>::max() &&
               input.size() <= std::vector<uint64_t>().max_size() / 4;
    }
    void initialize(const plookup::BasicTable& input)
    {
        table = &input;
        BB_ASSERT_DEBUG(input.column_1.size() == input.column_2.size() &&
                        input.column_2.size() == input.column_3.size());
        size_t capacity = 2;
        while (capacity < input.size() * 2) {
            capacity *= 2;
        }
        slots.assign(capacity, EMPTY);
        const size_t mask = capacity - 1;
        for (size_t row = 0; row < input.size(); ++row) {
            const plookup::LookupHashTable::Key key{ input.column_1[row], input.column_2[row], input.column_3[row] };
            const uint64_t hashed = static_cast<uint64_t>(hash(key));
            const uint64_t fingerprint = (hashed >> 32) << 32;
            size_t position = static_cast<size_t>(mix(hashed)) & mask;
            while (slots[position] != EMPTY && !((slots[position] & 0xffffffff00000000ULL) == fingerprint &&
                                                 equal(static_cast<uint32_t>(slots[position]), key))) {
                position = (position + 1) & mask;
            }
            // Ascending insertion deliberately overwrites duplicate keys with their LAST original row index.
            slots[position] = fingerprint | static_cast<uint64_t>(row);
        }
    }
    size_t find(const plookup::LookupHashTable::Key& key) const
    {
        const uint64_t hashed = static_cast<uint64_t>(hash(key));
        const uint64_t fingerprint = (hashed >> 32) << 32;
        const size_t mask = slots.size() - 1;
        size_t position = static_cast<size_t>(mix(hashed)) & mask;
        while (slots[position] != EMPTY) {
            if ((slots[position] & 0xffffffff00000000ULL) == fingerprint &&
                equal(static_cast<uint32_t>(slots[position]), key)) {
                return static_cast<uint32_t>(slots[position]);
            }
            position = (position + 1) & mask;
        }
        BB_ASSERT_DEBUG(false, "LookupHashTable: Key not found!");
        return std::numeric_limits<size_t>::max();
    }
};
} // namespace lookup_read_count_detail

namespace detail {
/** Resolve dense integer-key tables from their actual columns, never from table identifiers. */
class DenseLookupIndex {
  public:
    explicit DenseLookupIndex(const plookup::BasicTable& table)
    {
        const size_t n = table.size();
        // Preserve any existing index-map entries and the original reinitialization behavior.
        if (n == 0 || !table.index_map.index_map.empty()) {
            return;
        }
        width = 1;
        if (table.use_twin_keys) {
            width = 0;
            while (width < n && table.column_1[width] == bb::fr::zero()) {
                ++width;
            }
            if (width == 0 || n % width != 0) {
                width = 0;
                return;
            }
        }
        bb::fr first = bb::fr::zero();
        bb::fr second = bb::fr::zero();
        const bb::fr one = bb::fr::one();
        for (size_t i = 0; i < n; ++i) {
            if (table.column_1[i] != first || (table.use_twin_keys && table.column_2[i] != second)) {
                width = 0;
                return;
            }
            if (!table.use_twin_keys || (i + 1) % width == 0) {
                first += one;
                second = bb::fr::zero();
            } else {
                second += one;
            }
        }
    }

    explicit operator bool() const { return width != 0; }

    bool find(const plookup::BasicTable& table, const plookup::BasicTable::LookupEntry& entry, size_t& index) const
    {
        // Large integer aliases must retain the original field-conversion and map path.
        const auto small = [](const uint256_t& key) { return (key.data[1] | key.data[2] | key.data[3]) == 0; };
        if (!small(entry.key[0])) {
            return false;
        }
        const uint64_t first = entry.key[0].data[0];
        if (table.use_twin_keys) {
            if (!small(entry.key[1]) || entry.key[1].data[0] >= width || first >= table.size() / width) {
                return false;
            }
            index = static_cast<size_t>(first) * width + static_cast<size_t>(entry.key[1].data[0]);
            return entry.value[0] == table.column_3[index];
        }
        if (first >= table.size()) {
            return false;
        }
        index = static_cast<size_t>(first);
        return entry.value[0] == table.column_2[index] && entry.value[1] == table.column_3[index];
    }

  private:
    size_t width = 0;
};
} // namespace detail

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
 */
template <typename Flavor>
void construct_lookup_read_counts(typename Flavor::Polynomial& read_counts,
                                  typename Flavor::Polynomial& read_tags,
                                  typename Flavor::CircuitBuilder& circuit)
{
    auto& tables = circuit.get_lookup_tables();
    // loop over all tables used in the circuit; each table contains data about the lookups made on it
    size_t table_offset = circuit.blocks.lookup.trace_offset();
    const auto process_table = [&]<bool ParallelQueries>(auto& table,
                                                         size_t output_offset,
                                                         auto& indices_in_table,
                                                         auto& counts,
                                                         auto& row_index) {
        const auto& lookup_gates = table.lookup_gates;
        const auto for_each_query = [&](const auto& query) {
            if constexpr (ParallelQueries) {
                parallel_for_heuristic(lookup_gates.size(), query, thread_heuristics::FF_MULTIPLICATION_COST * 8);
            } else {
                for (size_t gate_idx = 0; gate_idx < lookup_gates.size(); ++gate_idx) {
                    query(gate_idx);
                }
            }
        };
        indices_in_table.resize(lookup_gates.size());
        const detail::DenseLookupIndex dense_index(table);
        std::atomic<bool> direct_complete{ true };
        if (dense_index) {
            for_each_query([&](size_t gate_idx) {
                if (!dense_index.find(table, lookup_gates[gate_idx], indices_in_table[gate_idx])) {
                    direct_complete.store(false, std::memory_order_relaxed);
                }
            });
        }
        if (!dense_index || !direct_complete.load(std::memory_order_relaxed)) {
            // Build only on the calling thread, after all direct queries have joined.
            // Re-run every query, preserving the original behavior for aliases or non-dense tables.
            const bool use_row_index = lookup_read_count_detail::RowIndex::eligible(table);
            if (use_row_index) {
                row_index.initialize(table);
            } else {
                table.initialize_index_map();
            }
            for_each_query([&](size_t gate_idx) {
                // convert lookup gate data to an array of three field elements, one for each of the 3 columns
                auto table_entry = lookup_gates[gate_idx].to_table_components(table.use_twin_keys);
                // find the index of the entry in the table
                indices_in_table[gate_idx] = use_row_index ? row_index.find(table_entry) : table.index_map[table_entry];
            });
        }

        counts.assign(table.size(), 0);
        for (const size_t index_in_table : indices_in_table) {
            counts.at(index_in_table)++;
        }
        for (size_t index_in_table = 0; index_in_table < counts.size(); ++index_in_table) {
            if (counts[index_in_table] == 0) {
                continue;
            }
            // add the read count at the corresponding index in the full polynomial
            size_t index_in_poly = output_offset + index_in_table;
            read_counts.at(index_in_poly) += counts[index_in_table];
            read_tags.at(index_in_poly) = 1; // tag is 1 if entry has been read 1 or more times
        }
    };

#if !defined(__wasm__) && SIZE_MAX > UINT32_MAX
    const size_t cpus = get_num_cpus();
    if (cpus > 1 && tables.size() / cpus >= 4) {
        // Each BasicTable owns its columns/map/gates. Only initially empty-map
        // tables enter outer scheduling; prepopulated/stale maps retain the old path.
        std::vector<size_t> offsets;
        offsets.reserve(tables.size());
        size_t end = table_offset;
        size_t largest_scratch = 1;
        bool eligible = true;
        for (const auto& table : tables) {
            if (!lookup_read_count_detail::RowIndex::eligible(table) ||
                table.size() > (std::numeric_limits<size_t>::max() - end) ||
                table.lookup_gates.size() > (std::numeric_limits<size_t>::max() - table.size() * 64 - 4096) / 16) {
                eligible = false;
                break;
            }
            offsets.push_back(end);
            end += table.size();
            // A scheduling estimate, not an allocator/RSS guarantee. RowIndex
            // uses <32 bytes/row; count and query capacities can retain headroom.
            const size_t estimate = table.size() * 64 + table.lookup_gates.size() * 16 + 4096;
            largest_scratch = std::max(largest_scratch, estimate);
        }
        const auto count_begin = reinterpret_cast<uintptr_t>(read_counts.data());
        const auto tag_begin = reinterpret_cast<uintptr_t>(read_tags.data());
        const size_t count_bytes = read_counts.size() * sizeof(*read_counts.data());
        const size_t tag_bytes = read_tags.size() * sizeof(*read_tags.data());
        const bool overlapping =
            count_bytes != 0 && tag_bytes != 0 &&
            (count_begin <= tag_begin ? tag_begin - count_begin < count_bytes : count_begin - tag_begin < tag_bytes);
        constexpr size_t SCRATCH_ESTIMATE_BUDGET = size_t{ 4 } << 30;
        const size_t workers = std::min(cpus, SCRATCH_ESTIMATE_BUDGET / largest_scratch);
        if (eligible && !overlapping && end - table_offset >= (size_t{ 1 } << 18) && workers > 1) {
            struct Scratch {
                std::vector<size_t> indices;
                std::vector<uint32_t> counts;
                lookup_read_count_detail::RowIndex row_index;
            };
            std::vector<Scratch> scratch(workers);
            std::vector<std::exception_ptr> errors(tables.size());
            std::atomic<size_t> next_table{ 0 };
            parallel_for(workers, [&](size_t worker) {
                auto& local = scratch[worker];
                while (true) {
                    const size_t index = next_table.fetch_add(1, std::memory_order_relaxed);
                    if (index >= tables.size()) {
                        break;
                    }
                    // Inner queries run serially: no nested worker pool. Table
                    // output segments are disjoint, preserving every per-row field update.
                    try {
                        process_table.template operator()<false>(
                            tables[index], offsets[index], local.indices, local.counts, local.row_index);
                    } catch (...) {
                        errors[index] = std::current_exception();
                    }
                }
            });
            // Preserve caller-side exception delivery and table-order selection.
            for (const auto& error : errors) {
                if (error) {
                    std::rethrow_exception(error);
                }
            }
            return;
        }
    }
#endif
    std::vector<size_t> indices_in_table;
    std::vector<uint32_t> counts;
    lookup_read_count_detail::RowIndex row_index;
    for (auto& table : tables) {
        process_table.template operator()<true>(table, table_offset, indices_in_table, counts, row_index);
        table_offset += table.size();
    }
}

} // namespace bb
