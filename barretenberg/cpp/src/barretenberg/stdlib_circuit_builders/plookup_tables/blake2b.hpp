#pragma once

#include "sparse.hpp"
#include "types.hpp"

namespace bb::plookup::blake2b_tables {

// For 64-bit values: 10 slices of 6 bits + 1 slice of 8 bits = 68 bits
// This allows 4 bits of overflow
static constexpr size_t BITS_IN_LAST_SLICE = 8UL;
static constexpr size_t SIZE_OF_LAST_SLICE = (1UL << BITS_IN_LAST_SLICE);

template <uint64_t bits_per_slice, bool filter = false>
inline std::array<bb::fr, 2> get_xor_values_from_key(const std::array<uint64_t, 2> key)
{
    uint64_t filtered_key0 = filter ? key[0] & 0xFULL : key[0];
    uint64_t filtered_key1 = filter ? key[1] & 0xFULL : key[1];
    return { uint256_t(filtered_key0 ^ filtered_key1), 0ULL };
}

template <uint64_t bits_per_slice, bool filter = false>
inline BasicTable generate_xor_table(BasicTableId id, const size_t table_index)
{
    const uint64_t base = 1ULL << bits_per_slice;
    BasicTable table;
    table.id = id;
    table.table_index = table_index;
    table.use_twin_keys = true;

    for (uint64_t i = 0; i < base; ++i) {
        for (uint64_t j = 0; j < base; ++j) {
            table.column_1.emplace_back(i);
            table.column_2.emplace_back(j);
            uint64_t i_filtered = filter ? i & 0xFULL : i;
            uint64_t j_filtered = filter ? j & 0xFULL : j;
            table.column_3.emplace_back(uint256_t(i_filtered ^ j_filtered));
        }
    }

    table.get_values_from_key = &get_xor_values_from_key<bits_per_slice, filter>;
    table.column_1_step_size = base;
    table.column_2_step_size = base;
    table.column_3_step_size = base;

    return table;
}

inline MultiTable get_blake2b_xor_table(const MultiTableId id = BLAKE2B_XOR)
{
    const size_t num_entries = 11;
    const uint64_t base = 1ULL << 6;
    MultiTable table(base, base, base, num_entries);

    table.id = id;
    for (size_t i = 0; i < num_entries - 1; ++i) {
        table.slice_sizes.emplace_back(base);
        table.basic_table_ids.emplace_back(BLAKE2B_XOR_ROTATE0);
        table.get_table_values.emplace_back(&get_xor_values_from_key<6>);
    }

    table.slice_sizes.emplace_back(SIZE_OF_LAST_SLICE);
    table.basic_table_ids.emplace_back(BLAKE2B_XOR_ROTATE0_SLICE10_MOD16);
    table.get_table_values.emplace_back(&get_xor_values_from_key<BITS_IN_LAST_SLICE, true>);

    return table;
}

} // namespace bb::plookup::blake2b_tables
