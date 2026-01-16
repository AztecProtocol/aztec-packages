// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "./types.hpp"

#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/numeric/bitop/pow.hpp"
#include "barretenberg/numeric/bitop/rotate.hpp"
#include "barretenberg/numeric/bitop/sparse_form.hpp"

namespace bb::plookup::sparse_tables {

/**
 * @brief Computes the sparse form values for a given key, used as a callback for plookup table queries.
 *
 * @details Given an input key, returns:
 *          - t0: The sparse form of the input
 *          - t1: The sparse form of the input rotated by num_rotated_bits (or t0 if num_rotated_bits == 0)
 *
 * @tparam base The base for sparse representation
 * @tparam num_rotated_bits Number of bits to rotate right (0 for no rotation)
 *
 * @param key Array where key[0] is the input value to convert (key[1] is unused; the array
 *             has 2 elements to conform to the standard plookup callback interface)
 * @return std::array<bb::fr, 2> The sparse form and optionally rotated sparse form
 */
template <uint64_t base, uint64_t num_rotated_bits>
inline std::array<bb::fr, 2> get_sparse_table_with_rotation_values(const std::array<uint64_t, 2> key)
{
    const auto t0 = numeric::map_into_sparse_form<base>(key[0]);
    bb::fr t1;
    if constexpr (num_rotated_bits > 0) {
        t1 = numeric::map_into_sparse_form<base>(numeric::rotate32((uint32_t)key[0], num_rotated_bits));
    } else {
        t1 = t0;
    }
    return { bb::fr(t0), bb::fr(t1) };
}

/**
 * @brief Generates a plookup table that maps integers to their sparse form representation,
 *        with optional 32-bit rotation.
 *
 * @details Sparse form is a representation where each bit of a binary integer is mapped to a
 *          coefficient in a higher base. For a binary value with bits b_i ∈ {0,1}, the sparse
 *          form is: Σ(b_i * base^i). This representation enables efficient XOR computation in
 *          circuits: XOR can be computed by adding sparse representations and then "normalizing"
 *          (reducing coefficients modulo 2).
 *
 *          Example with base=7: binary 0b101 (decimal 5) → 7^0 + 7^2 = 1 + 49 = 50
 *
 *          The table has three columns:
 *          - Column 1: Original input value in range [0, 2^bits_per_slice)
 *          - Column 2: Sparse form of the input
 *          - Column 3: Sparse form of the input rotated right by num_rotated_bits (32-bit rotation),
 *                      or identical to column 2 if num_rotated_bits == 0
 *
 *          Step sizes are used when combining multiple lookups to reconstruct larger values:
 *          - column_1_step_size = 2^11 (for combining input slices)
 *          - column_2/3_step_size = base^bits_per_slice (for combining sparse output slices)
 *
 * @tparam base The base for sparse representation (e.g., 7 for SHA256 tables)
 * @tparam bits_per_slice Number of bits per table entry; table size = 2^bits_per_slice
 * @tparam num_rotated_bits Number of bits to rotate right (0 for no rotation)
 *
 * @param id The identifier for this lookup table
 * @param table_index Index of this table in the table registry
 *
 * @return BasicTable The constructed lookup table
 */
template <uint64_t base, uint64_t bits_per_slice, uint64_t num_rotated_bits>
inline BasicTable generate_sparse_table_with_rotation(BasicTableId id, const size_t table_index)
{
    BasicTable table;
    table.id = id;
    table.table_index = table_index;
    auto table_size = (1U << bits_per_slice);
    table.use_twin_keys = false;

    for (uint64_t i = 0; i < table_size; ++i) {
        const uint64_t source = i;
        const auto target = numeric::map_into_sparse_form<base>(source);
        table.column_1.emplace_back(bb::fr(source));
        table.column_2.emplace_back(bb::fr(target));

        if constexpr (num_rotated_bits > 0) {
            const auto rotated =
                numeric::map_into_sparse_form<base>(numeric::rotate32((uint32_t)source, num_rotated_bits));
            table.column_3.emplace_back(bb::fr(rotated));
        } else {
            table.column_3.emplace_back(bb::fr(target));
        }
    }

    table.get_values_from_key = &get_sparse_table_with_rotation_values<base, num_rotated_bits>;

    uint256_t sparse_step_size = 1;
    for (size_t i = 0; i < bits_per_slice; ++i) {
        sparse_step_size *= base;
    }
    table.column_1_step_size = bb::fr((1 << 11));
    table.column_2_step_size = bb::fr(sparse_step_size);
    table.column_3_step_size = bb::fr(sparse_step_size);

    return table;
}

template <size_t base, const uint64_t* base_table>
inline std::array<bb::fr, 2> get_sparse_normalization_values(const std::array<uint64_t, 2> key)
{
    uint64_t accumulator = 0;
    uint64_t input = key[0];
    uint64_t count = 0;
    while (input > 0) {
        uint64_t slice = input % base;
        uint64_t bit = base_table[static_cast<size_t>(slice)];
        accumulator += (bit << count);
        input -= slice;
        input /= base;
        ++count;
    }
    return { bb::fr(accumulator), bb::fr(0) };
}

template <size_t base, uint64_t num_bits, const uint64_t* base_table>
inline BasicTable generate_sparse_normalization_table(BasicTableId id, const size_t table_index)
{
    /**
     * If t = 7*((e >>> 6) + (e >>> 11) + (e >>> 25)) + e + 2f + 3g
     * we can create a mapping between the 28 distinct values, and the result of
     * (e >>> 6) ^ (e >>> 11) ^ (e >>> 25) + e + 2f + 3g
     */

    BasicTable table;
    table.id = id;
    table.table_index = table_index;
    table.use_twin_keys = false;
    auto table_size = numeric::pow64(static_cast<uint64_t>(base), num_bits);

    numeric::sparse_int<base, num_bits> accumulator(0);
    numeric::sparse_int<base, num_bits> to_add(1);
    for (size_t i = 0; i < table_size; ++i) {
        const auto& limbs = accumulator.get_limbs();
        uint64_t key = 0;
        for (size_t j = 0; j < num_bits; ++j) {
            const size_t table_idx = static_cast<size_t>(limbs[j]);
            key += ((base_table[table_idx]) << static_cast<uint64_t>(j));
        }

        table.column_1.emplace_back(accumulator.get_sparse_value());
        table.column_2.emplace_back(key);
        table.column_3.emplace_back(bb::fr(0));
        accumulator += to_add;
    }

    table.get_values_from_key = &get_sparse_normalization_values<base, base_table>;

    table.column_1_step_size = bb::fr(table_size);
    table.column_2_step_size = bb::fr(((uint64_t)1 << num_bits));
    table.column_3_step_size = bb::fr(0);
    return table;
}
} // namespace bb::plookup::sparse_tables
