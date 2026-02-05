// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Khashayar], commit: dd03c4a23ab067274b4964cacb36d1545f73fb14}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/numeric/bitop/rotate.hpp"
#include "barretenberg/numeric/bitop/sparse_form.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

#include "sparse.hpp"
#include "types.hpp"

namespace bb::plookup::aes128_tables {
static constexpr uint64_t AES_BASE = 9;

/**
 * @brief Normalizes the sparse form by mapping from sparse form to bytes and back to sparse form
 *
 * @param key The lookup key; key[0] is the sparse input value, key[1] is unused
 * @return {normalized_value, 0} where normalized_value has one output bit per input sparse digit
 */
inline std::array<bb::fr, 2> get_aes_sparse_normalization_values_from_key(const std::array<uint64_t, 2> key)
{
    const auto byte = numeric::map_from_sparse_form<AES_BASE>(key[0]);
    return { bb::fr(numeric::map_into_sparse_form<AES_BASE>(byte)), bb::fr(0) };
}

/**
 * @brief Generates a BasicTable for normalizing 4 sparse digits back to valid sparse form.
 *
 * @details In sparse-form XOR computation, adding two sparse values can produce digits > 1.
 *          For example, if two bits are both 1, their sparse digits add to 2. This table
 *          extracts the LSB of each digit to recover the actual XOR result.
 *
 *          The table processes 4 sparse digits at a time (base-9, so 9^4 = 6561 entries).
 *          For each digit d ∈ {0..8}, the normalized value is (d & 1):
 *          - Even digits (0, 2, 4, 6, 8) → 0 (XOR result is 0)
 *          - Odd digits (1, 3, 5, 7) → 1 (XOR result is 1)
 *
 *          Table structure:
 *          - C1 (input): All 9^4 possible 4-digit sparse values (i*9³ + j*9² + k*9 + m)
 *          - C2 (output): Normalized sparse value with each digit reduced to its LSB
 *          - C3: Unused (always 0)
 *
 *          Example: Input sparse value representing digits [2, 1, 0, 3]
 *          - Input:  2*729 + 1*81 + 0*9 + 3 = 1542
 *          - Output: 0*729 + 1*81 + 0*9 + 1 = 82  (digits become [0, 1, 0, 1])
 *
 *          Step sizes of 6561 (= 9^4) allow the MultiTable (AES_NORMALIZE) to combine
 *          two 4-digit lookups to normalize a full 8-digit sparse byte.
 *
 * @param id The BasicTableId to assign (AES_SPARSE_NORMALIZE)
 * @param table_index Index of this table in the table registry
 * @return BasicTable configured for 4-digit sparse normalization
 */
inline BasicTable generate_aes_sparse_normalization_table(BasicTableId id, const size_t table_index)
{
    BasicTable table;
    table.id = id;
    table.table_index = table_index;

    for (uint64_t i = 0; i < AES_BASE; ++i) {
        // Compute the raw values for the first digit
        uint64_t i_raw = i * AES_BASE * AES_BASE * AES_BASE;
        // Compute the normalized value for the first digit by taking the LSB
        uint64_t i_normalized = ((i & 1UL) == 1UL) * AES_BASE * AES_BASE * AES_BASE;
        for (uint64_t j = 0; j < AES_BASE; ++j) {
            // Compute the raw values for the second digit
            uint64_t j_raw = j * AES_BASE * AES_BASE;
            // Compute the normalized value for the second digit by taking the LSB
            uint64_t j_normalized = ((j & 1UL) == 1UL) * AES_BASE * AES_BASE;
            for (uint64_t k = 0; k < AES_BASE; ++k) {
                // Compute the raw values for the third digit
                uint64_t k_raw = k * AES_BASE;
                // Compute the normalized value for the third digit by taking the LSB
                uint64_t k_normalized = ((k & 1UL) == 1UL) * AES_BASE;
                for (uint64_t m = 0; m < AES_BASE; ++m) {
                    // Compute the raw values for the fourth digit
                    uint64_t m_raw = m;
                    // Compute the normalized value for the fourth digit by taking the LSB
                    uint64_t m_normalized = ((m & 1UL) == 1UL);
                    // Left value is the raw value of the 4-digit sparse value
                    uint64_t left = i_raw + j_raw + k_raw + m_raw;
                    // Right value is the normalized value of the 4-digit sparse value
                    uint64_t right = i_normalized + j_normalized + k_normalized + m_normalized;
                    table.column_1.emplace_back(left);
                    table.column_2.emplace_back(right);
                    table.column_3.emplace_back(bb::fr(0));
                }
            }
        }
    }
    table.use_twin_keys = false;
    // Set the callback function for the table
    table.get_values_from_key = &get_aes_sparse_normalization_values_from_key;

    table.column_1_step_size = bb::fr(6561);
    table.column_2_step_size = bb::fr(6561);
    table.column_3_step_size = bb::fr(0);
    return table;
}

/**
 * @brief Creates a MultiTable for normalizing 8 sparse digits back to binary digits.
 *
 * @details This table decomposes a 8-digit sparse value into 2, 4-digit sparse values (upper and lower) and normalizes
 * each of them. This is used to normalize the sparse form of the input block before the AES S-box lookup.
 *
 * @param id The MultiTableId to assign (AES_NORMALIZE)
 * @return MultiTable configured for 8-digit sparse normalization
 */
inline MultiTable get_aes_normalization_table(const MultiTableId id = AES_NORMALIZE)
{
    const size_t num_entries = 2;
    std::vector<bb::fr> column_1_coefficients;
    std::vector<bb::fr> column_2_coefficients;
    std::vector<bb::fr> column_3_coefficients;

    // The multicolumn coefficients for the lower and upper 4-digit sparse values
    for (size_t i = 0; i < num_entries; ++i) {
        column_1_coefficients.emplace_back(bb::fr(AES_BASE).pow(4 * i));
        column_2_coefficients.emplace_back(bb::fr(AES_BASE).pow(4 * i));
        column_3_coefficients.emplace_back(0);
    }

    MultiTable table(column_1_coefficients, column_2_coefficients, column_3_coefficients);

    table.id = id;
    for (size_t i = 0; i < num_entries; ++i) {
        table.slice_sizes.emplace_back(AES_BASE * AES_BASE * AES_BASE * AES_BASE);
        table.basic_table_ids.emplace_back(AES_SPARSE_NORMALIZE);
        table.get_table_values.emplace_back(&get_aes_sparse_normalization_values_from_key);
    }
    return table;
}

/**
 * @brief Creates a MultiTable for converting a 128-bit AES input block into 16 sparse-form bytes.
 *
 * @details This table decomposes a 128-bit field element (representing an AES block) into 16 individual
 *          bytes and converts each byte to sparse base-9 representation. This is used at the start of
 *          AES encryption to prepare the input state for sparse-form arithmetic.
 *
 *          Table structure:
 *          - 16 entries (one per byte in the 128-bit block)
 *          - Each entry references the AES_SPARSE_MAP BasicTable (256-entry byte-to-sparse lookup)
 *          - Slice size of 256 per entry (8 bits = 1 byte)
 *
 *          The MultiTable accumulator coefficients (256, 0, 0) indicate:
 *          - Column 1: Accumulates input bytes with step size 256 (2^8) for byte decomposition
 *          - Columns 2 & 3: Not accumulated (step size 0), values are read individually
 *
 *          Usage: Given a 128-bit input packed as a field element, the plookup machinery will:
 *          1. Decompose it into 16 bytes (lsb order)
 *          2. Look up each byte in AES_SPARSE_MAP to get its sparse representation
 *          3. Return the 16 sparse bytes for use in subsequent AES operations
 *
 * @param id The MultiTableId to assign (defaults to AES_INPUT)
 * @return MultiTable configured for 128-bit to sparse byte conversion
 */
inline MultiTable get_aes_input_table(const MultiTableId id = AES_INPUT)
{
    const size_t num_entries = 16;

    MultiTable table(256, 0, 0, num_entries);

    table.id = id;
    for (size_t i = 0; i < num_entries; ++i) {
        table.slice_sizes.emplace_back(256);
        table.basic_table_ids.emplace_back(AES_SPARSE_MAP);
        table.get_table_values.emplace_back(&sparse_tables::get_sparse_table_with_rotation_values<AES_BASE, 0>);
    }
    return table;
}

/**
 * @brief Computes AES S-box substitution and a derived value for MixColumns, returning both in sparse form.
 *
 * @details This function performs two operations needed for efficient AES circuit implementation:
 *
 *          1. **S-box substitution**: Converts the sparse input back to a byte, applies the AES S-box
 *             lookup, and returns the result in sparse form.
 *
 *          2. **Swizzled value for MixColumns**: Computes S(x) ⊕ xtime(S(x)), where xtime is
 *             multiplication by 2 in GF(2^8) using the AES irreducible polynomial (x^8 + x^4 + x^3 + x + 1).
 *             This equals S(x) * 3 in GF(2^8), which is used in the MixColumns step.
 *
 *          The xtime operation is: xtime(a) = (a << 1) ⊕ (0x1b if MSB of a is 1, else 0)
 *          where 0x1b represents the reduction polynomial coefficients.
 *
 *          By precomputing both S(x) and S(x) ⊕ xtime(S(x)) in a single lookup, the MixColumns
 *          operation can be performed efficiently using only additions of sparse representations.
 *
 * @param key Array where key[0] contains the input byte in sparse form (key[1] unused)
 * @return std::array<bb::fr, 2> where:
 *         - [0] = S(byte) in sparse form (the S-box output)
 *         - [1] = S(byte) ⊕ xtime(S(byte)) in sparse form (S(byte) * 3 in GF(2^8))
 */
inline std::array<bb::fr, 2> get_aes_sbox_values_from_key(const std::array<uint64_t, 2> key)
{
    // Convert the first sparse value to a native byte
    const auto byte = numeric::map_from_sparse_form<AES_BASE>(key[0]);
    // Get the native value of the S-box output
    uint8_t sbox_value = crypto::aes128_sbox[(uint8_t)byte];
    // Compute the swizzled value, i.e. S(byte) * 3 for MixColumns
    // The "swizzled" value is the XTIME operation applied to S(byte)
    uint8_t swizzled = ((uint8_t)(sbox_value << 1) ^ (uint8_t)(((sbox_value >> 7) & 1) * 0x1b));

    // Map the sbox output back to sparse form. Also compute sbox_value ^ swizzled
    return { bb::fr(numeric::map_into_sparse_form<AES_BASE>(sbox_value)),
             bb::fr(numeric::map_into_sparse_form<AES_BASE>((uint8_t)(sbox_value ^ swizzled))) };
}

/**
 * @brief Generates a plookup table for AES S-box substitution with precomputed MixColumns values.
 *
 * @details This table provides the core non-linear operation of AES (SubBytes) combined with
 *          a precomputed value needed for MixColumns, all stored in sparse form for efficient
 *          XOR operations in circuits.
 *
 *          Table structure (256 entries, one per byte value):
 *          - Column 1: Input byte in sparse form (base-9 representation)
 *          - Column 2: S(input) — the S-box output in sparse form
 *          - Column 3: S(input) ⊕ xtime(S(input)) — equals S(input) × 3 in GF(2^8), in sparse form
 *
 *          The third column precomputes the value needed for MixColumns multiplication by 3,
 *          since 3 = 2 ⊕ 1, so a × 3 = xtime(a) ⊕ a.
 *
 *          Step sizes are all 0 because this table is used for individual byte lookups,
 *          not for accumulating multiple slices into a larger value.
 *
 * @param id The identifier for this lookup table
 * @param table_index Index of this table in the table registry
 *
 * @return BasicTable The constructed 256-entry S-box lookup table
 */
inline BasicTable generate_aes_sbox_table(BasicTableId id, const size_t table_index)
{
    BasicTable table;
    table.id = id;
    table.table_index = table_index;
    size_t table_size = 256;
    table.use_twin_keys = false;
    for (uint64_t i = 0; i < table_size; ++i) {
        const auto first = numeric::map_into_sparse_form<AES_BASE>((uint8_t)i);
        uint8_t sbox_value = crypto::aes128_sbox[(uint8_t)i];
        uint8_t swizzled = ((uint8_t)(sbox_value << 1) ^ (uint8_t)(((sbox_value >> 7) & 1) * 0x1b));
        const auto second = numeric::map_into_sparse_form<AES_BASE>(sbox_value);
        const auto third = numeric::map_into_sparse_form<AES_BASE>((uint8_t)(sbox_value ^ swizzled));

        table.column_1.emplace_back(bb::fr(first));
        table.column_2.emplace_back(bb::fr(second));
        table.column_3.emplace_back(bb::fr(third));
    }
    table.get_values_from_key = get_aes_sbox_values_from_key;

    table.column_1_step_size = bb::fr(0);
    table.column_2_step_size = bb::fr(0);
    table.column_3_step_size = bb::fr(0);
    return table;
}

inline MultiTable get_aes_sbox_table(const MultiTableId id = AES_SBOX)
{
    const size_t num_entries = 1;

    MultiTable table(0, 0, 0, 1);

    table.id = id;
    for (size_t i = 0; i < num_entries; ++i) {
        table.slice_sizes.emplace_back(numeric::pow64(AES_BASE, 8));
        table.basic_table_ids.emplace_back(AES_SBOX_MAP);
        table.get_table_values.emplace_back(&get_aes_sbox_values_from_key);
    }
    return table;
}
} // namespace bb::plookup::aes128_tables
