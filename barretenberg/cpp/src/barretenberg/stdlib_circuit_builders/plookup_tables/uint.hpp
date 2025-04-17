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

inline MultiTable get_uint32_xor_table(const MultiTableId id = UINT32_XOR)
{
    const size_t TABLE_BIT_SIZE = 6;
    const size_t num_entries = 32 / TABLE_BIT_SIZE;
    const uint64_t base = 1 << TABLE_BIT_SIZE;
    MultiTable table(base, base, base, num_entries);

    table.id = id;
    for (size_t i = 0; i < num_entries; ++i) {
        table.slice_sizes.emplace_back(base);
        table.basic_table_ids.emplace_back(UINT_XOR_SLICE_6_ROTATE_0);
        table.get_table_values.emplace_back(&get_xor_rotate_values_from_key<6, 0>);
    }

    // 32 = 5 * 6 + 2
    // all remaining bits
    const size_t LAST_TABLE_BIT_SIZE = 32 - TABLE_BIT_SIZE * num_entries;
    const size_t LAST_SLICE_SIZE = 1 << LAST_TABLE_BIT_SIZE;
    table.slice_sizes.emplace_back(LAST_SLICE_SIZE);
    table.basic_table_ids.emplace_back(UINT_XOR_SLICE_2_ROTATE_0);
    table.get_table_values.emplace_back(&get_xor_rotate_values_from_key<LAST_TABLE_BIT_SIZE, 0>);
    return table;
}

inline MultiTable get_uint32_and_table(const MultiTableId id = UINT32_AND)
{
    const size_t TABLE_BIT_SIZE = 6;
    const size_t num_entries = 32 / TABLE_BIT_SIZE;
    const uint64_t base = 1 << TABLE_BIT_SIZE;
    MultiTable table(base, base, base, num_entries);

    table.id = id;
    for (size_t i = 0; i < num_entries; ++i) {
        table.slice_sizes.emplace_back(base);
        table.basic_table_ids.emplace_back(UINT_AND_SLICE_6_ROTATE_0);
        table.get_table_values.emplace_back(&get_and_rotate_values_from_key<TABLE_BIT_SIZE, 0>);
    }
    // 32 = 5 * 6 + 2
    // all remaining bits
    const size_t LAST_TABLE_BIT_SIZE = 32 - TABLE_BIT_SIZE * num_entries;
    const size_t LAST_SLICE_SIZE = 1 << LAST_TABLE_BIT_SIZE;
    table.slice_sizes.emplace_back(LAST_SLICE_SIZE);
    table.basic_table_ids.emplace_back(UINT_AND_SLICE_2_ROTATE_0);
    table.get_table_values.emplace_back(&get_and_rotate_values_from_key<LAST_TABLE_BIT_SIZE, 0>);

    return table;
}

} // namespace bb::plookup::uint_tables
