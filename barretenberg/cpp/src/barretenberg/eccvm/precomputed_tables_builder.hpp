// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 2a49eb6 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "./eccvm_builder_types.hpp"
#include "barretenberg/common/assert.hpp"

namespace bb {

class ECCVMPointTablePrecomputationBuilder {
  public:
    using CycleGroup = bb::g1;
    using FF = grumpkin::fr;
    using Element = typename CycleGroup::element;
    using AffineElement = typename CycleGroup::affine_element;

    static constexpr size_t NUM_WNAF_DIGITS_PER_SCALAR = bb::eccvm::NUM_WNAF_DIGITS_PER_SCALAR;
    static constexpr size_t WNAF_DIGITS_PER_ROW = bb::eccvm::WNAF_DIGITS_PER_ROW;
    static constexpr size_t NUM_WNAF_DIGIT_BITS = bb::eccvm::NUM_WNAF_DIGIT_BITS;
    static constexpr size_t POINT_TABLE_SIZE = bb::eccvm::POINT_TABLE_SIZE;

    // With WNAF_DIGITS_PER_ROW = 8, we have num_rows_per_scalar = 32/8 = 4.
    // We need to store 8 precomputed points (P, 3P, ..., 15P), so we store 2 per row.
    struct PointTablePrecomputationRow {
        // s1, ..., s16 are each 2 bits, so they jointly encode 32 bits of information, which corresponds precisely to
        // the data of 8 wNAF digits. They are ordered from "highest order" to "lowest order". The encoding is:
        // the concatenation s_{2i-1}s_{2i} is naturally a number in {0, 1, ..., 15}; to obtain the corresponding wNAF
        // digit, multiply by 2 and subtract 15.
        int s1 = 0;
        int s2 = 0;
        int s3 = 0;
        int s4 = 0;
        int s5 = 0;
        int s6 = 0;
        int s7 = 0;
        int s8 = 0;
        int s9 = 0;
        int s10 = 0;
        int s11 = 0;
        int s12 = 0;
        int s13 = 0;
        int s14 = 0;
        int s15 = 0;
        int s16 = 0;
        bool skew = false;
        bool point_transition = false;
        uint32_t pc = 0;
        uint32_t round = 0;
        uint256_t scalar_sum = 0;
        AffineElement precompute_accumulator{
            0, 0
        }; // contains a precomputed element, i.e., something in {P, 3P, ..., 15P}.
        AffineElement precompute_accumulator2{
            0, 0
        }; // second precomputed element for this row (2 points per row now that num_rows_per_scalar = 4).
        AffineElement precompute_double{ 0, 0 };
    };

    static std::vector<PointTablePrecomputationRow> compute_rows(
        const std::vector<bb::eccvm::ScalarMul<CycleGroup>>& ecc_muls)
    {
        static constexpr size_t num_rows_per_scalar = NUM_WNAF_DIGITS_PER_SCALAR / WNAF_DIGITS_PER_ROW; // 32/8 = 4
        // We need to store POINT_TABLE_SIZE/2 = 8 precomputed points across num_rows_per_scalar = 4 rows,
        // so 2 points per row.
        static_assert(POINT_TABLE_SIZE / 2 == num_rows_per_scalar * 2,
                      "precompute_accumulator fill loop assumes 2 points per row");
        const size_t num_precompute_rows = num_rows_per_scalar * ecc_muls.size() + 1;
        std::vector<PointTablePrecomputationRow> precompute_state(num_precompute_rows);

        // start with empty row (shiftable polynomials must have 0 as first coefficient)
        precompute_state[0] = PointTablePrecomputationRow{};

        static_assert(WNAF_DIGITS_PER_ROW == 8);

        parallel_for_range(ecc_muls.size(), [&](size_t start, size_t end) {
            for (size_t j = start; j < end; j++) {
                const auto& entry = ecc_muls[j];
                const auto& slices = entry.wnaf_digits;
                uint256_t scalar_sum = 0;

                for (size_t i = 0; i < num_rows_per_scalar; ++i) {
                    PointTablePrecomputationRow row;

                    // Extract 8 wNAF digits for this row
                    const int slice0 = slices[i * WNAF_DIGITS_PER_ROW];
                    const int slice1 = slices[i * WNAF_DIGITS_PER_ROW + 1];
                    const int slice2 = slices[i * WNAF_DIGITS_PER_ROW + 2];
                    const int slice3 = slices[i * WNAF_DIGITS_PER_ROW + 3];
                    const int slice4 = slices[i * WNAF_DIGITS_PER_ROW + 4];
                    const int slice5 = slices[i * WNAF_DIGITS_PER_ROW + 5];
                    const int slice6 = slices[i * WNAF_DIGITS_PER_ROW + 6];
                    const int slice7 = slices[i * WNAF_DIGITS_PER_ROW + 7];

                    // {-15, -13, ..., 13, 15} --> {0, 1, ..., 15}
                    const int slice0base2 = (slice0 + 15) / 2;
                    const int slice1base2 = (slice1 + 15) / 2;
                    const int slice2base2 = (slice2 + 15) / 2;
                    const int slice3base2 = (slice3 + 15) / 2;
                    const int slice4base2 = (slice4 + 15) / 2;
                    const int slice5base2 = (slice5 + 15) / 2;
                    const int slice6base2 = (slice6 + 15) / 2;
                    const int slice7base2 = (slice7 + 15) / 2;

                    // convert into 2-bit chunks (16 slices for 8 digits)
                    row.s1 = slice0base2 >> 2;
                    row.s2 = slice0base2 & 3;
                    row.s3 = slice1base2 >> 2;
                    row.s4 = slice1base2 & 3;
                    row.s5 = slice2base2 >> 2;
                    row.s6 = slice2base2 & 3;
                    row.s7 = slice3base2 >> 2;
                    row.s8 = slice3base2 & 3;
                    row.s9 = slice4base2 >> 2;
                    row.s10 = slice4base2 & 3;
                    row.s11 = slice5base2 >> 2;
                    row.s12 = slice5base2 & 3;
                    row.s13 = slice6base2 >> 2;
                    row.s14 = slice6base2 & 3;
                    row.s15 = slice7base2 >> 2;
                    row.s16 = slice7base2 & 3;
                    bool last_row = (i == num_rows_per_scalar - 1);

                    row.skew = last_row ? entry.wnaf_skew : false;

                    row.scalar_sum = scalar_sum;

                    // N.B. we apply a constraint that requires slice1 to be positive for the 1st row of each scalar
                    // sum. This ensures we do not have WNAF representations of negative values
                    // Use int64_t to avoid signed overflow: with 8 digits, slice0*(1<<28) can exceed INT_MAX
                    const int64_t row_chunk =
                        static_cast<int64_t>(slice7) + (static_cast<int64_t>(slice6) << 4) +
                        (static_cast<int64_t>(slice5) << 8) + (static_cast<int64_t>(slice4) << 12) +
                        (static_cast<int64_t>(slice3) << 16) + (static_cast<int64_t>(slice2) << 20) +
                        (static_cast<int64_t>(slice1) << 24) + (static_cast<int64_t>(slice0) << 28);

                    bool chunk_negative = row_chunk < 0;

                    // Shift by 32 bits (8 digits * 4 bits each)
                    scalar_sum = scalar_sum << (NUM_WNAF_DIGIT_BITS * WNAF_DIGITS_PER_ROW);
                    if (chunk_negative) {
                        scalar_sum -= static_cast<uint64_t>(-row_chunk);
                    } else {
                        scalar_sum += static_cast<uint64_t>(row_chunk);
                    }
                    row.round = static_cast<uint32_t>(i);
                    row.point_transition = last_row;
                    row.pc = entry.pc;

                    if (last_row) {
                        BB_ASSERT(scalar_sum - entry.wnaf_skew, entry.scalar);
                    }
                    // the last element of the `precomputed_table` field of a `ScalarMul` is the double of the point.
                    row.precompute_double = entry.precomputed_table[POINT_TABLE_SIZE];
                    // fill accumulators: 2 precomputed points per row, in reverse order.
                    // Row 0: table[POINT_TABLE_SIZE-1] = 15P, table[POINT_TABLE_SIZE-2] = 13P
                    // Row 1: table[POINT_TABLE_SIZE-3] = 11P, table[POINT_TABLE_SIZE-4] = 9P
                    // ...
                    // Row 3: table[POINT_TABLE_SIZE-7] = 3P,  table[POINT_TABLE_SIZE-8] = P
                    row.precompute_accumulator = entry.precomputed_table[POINT_TABLE_SIZE - 1 - (2 * i)];
                    row.precompute_accumulator2 = entry.precomputed_table[POINT_TABLE_SIZE - 2 - (2 * i)];
                    precompute_state[j * num_rows_per_scalar + i + 1] = (row);
                }
            }
        });
        return precompute_state;
    }
};
} // namespace bb
