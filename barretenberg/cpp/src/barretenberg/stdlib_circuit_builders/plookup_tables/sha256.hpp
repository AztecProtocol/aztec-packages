// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/numeric/bitop/pow.hpp"
#include "barretenberg/numeric/bitop/rotate.hpp"
#include "barretenberg/numeric/bitop/sparse_form.hpp"

#include "sparse.hpp"
#include "types.hpp"

namespace bb::plookup::sha256_tables {

/**
 * @brief Normalization table for combined Σ₁(e) + Ch(e,f,g) computation in base-28 sparse form.
 *
 * @details
 * The Choose function is Ch(e,f,g) = (e & f) ^ (~e & g), i.e., "if e then f else g".
 * The Σ₁ function is Σ₁(e) = (e>>>6) ^ (e>>>11) ^ (e>>>25).
 *
 * Table index = 7 × σ + (e + 2f + 3g), where:
 *   - σ (0-3): sum of the three rotation bits at position i: (e>>>6)[i] + (e>>>11)[i] + (e>>>25)[i]
 *   - e, f, g (each 0 or 1): the Ch function input bits at position i
 *   - e + 2f + 3g (0-6): sparse encoding of Ch inputs
 *
 * Table output = Σ₁_bit + Ch_bit, where:
 *   - Σ₁_bit = σ mod 2 (the actual XOR result: 0,2 → 0 and 1,3 → 1)
 *   - Ch_bit = Ch(e,f,g)
 *
 * Output range is 0-2, fitting in the normalized sparse digit.
 */
static constexpr uint64_t choose_normalization_table[28]{
    /* σ = 0 (Σ₁ = 0): output = 0 + Ch */
    0, // e + 2f + 3g = 0 => e=0, f=0, g=0 => Ch=0
    0, // e + 2f + 3g = 1 => e=1, f=0, g=0 => Ch=0
    0, // e + 2f + 3g = 2 => e=0, f=1, g=0 => Ch=0
    1, // e + 2f + 3g = 3 => e=0, f=0, g=1 OR e=1, f=1, g=0 => Ch=1
    0, // e + 2f + 3g = 4 => e=1, f=0, g=1 => Ch=0
    1, // e + 2f + 3g = 5 => e=0, f=1, g=1 => Ch=1
    1, // e + 2f + 3g = 6 => e=1, f=1, g=1 => Ch=1
    /* σ = 1 (Σ₁ = 1): output = 1 + Ch */
    1, // e + 2f + 3g = 0 => Ch=0
    1, // e + 2f + 3g = 1 => Ch=0
    1, // e + 2f + 3g = 2 => Ch=0
    2, // e + 2f + 3g = 3 => Ch=1
    1, // e + 2f + 3g = 4 => Ch=0
    2, // e + 2f + 3g = 5 => Ch=1
    2, // e + 2f + 3g = 6 => Ch=1
    /* σ = 2 (Σ₁ = 0): output = 0 + Ch */
    0, // e + 2f + 3g = 0 => Ch=0
    0, // e + 2f + 3g = 1 => Ch=0
    0, // e + 2f + 3g = 2 => Ch=0
    1, // e + 2f + 3g = 3 => Ch=1
    0, // e + 2f + 3g = 4 => Ch=0
    1, // e + 2f + 3g = 5 => Ch=1
    1, // e + 2f + 3g = 6 => Ch=1
    /* σ = 3 (Σ₁ = 1): output = 1 + Ch */
    1, // e + 2f + 3g = 0 => Ch=0
    1, // e + 2f + 3g = 1 => Ch=0
    1, // e + 2f + 3g = 2 => Ch=0
    2, // e + 2f + 3g = 3 => Ch=1
    1, // e + 2f + 3g = 4 => Ch=0
    2, // e + 2f + 3g = 5 => Ch=1
    2, // e + 2f + 3g = 6 => Ch=1
};

/**
 * @brief Normalization table for combined Σ₀(a) + Maj(a,b,c) computation in base-16 sparse form.
 *
 * @details
 * The Majority function is Maj(a,b,c) = (a & b) ^ (a & c) ^ (b & c), i.e., the majority bit.
 * The Σ₀ function is Σ₀(a) = (a>>>2) ^ (a>>>13) ^ (a>>>22).
 *
 * Table index = 4 × σ + (a + b + c), where:
 *   - σ (0-3): sum of the three rotation bits at position i: (a>>>2)[i] + (a>>>13)[i] + (a>>>22)[i]
 *   - a, b, c (each 0 or 1): the Maj function input bits at position i
 *   - a + b + c (0-3): sum of Maj inputs
 *
 * Table output = Σ₀_bit + Maj_bit, where:
 *   - Σ₀_bit = σ mod 2 (the actual XOR result)
 *   - Maj_bit = 1 if (a + b + c) >= 2, else 0 (majority vote)
 *
 * Output range is 0-2, fitting in the normalized sparse digit.
 */
static constexpr uint64_t majority_normalization_table[16]{
    /* σ = 0 (Σ₀ = 0): output = 0 + Maj */
    0, // a + b + c = 0 => Maj=0
    0, // a + b + c = 1 => Maj=0
    1, // a + b + c = 2 => Maj=1
    1, // a + b + c = 3 => Maj=1
    /* σ = 1 (Σ₀ = 1): output = 1 + Maj */
    1, // a + b + c = 0 => Maj=0
    1, // a + b + c = 1 => Maj=0
    2, // a + b + c = 2 => Maj=1
    2, // a + b + c = 3 => Maj=1
    /* σ = 2 (Σ₀ = 0): output = 0 + Maj */
    0, // a + b + c = 0 => Maj=0
    0, // a + b + c = 1 => Maj=0
    1, // a + b + c = 2 => Maj=1
    1, // a + b + c = 3 => Maj=1
    /* σ = 3 (Σ₀ = 1): output = 1 + Maj */
    1, // a + b + c = 0 => Maj=0
    1, // a + b + c = 1 => Maj=0
    2, // a + b + c = 2 => Maj=1
    2, // a + b + c = 3 => Maj=1
};

/**
 * @brief Normalization table for message schedule extension (σ₀ and σ₁) in base-16 sparse form.
 *
 * @details
 * Used for the SHA-256 message schedule extension which computes:
 *   w[i] = σ₁(w[i-2]) + w[i-7] + σ₀(w[i-15]) + w[i-16]
 * where:
 *   σ₀(x) = (x>>>7) ^ (x>>>18) ^ (x>>3)   (3-way XOR)
 *   σ₁(x) = (x>>>17) ^ (x>>>19) ^ (x>>10) (3-way XOR)
 *
 * At each bit position, the sparse digit encodes two sums:
 *   - s_0 (0-3): sum of the 3 rotation/shift bits from σ₀
 *   - s_1 (0-3): sum of the 3 rotation/shift bits from σ₁
 *
 * Table index = 4 × s_0 + s_1 (range 0-15)
 * Table output = (s_0 mod 2) + (s_1 mod 2) = σ₀_bit + σ₁_bit
 * Output range is 0-2.
 */
static constexpr uint64_t witness_extension_normalization_table[16]{
    /* s_0 = 0 (σ₀_bit = 0): output = 0 + (s_1 mod 2) */
    0, // s_1 = 0 => σ₁_bit = 0
    1, // s_1 = 1 => σ₁_bit = 1
    0, // s_1 = 2 => σ₁_bit = 0
    1, // s_1 = 3 => σ₁_bit = 1
    /* s_0 = 1 (σ₀_bit = 1): output = 1 + (s_1 mod 2) */
    1, // s_1 = 0 => σ₁_bit = 0
    2, // s_1 = 1 => σ₁_bit = 1
    1, // s_1 = 2 => σ₁_bit = 0
    2, // s_1 = 3 => σ₁_bit = 1
    /* s_0 = 2 (σ₀_bit = 0): output = 0 + (s_1 mod 2) */
    0, // s_1 = 0 => σ₁_bit = 0
    1, // s_1 = 1 => σ₁_bit = 1
    0, // s_1 = 2 => σ₁_bit = 0
    1, // s_1 = 3 => σ₁_bit = 1
    /* s_0 = 3 (σ₀_bit = 1): output = 1 + (s_1 mod 2) */
    1, // s_1 = 0 => σ₁_bit = 0
    2, // s_1 = 1 => σ₁_bit = 1
    1, // s_1 = 2 => σ₁_bit = 0
    2, // s_1 = 3 => σ₁_bit = 1
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

inline BasicTable generate_witness_extension_normalization_table(BasicTableId id, const size_t table_index)
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

/**
 * @brief Constructs a MultiTable for decomposing a 32-bit word for message schedule extension.
 *
 * @details
 * ## Table Structure
 *
 * This table decomposes a 32-bit input into 4 limbs and produces outputs via lookup:
 *   - C1: Normal form accumulator (x = L0 + L1·2³ + L2·2¹⁰ + L3·2¹⁸)
 *   - C2: Sparse form of each limb (NOT accumulated)
 *   - C3: Rotated sparse form for split-boundary corrections (NOT accumulated)
 *
 * Limb structure (boundaries chosen to work nicely with rotation magnitudes):
 *   - L0: bits 0-2   (3 bits)
 *   - L1: bits 3-9   (7 bits)
 *   - L2: bits 10-17 (8 bits)
 *   - L3: bits 18-31 (14 bits)
 *
 * ## Purpose
 *
 * Used to compute the SHA-256 message schedule extension:
 *   w[i] = σ₁(w[i-2]) + w[i-7] + σ₀(w[i-15]) + w[i-16]
 * where:
 *   σ₀(x) = (x>>>7) ^ (x>>>18) ^ (x>>3)   — applied to w[i-15]
 *   σ₁(x) = (x>>>17) ^ (x>>>19) ^ (x>>10) — applied to w[i-2]
 *
 * The same decomposition serves BOTH σ₀ and σ₁, with limb boundaries at 3, 10, 18
 * aligning with the shift/rotation parameters of both functions.
 *
 */
inline MultiTable get_witness_extension_input_table(const MultiTableId id = SHA256_WITNESS_INPUT)
{
    std::vector<bb::fr> column_1_coefficients{ 1, 1 << 3, 1 << 10, 1 << 18 };
    std::vector<bb::fr> column_2_coefficients{ 0, 0, 0, 0 }; // Not accumulated; accessed individually
    std::vector<bb::fr> column_3_coefficients{ 0, 0, 0, 0 }; // Not accumulated; accessed individually
    MultiTable table(column_1_coefficients, column_2_coefficients, column_3_coefficients);
    table.id = id;
    table.slice_sizes = { (1 << 3), (1 << 7), (1 << 8), (1 << 14) };

    /**
     * Specify the rotation to apply to each limb. A rotation R "splits" limb [start, end] when
     * start < R ≤ end, causing some bits to wrap. The table handles splits from both σ₀ and σ₁.
     *
     * table_rotation = splitting_rotation - limb_start_position
     *
     *   | Limb | Start | Splitting rot | Table rot    |
     *   |------|-------|---------------|--------------|
     *   | L0   | 0     | (none)        | 0 (unused)   |
     *   | L1   | 3     | σ₀'s 7        | 7 - 3 = 4    |
     *   | L2   | 10    | σ₁'s 17       | 17 - 10 = 7  |
     *   | L3   | 18    | σ₁'s 19       | 19 - 18 = 1  |
     *
     */
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
