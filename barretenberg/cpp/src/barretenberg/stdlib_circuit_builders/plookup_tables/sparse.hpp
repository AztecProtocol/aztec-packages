// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke], commit: dd03c4a23ab067274b4964cacb36d1545f73fb14}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
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
 *          - t0 (C2): The sparse form of the input
 *          - t1 (C3): The sparse form of the input rotated by num_rotated_bits (or t0 if num_rotated_bits == 0)
 *
 * @tparam base The base for sparse representation
 * @tparam num_rotated_bits Number of bits to rotate right (0 for no rotation)
 *
 * @param key Array where key[0] is the input value to convert (key[1] is unused; the array
 *             has 2 elements to conform to the standard plookup callback interface)
 * @return {C2, C3} where:
 *   - C2 = sparse(input): the input converted to sparse base form
 *   - C3 = sparse(rotate32(input, num_rotated_bits)): the rotated input in sparse form
 *         (equals C2 if num_rotated_bits == 0)
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
 * @brief Generates a BasicTable that maps integers to their sparse form representation,
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
 *          - C1: Original input value in range [0, 2^bits_per_slice)
 *          - C2: Sparse form of the input
 *          - C3: Sparse form of the input rotated right by num_rotated_bits (32-bit rotation),
 *                      or identical to C2 if num_rotated_bits == 0
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

/**
 * @brief Computes the normalized output for a sparse value based on a provided normalization table
 *
 * @tparam base The sparse form base
 * @tparam base_table The normalization lookup table (maps sparse digit → normalized bit(s))
 * @param key The lookup key; key[0] is the sparse input value, key[1] is unused
 * @return {normalized_value, 0} where normalized_value has one output bit per input sparse digit
 */
template <size_t base, const uint64_t* base_table>
inline std::array<bb::fr, 2> get_sparse_normalization_values(const std::array<uint64_t, 2> key)
{
    uint64_t accumulator = 0;
    uint64_t input = key[0];
    uint64_t count = 0;
    while (input > 0) {
        const uint64_t slice = input % base;
        const uint64_t bit = base_table[static_cast<size_t>(slice)];
        accumulator += (bit << count);
        input -= slice;
        input /= base;
        ++count;
    }
    return { bb::fr(accumulator), bb::fr(0) };
}

/**
 * @brief Generates a BasicTable for normalizing sparse form values back to normal form.
 *
 * @details
 * This table converts sparse arithmetic results into actual bit values. Each sparse digit
 * encodes a sum of bits; the normalization table extracts the XOR result (and optionally
 * other Boolean function results like Ch or Maj).
 *
 * Table structure (base^num_bits many entries):
 *   - C1 (input): All possible sparse values with `num_bits` digits
 *   - C2 (output): Normalized result where each sparse digit is mapped through base_table
 *   - C3: Unused (always 0)
 *
 * The `num_bits` parameter controls how many bits are normalized per lookup. Larger num_bits = fewer lookups needed,
 * but larger table.
 *
 * @tparam base The sparse form base
 * @tparam num_bits Number of sparse digits (= original bits) processed per lookup
 * @tparam base_table The per-digit normalization table (e.g., choose_normalization_table)
 */
template <size_t base, uint64_t num_bits, const uint64_t* base_table>
inline BasicTable generate_sparse_normalization_table(BasicTableId id, const size_t table_index)
{
    BasicTable table;
    table.id = id;
    table.table_index = table_index;
    table.use_twin_keys = false;
    auto table_size = numeric::pow64(static_cast<uint64_t>(base), num_bits);

    numeric::sparse_int<base, num_bits> accumulator(0);
    numeric::sparse_int<base, num_bits> to_add(1);
    for (size_t i = 0; i < table_size; ++i) {
        const std::array<uint64_t, num_bits>& limbs = accumulator.get_limbs();
        uint64_t normalized_output = 0;
        for (size_t j = 0; j < num_bits; ++j) {
            const auto sparse_digit = limbs[j];
            normalized_output += base_table[sparse_digit] << j;
        }

        table.column_1.emplace_back(accumulator.get_sparse_value());
        table.column_2.emplace_back(normalized_output);
        table.column_3.emplace_back(bb::fr(0));
        accumulator += to_add;
    }

    table.get_values_from_key = &get_sparse_normalization_values<base, base_table>;

    table.column_1_step_size = bb::fr(table_size);
    table.column_2_step_size = bb::fr(1ULL << num_bits);
    table.column_3_step_size = bb::fr(0);
    return table;
}
} // namespace bb::plookup::sparse_tables
