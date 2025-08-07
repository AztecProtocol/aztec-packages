// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "./types.hpp"

#include "barretenberg/numeric/bitop/rotate.hpp"

namespace bb::plookup::uint_tables {

template <uint64_t bits_per_slice, uint64_t num_rotated_output_bits>
inline std::array<bb::fr, 2> get_xor_rotate_values_from_key(const std::array<uint64_t, 2> key)
{
    return { numeric::rotate64(key[0] ^ key[1], num_rotated_output_bits), 0ULL };
}

template <uint64_t bits_per_slice, uint64_t num_rotated_output_bits>
inline BasicTable generate_xor_rotate_table(BasicTableId id, const size_t table_index)
{
    const uint64_t base = 1UL << bits_per_slice;
    BasicTable table;
    table.id = id;
    table.table_index = table_index;
    table.use_twin_keys = true;

    for (uint64_t i = 0; i < base; ++i) {
        for (uint64_t j = 0; j < base; ++j) {
            table.column_1.emplace_back(i);
            table.column_2.emplace_back(j);
            table.column_3.emplace_back(numeric::rotate64(i ^ j, num_rotated_output_bits));
        }
    }

    table.get_values_from_key = &get_xor_rotate_values_from_key<bits_per_slice, num_rotated_output_bits>;

    table.column_1_step_size = base;
    table.column_2_step_size = base;
    table.column_3_step_size = base;

    return table;
}

template <uint64_t bits_per_slice, uint64_t num_rotated_output_bits>
inline std::array<bb::fr, 2> get_and_rotate_values_from_key(const std::array<uint64_t, 2> key)
{
    return { numeric::rotate64(key[0] & key[1], num_rotated_output_bits), 0ULL };
}

template <uint64_t bits_per_slice, uint64_t num_rotated_output_bits>
inline BasicTable generate_and_rotate_table(BasicTableId id, const size_t table_index)
{
    const uint64_t base = 1UL << bits_per_slice;
    BasicTable table;
    table.id = id;
    table.table_index = table_index;
    table.use_twin_keys = true;

    for (uint64_t i = 0; i < base; ++i) {
        for (uint64_t j = 0; j < base; ++j) {
            table.column_1.emplace_back(i);
            table.column_2.emplace_back(j);
            table.column_3.emplace_back(numeric::rotate64(i & j, num_rotated_output_bits));
        }
    }

    table.get_values_from_key = &get_and_rotate_values_from_key<bits_per_slice, num_rotated_output_bits>;

    table.column_1_step_size = base;
    table.column_2_step_size = base;
    table.column_3_step_size = base;

    return table;
}

template <size_t uint_size> inline MultiTable get_uint_xor_table(const MultiTableId id)
{
    // uint_size must be one of 8, 16, 32, or 64.
    ASSERT(uint_size == 8 || uint_size == 16 || uint_size == 32 || uint_size == 64,
           "unsupported uint size for XOR table generation");

    const size_t TABLE_BIT_SIZE = 6;
    const size_t num_entries = uint_size / TABLE_BIT_SIZE;
    const uint64_t base = 1 << TABLE_BIT_SIZE;
    MultiTable table(base, base, base, num_entries);

    table.id = id;
    for (size_t i = 0; i < num_entries; ++i) {
        table.slice_sizes.emplace_back(base);
        table.basic_table_ids.emplace_back(UINT_XOR_SLICE_6_ROTATE_0);
        table.get_table_values.emplace_back(&get_xor_rotate_values_from_key<6, 0>);
    }

    // remaining bits
    const size_t LAST_TABLE_BIT_SIZE = uint_size - TABLE_BIT_SIZE * num_entries;
    const size_t LAST_SLICE_SIZE = 1 << LAST_TABLE_BIT_SIZE;
    table.slice_sizes.emplace_back(LAST_SLICE_SIZE);
    if (uint_size == 8 || uint_size == 32) {
        // uint8 and uint32 have 2 bits left because: 8 % 6 = 2 and 32 % 6 = 2
        table.basic_table_ids.emplace_back(UINT_XOR_SLICE_2_ROTATE_0);
        table.get_table_values.emplace_back(&get_xor_rotate_values_from_key<2, 0>);
    } else {
        // uint16 and uint64 have 4 bits left because: 16 % 6 = 4 and 64 % 6 = 4
        table.basic_table_ids.emplace_back(UINT_XOR_SLICE_4_ROTATE_0);
        table.get_table_values.emplace_back(&get_xor_rotate_values_from_key<4, 0>);
    }
    return table;
}

template <size_t uint_size> inline MultiTable get_uint_and_table(const MultiTableId id)
{
    // uint_size must be one of 8, 16, 32, or 64.
    ASSERT(uint_size == 8 || uint_size == 16 || uint_size == 32 || uint_size == 64,
           "unsupported uint size for AND table generation");

    const size_t TABLE_BIT_SIZE = 6;
    const size_t num_entries = uint_size / TABLE_BIT_SIZE;
    const uint64_t base = 1 << TABLE_BIT_SIZE;
    MultiTable table(base, base, base, num_entries);

    table.id = id;
    for (size_t i = 0; i < num_entries; ++i) {
        table.slice_sizes.emplace_back(base);
        table.basic_table_ids.emplace_back(UINT_AND_SLICE_6_ROTATE_0);
        table.get_table_values.emplace_back(&get_and_rotate_values_from_key<6, 0>);
    }

    // remaining bits
    const size_t LAST_TABLE_BIT_SIZE = uint_size - TABLE_BIT_SIZE * num_entries;
    const size_t LAST_SLICE_SIZE = 1 << LAST_TABLE_BIT_SIZE;
    table.slice_sizes.emplace_back(LAST_SLICE_SIZE);
    if (uint_size == 8 || uint_size == 32) {
        // uint8 and uint32 have 2 bits left because: 8 % 6 = 2 and 32 % 6 = 2
        table.basic_table_ids.emplace_back(UINT_AND_SLICE_2_ROTATE_0);
        table.get_table_values.emplace_back(&get_and_rotate_values_from_key<2, 0>);
    } else {
        // uint16 and uint64 have 4 bits left because: 16 % 6 = 4 and 64 % 6 = 4
        table.basic_table_ids.emplace_back(UINT_AND_SLICE_4_ROTATE_0);
        table.get_table_values.emplace_back(&get_and_rotate_values_from_key<4, 0>);
    }
    return table;
}

} // namespace bb::plookup::uint_tables
