// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/numeric/bitop/pow.hpp"
#include "barretenberg/numeric/bitop/rotate.hpp"
#include "barretenberg/numeric/bitop/sparse_form.hpp"

#include "sparse.hpp"
#include "types.hpp"

namespace bb::plookup::sha256_tables {

static constexpr uint64_t choose_normalization_table[28]{
    /* xor result = 0 */
    0, // e + 2f + 3g = 0 => e = 0, f = 0, g = 0 => t = 0
    0, // e + 2f + 3g = 1 => e = 1, f = 0, g = 0 => t = 0
    0, // e + 2f + 3g = 2 => e = 0, f = 1, g = 0 => t = 0
    1, // e + 2f + 3g = 3 => e = 0, f = 0, g = 1 OR e = 1, f = 1, g = 0 => t = 1
    0, // e + 2f + 3g = 4 => e = 1, f = 0, g = 1 => t = 0
    1, // e + 2f + 3g = 5 => e = 0, f = 1, g = 1 => t = 1
    1, // e + 2f + 3g = 6 => e = 1, f = 1, g = 1 => t = 1
    /* xor result = 1 */
    1, // e + 2f + 3g = 0 => e = 0, f = 0, g = 0 => t = 0
    1, // e + 2f + 3g = 1 => e = 1, f = 0, g = 0 => t = 0
    1, // e + 2f + 3g = 2 => e = 0, f = 1, g = 0 => t = 0
    2, // e + 2f + 3g = 3 => e = 0, f = 0, g = 1 OR e = 1, f = 1, g = 0 => t = 1
    1, // e + 2f + 3g = 4 => e = 1, f = 0, g = 1 => t = 0
    2, // e + 2f + 3g = 5 => e = 0, f = 1, g = 1 => t = 1
    2, // e + 2f + 3g = 6 => e = 1, f = 1, g = 1 => t = 1
    /* xor result = 2 */
    0, // e + 2f + 3g = 0 => e = 0, f = 0, g = 0 => t = 0
    0, // e + 2f + 3g = 1 => e = 1, f = 0, g = 0 => t = 0
    0, // e + 2f + 3g = 2 => e = 0, f = 1, g = 0 => t = 0
    1, // e + 2f + 3g = 3 => e = 0, f = 0, g = 1 OR e = 1, f = 1, g = 0 => t = 1
    0, // e + 2f + 3g = 4 => e = 1, f = 0, g = 1 => t = 0
    1, // e + 2f + 3g = 5 => e = 0, f = 1, g = 1 => t = 1
    1, // e + 2f + 3g = 6 => e = 1, f = 1, g = 1 => t = 1
    1, // e + 2f + 3g = 0 => e = 0, f = 0, g = 0 => t = 0
    /* xor result = 3 */
    1, // e + 2f + 3g = 1 => e = 1, f = 0, g = 0 => t = 0
    1, // e + 2f + 3g = 2 => e = 0, f = 1, g = 0 => t = 0
    2, // e + 2f + 3g = 3 => e = 0, f = 0, g = 1 OR e = 1, f = 1, g = 0 => t = 1
    1, // e + 2f + 3g = 4 => e = 1, f = 0, g = 1 => t = 0
    2, // e + 2f + 3g = 5 => e = 0, f = 1, g = 1 => t = 1
    2, // e + 2f + 3g = 6 => e = 1, f = 1, g = 1 => t = 1
};

static constexpr uint64_t majority_normalization_table[16]{
    /* xor result = 0 */
    0, // a + b + c = 0 => (a & b) ^ (a & c) ^ (b & c) = 0
    0, // a + b + c = 1 => (a & b) ^ (a & c) ^ (b & c) = 0
    1, // a + b + c = 2 => (a & b) ^ (a & c) ^ (b & c) = 1
    1, // a + b + c = 3 => (a & b) ^ (a & c) ^ (b & c) = 1
    /* xor result = 1 */
    1,
    1,
    2,
    2,
    /* xor result = 2 */
    0,
    0,
    1,
    1,
    /* xor result = 3 */
    1,
    1,
    2,
    2,
};

static constexpr uint64_t witness_extension_normalization_table[16]{
    /* xor result = 0 */
    0,
    1,
    0,
    1,
    /* xor result = 1 */
    1,
    2,
    1,
    2,
    /* xor result = 2 */
    0,
    1,
    0,
    1,
    /* xor result = 3 */
    1,
    2,
    1,
    2,
};

/**
 * Rotation coefficients for Choose function: Σ₁(e) = (e>>>6) ^ (e>>>11) ^ (e>>>25)
 *
 * There are three outcomes to consider when a limb is rotated:
 *   - It stays contiguous: can be represented via multiplication by coefficient = base^(new_bit_position)
 *   - It splits across the bit-31/0 boundary: must be handled via lookup table correction
 *   - It lands exactly in bit 0: can be handled via sparse limb base table
 *
 * Limb structure: L0 = bits 0-10, L1 = bits 11-21, L2 = bits 22-31
 */
static constexpr bb::fr choose_base{ 28 };

static constexpr bb::fr HANDLED_VIA_TABLE{ 0 }; // indicates handling via lookup table instead of scalar multiplier

static constexpr std::array<bb::fr, 3> choose_rot6_coefficients{
    HANDLED_VIA_TABLE,       // splits across boundary
    choose_base.pow(11 - 6), // lands at bit 5
    choose_base.pow(22 - 6), // lands at bit 16
};

static constexpr std::array<bb::fr, 3> choose_rot11_coefficients{
    choose_base.pow(32 - 11), // lands at bit 21
    HANDLED_VIA_TABLE,        // lands at bit 0 can be handled using sparse limb base table
    choose_base.pow(22 - 11), // lands at bit 11
};

static constexpr std::array<bb::fr, 3> choose_rot25_coefficients{
    choose_base.pow(32 - 25),      // lands at bit 7
    choose_base.pow(32 - 25 + 11), // lands at bit 18
    HANDLED_VIA_TABLE,             // splits across boundary
};

// Combined per-limb rotation coefficients
static constexpr std::array<bb::fr, 3> choose_rotation_coefficients{
    choose_rot6_coefficients[0] + choose_rot11_coefficients[0] + choose_rot25_coefficients[0],
    choose_rot6_coefficients[1] + choose_rot11_coefficients[1] + choose_rot25_coefficients[1],
    choose_rot6_coefficients[2] + choose_rot11_coefficients[2] + choose_rot25_coefficients[2],
};

/**
 * Rotation coefficients for Majority function: Σ₀(a) = (a>>>2) ^ (a>>>13) ^ (a>>>22)
 *
 * There are three outcomes to consider when a limb is rotated:
 *   - It stays contiguous: can be represented via multiplication by coefficient = base^(new_bit_position)
 *   - It splits across the bit-31/0 boundary: must be handled via lookup table correction
 *   - It lands exactly in bit 0: can be handled via sparse limb base table
 *
 * Limb structure: L0 = bits 0-10, L1 = bits 11-21, L2 = bits 22-31
 */
static constexpr bb::fr majority_base{ 16 };

static constexpr std::array<bb::fr, 3> majority_rot2_coefficients{
    HANDLED_VIA_TABLE,         // splits across boundary
    majority_base.pow(11 - 2), // lands at bit 9
    majority_base.pow(22 - 2), // lands at bit 20
};

static constexpr std::array<bb::fr, 3> majority_rot13_coefficients{
    majority_base.pow(32 - 13), // lands at bit 19
    HANDLED_VIA_TABLE,          // splits across boundary
    majority_base.pow(22 - 13), // lands at bit 9
};

static constexpr std::array<bb::fr, 3> majority_rot22_coefficients{
    majority_base.pow(32 - 22),      // lands at bit 10
    majority_base.pow(32 - 22 + 11), // lands at bit 21
    HANDLED_VIA_TABLE,               // lands at bit 0, handled via sparse limb base table
};

// Combined per-limb rotation coefficients
static constexpr std::array<bb::fr, 3> majority_rotation_coefficients{
    majority_rot2_coefficients[0] + majority_rot13_coefficients[0] + majority_rot22_coefficients[0],
    majority_rot2_coefficients[1] + majority_rot13_coefficients[1] + majority_rot22_coefficients[1],
    majority_rot2_coefficients[2] + majority_rot13_coefficients[2] + majority_rot22_coefficients[2],
};

inline plookup::BasicTable generate_witness_extension_normalization_table(BasicTableId id, const size_t table_index)
{
    return sparse_tables::generate_sparse_normalization_table<16, 3, witness_extension_normalization_table>(
        id, table_index);
}

inline BasicTable generate_choose_normalization_table(BasicTableId id, const size_t table_index)
{
    return sparse_tables::generate_sparse_normalization_table<28, 2, choose_normalization_table>(id, table_index);
}

inline BasicTable generate_majority_normalization_table(BasicTableId id, const size_t table_index)
{
    return sparse_tables::generate_sparse_normalization_table<16, 3, majority_normalization_table>(id, table_index);
}

inline MultiTable get_witness_extension_output_table(const MultiTableId id = SHA256_WITNESS_OUTPUT)
{
    const size_t num_entries = 11;

    MultiTable table(numeric::pow64(16, 3), 1 << 3, 0, num_entries);

    table.id = id;
    for (size_t i = 0; i < num_entries; ++i) {
        table.slice_sizes.emplace_back(numeric::pow64(16, 3));
        table.basic_table_ids.emplace_back(SHA256_WITNESS_NORMALIZE);
        table.get_table_values.emplace_back(
            &sparse_tables::get_sparse_normalization_values<16, witness_extension_normalization_table>);
    }
    return table;
}

inline MultiTable get_choose_output_table(const MultiTableId id = SHA256_CH_OUTPUT)
{
    const size_t num_entries = 16;

    MultiTable table(numeric::pow64(28, 2), 1 << 2, 0, num_entries);

    table.id = id;
    for (size_t i = 0; i < num_entries; ++i) {
        table.slice_sizes.emplace_back(numeric::pow64(28, 2));
        table.basic_table_ids.emplace_back(SHA256_CH_NORMALIZE);
        table.get_table_values.emplace_back(
            &sparse_tables::get_sparse_normalization_values<28, choose_normalization_table>);
    }
    return table;
}

inline MultiTable get_majority_output_table(const MultiTableId id = SHA256_MAJ_OUTPUT)
{
    const size_t num_entries = 11;

    MultiTable table(numeric::pow64(16, 3), 1 << 3, 0, num_entries);

    table.id = id;
    for (size_t i = 0; i < num_entries; ++i) {
        table.slice_sizes.emplace_back(numeric::pow64(16, 3));
        table.basic_table_ids.emplace_back(SHA256_MAJ_NORMALIZE);
        table.get_table_values.emplace_back(
            &sparse_tables::get_sparse_normalization_values<16, majority_normalization_table>);
    }
    return table;
}

inline std::array<bb::fr, 3> get_majority_rotation_multipliers()
{
    // L1 correction: coefficients[1] - 16^11 * coefficients[0]
    // Needed because multiplying a.sparse by coefficients[0] gives L1 the coefficient 16^11 * coefficients[0],
    // but we need coefficients[1]
    bb::fr limb1_correction =
        majority_rotation_coefficients[1] - majority_base.pow(11) * majority_rotation_coefficients[0];

    return { majority_rotation_coefficients[0], limb1_correction, bb::fr(0) /*unused*/ };
}

inline std::array<bb::fr, 3> get_choose_rotation_multipliers()
{
    // L2 correction: coefficients[2] - 28^22 * coefficients[0]
    // Needed because multiplying e.sparse by coefficients[0] gives L2 the coefficient 28^22 * coefficients[0],
    // but we need coefficients[2]
    bb::fr limb2_correction = choose_rotation_coefficients[2] - choose_base.pow(22) * choose_rotation_coefficients[0];

    return { choose_rotation_coefficients[0], bb::fr(0) /*unused*/, limb2_correction };
}

inline MultiTable get_witness_extension_input_table(const MultiTableId id = SHA256_WITNESS_INPUT)
{
    std::vector<bb::fr> column_1_coefficients{ 1, 1 << 3, 1 << 10, 1 << 18 };
    std::vector<bb::fr> column_2_coefficients{ 0, 0, 0, 0 };
    std::vector<bb::fr> column_3_coefficients{ 0, 0, 0, 0 };
    MultiTable table(column_1_coefficients, column_2_coefficients, column_3_coefficients);
    table.id = id;
    // AUDITTODO: slice sizes should be 3, 7, 8, 14 (not 18) bits respectively
    table.slice_sizes = { (1 << 3), (1 << 7), (1 << 8), (1 << 18) };
    table.basic_table_ids = { SHA256_WITNESS_SLICE_3,
                              SHA256_WITNESS_SLICE_7_ROTATE_4,
                              SHA256_WITNESS_SLICE_8_ROTATE_7,
                              SHA256_WITNESS_SLICE_14_ROTATE_1 };

    table.get_table_values = {
        &sparse_tables::get_sparse_table_with_rotation_values<16, 0>,
        &sparse_tables::get_sparse_table_with_rotation_values<16, 4>,
        &sparse_tables::get_sparse_table_with_rotation_values<16, 7>,
        &sparse_tables::get_sparse_table_with_rotation_values<16, 1>,
    };
    return table;
}

/**
 * @brief Constructs a MultiTable for decomposing e into sparse form and computing rotation components for Σ₁(e).
 *
 * @details
 * ## Table Structure
 *
 * This table decomposes a 32-bit input into 3 limbs and produces three accumulated outputs:
 *   - C1: Normal form accumulator (e = L0 + L1·2¹¹ + L2·2²²)
 *   - C2: Sparse form accumulator (e_sparse = S0 + S1·B¹¹ + S2·B²², where B=28)
 *   - C3: Rotation accumulator for split-boundary rotations, with L1 correction baked in
 *
 * Limb structure:
 *   - L0: bits 0-10  (11 bits)
 *   - L1: bits 11-21 (11 bits)
 *   - L2: bits 22-31 (10 bits)
 *
 * ## Purpose
 *
 * Used to compute Σ₁(e) + Ch(e,f,g) for SHA-256
 *    - Σ₁(e) = (e>>>6) ^ (e>>>11) ^ (e>>>25)
 *    - Ch(e,f,g) = (e & f) ^ (~e & g)
 *
 * In sparse base-28 form, XOR becomes addition (mod 28 per digit), allowing:
 *     e + 7·Σ₁(e) = e_sparse + 7·[(e>>>6) + (e>>>11) + (e>>>25)]
 *
 * Each rotation is decomposed per-limb. For each limb, rotations either:
 *   - Stay contiguous (handled via scalar multiplication by rotation coefficients c0, c1, c2)
 *   - Split across the bit-31/0 boundary (handled via lookup table in C3)
 *
 * ## Column 3 Correction Term
 *
 * When computing rotations, we multiply e_sparse by L0's rotation coefficient c0 (see `choose_with_sigma1`).
 * This gives each limb a coefficient proportional to its position:
 *   - L0 gets c0 (correct)
 *   - L1 gets B¹¹·c0 (needs a correction to make it equal to c1)
 *   - L2 gets B²²·c0 (needs a correction to make it equal to c2)
 *
 * The L2 correction is handled directly in the `choose_with_sigma1` function.
 *
 * The L1 correction factor δ = c1 - B¹¹·c0 is baked into the C3 accumulator via column_3_coefficients.
 * When C3 is accumulated, it produces: C3[0] = raw[0] + raw[2] + S1 + S1·δ
 * The S1·δ term corrects L1's coefficient from B¹¹·c0 to c1.
 *
 */
inline MultiTable get_choose_input_table(const MultiTableId id = SHA256_CH_INPUT)
{

    // L1 correction factor: δ = c1 - B¹¹·c0 (see block comment above)
    bb::fr limb1_table_correction =
        choose_rotation_coefficients[1] - choose_base.pow(11) * choose_rotation_coefficients[0];

    std::vector<bb::fr> column_1_coefficients{ bb::fr(1), bb::fr(1 << 11), bb::fr(1 << 22) };
    std::vector<bb::fr> column_2_coefficients{ bb::fr(1), choose_base.pow(11), choose_base.pow(22) };
    std::vector<bb::fr> column_3_coefficients{ bb::fr(1), bb::fr(1) + limb1_table_correction, bb::fr(1) };
    MultiTable table(column_1_coefficients, column_2_coefficients, column_3_coefficients);
    table.id = id;
    table.slice_sizes = { (1 << 11), (1 << 11), (1 << 10) };

    /**
     * Specify the functions defining the rotation to be applied to each of three limbs. This is only for handling the
     * limbs which split across the 31/0-bit boundary when rotated.
     *
     * table_rotation = SHA256_rotation - limb_start_position
     *
     *   | Limb | Start pos | SHA256 rot | Table rot   |
     *   |------|-----------|------------|-------------|
     *   | L0   | 0         | 6          | 6 - 0 = 6   |
     *   | L1   | 11        | 11         | 11 - 11 = 0 |
     *   | L2   | 22        | 25         | 25 - 22 = 3 |
     */
    table.basic_table_ids = { SHA256_BASE28_ROTATE6, SHA256_BASE28, SHA256_BASE28_ROTATE3 };
    table.get_table_values = { &sparse_tables::get_sparse_table_with_rotation_values<28, 6>,
                               &sparse_tables::get_sparse_table_with_rotation_values<28, 0>,
                               &sparse_tables::get_sparse_table_with_rotation_values<28, 3> };

    return table;
}

/**
 * @brief Constructs a MultiTable for decomposing a into sparse form and computing rotation components for Σ₀(a).
 *
 * @details
 * ## Table Structure
 *
 * This table decomposes a 32-bit input into 3 limbs and produces three accumulated outputs:
 *   - C1: Normal form accumulator (a = L0 + L1·2¹¹ + L2·2²²)
 *   - C2: Sparse form accumulator (a_sparse = S0 + S1·B¹¹ + S2·B²², where B=16)
 *   - C3: Rotation accumulator for split-boundary rotations, with L2 correction baked in
 *
 * Limb structure:
 *   - L0: bits 0-10  (11 bits)
 *   - L1: bits 11-21 (11 bits)
 *   - L2: bits 22-31 (10 bits)
 *
 * ## Purpose
 *
 * Used to compute Σ₀(a) + Maj(a,b,c) for SHA-256:
 *   - Σ₀(a) = (a>>>2) ^ (a>>>13) ^ (a>>>22)
 *   - Maj(a,b,c) = (a & b) ^ (a & c) ^ (b & c)
 *
 * In sparse base-16 form, XOR becomes addition (mod 16 per digit), allowing:
 *     a + 4·Σ₀(a) = a_sparse + 4·[(a>>>2) + (a>>>13) + (a>>>22)]
 *
 * Each rotation is decomposed per-limb. For each limb, rotations either:
 *   - Stay contiguous (handled via scalar multiplication by rotation coefficients c0, c1, c2)
 *   - Split across the bit-31/0 boundary (handled via lookup table in C3)
 *
 * ## Column 3 Correction Term
 *
 * When computing rotations, we multiply a_sparse by L0's rotation coefficient c0 (see `majority_with_sigma0`).
 * This gives each limb a coefficient proportional to its position:
 *   - L0 gets c0 (correct)
 *   - L1 gets B¹¹·c0 (needs a correction to make it equal to c1)
 *   - L2 gets B²²·c0 (needs a correction to make it equal to c2)
 *
 * The L1 correction is handled directly in the `majority_with_sigma0` function.
 *
 * The L2 correction factor δ = c2 - B¹¹·c1 is baked into the C3 accumulator via column_3_coefficients.
 * When C3 is accumulated, it produces: C3[0] = raw[0] + raw[1] + S2 + S2·δ
 * The S2·δ term corrects L2's coefficient.
 *
 */
inline MultiTable get_majority_input_table(const MultiTableId id = SHA256_MAJ_INPUT)
{
    // L2 correction factor: δ = c2 - B¹¹·c1 (see block comment above)
    bb::fr limb2_table_correction =
        majority_rotation_coefficients[2] - majority_base.pow(11) * majority_rotation_coefficients[1];

    std::vector<bb::fr> column_1_coefficients{ bb::fr(1), bb::fr(1 << 11), bb::fr(1 << 22) };
    std::vector<bb::fr> column_2_coefficients{ bb::fr(1), majority_base.pow(11), majority_base.pow(22) };
    std::vector<bb::fr> column_3_coefficients{ bb::fr(1), bb::fr(1), bb::fr(1) + limb2_table_correction };

    MultiTable table(column_1_coefficients, column_2_coefficients, column_3_coefficients);
    table.id = id;
    table.slice_sizes = { (1 << 11), (1 << 11), (1 << 10) };

    /**
     * Specify the functions defining the rotation to be applied to each of three limbs. This is only for handling the
     * limbs which split across the 31/0-bit boundary when rotated.
     *
     * table_rotation = SHA256_rotation - limb_start_position
     *
     *   | Limb | Start pos | SHA256 rot | Table rot   |
     *   |------|-----------|------------|-------------|
     *   | L0   | 0         | 2          | 2 - 0 = 2   |
     *   | L1   | 11        | 13         | 13 - 11 = 2 |
     *   | L2   | 22        | 22         | 22 - 22 = 0 |
     */
    table.basic_table_ids = { SHA256_BASE16_ROTATE2, SHA256_BASE16_ROTATE2, SHA256_BASE16 };
    table.get_table_values = { &sparse_tables::get_sparse_table_with_rotation_values<16, 2>,
                               &sparse_tables::get_sparse_table_with_rotation_values<16, 2>,
                               &sparse_tables::get_sparse_table_with_rotation_values<16, 0> };
    return table;
}

} // namespace bb::plookup::sha256_tables
