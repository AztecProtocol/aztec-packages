// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/eccvm/eccvm_builder_types.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
namespace bb {

/**
 * @brief Class for tracking the number of rows in the ECCVM circuit and the number of muls performed as the op queue is
 * populated.
 * @details This is to avoid expensive O(n) logic to compute the number of rows and muls during witness computation
 */
class EccvmRowTracker {
    using Curve = curve::BN254;

    uint32_t cached_num_muls = 0;
    uint32_t cached_active_msm_count = 0;
    uint32_t num_transcript_rows = 0;
    uint32_t num_precompute_table_rows = 0;
    uint32_t num_msm_rows = 0;

  public:
    [[nodiscard]] uint32_t get_number_of_muls() const { return cached_num_muls + cached_active_msm_count; }

    /**
     * @brief Get the number of rows in the 'msm' column section of the ECCVM associated with a single multiscalar
     * multiplication.
     *
     * @param msm_size
     * @return uint32_t
     */
    static uint32_t num_eccvm_msm_rows(const size_t msm_size)
    {
        const size_t rows_per_wnaf_digit =
            (msm_size / eccvm::ADDITIONS_PER_ROW) + ((msm_size % eccvm::ADDITIONS_PER_ROW != 0) ? 1 : 0);
        const size_t num_rows_for_all_rounds =
            (eccvm::NUM_WNAF_DIGITS_PER_SCALAR + 1) * rows_per_wnaf_digit; // + 1 round for skew
        const size_t num_double_rounds = eccvm::NUM_WNAF_DIGITS_PER_SCALAR - 1;
        const size_t num_rows_for_msm = num_rows_for_all_rounds + num_double_rounds;

        return static_cast<uint32_t>(num_rows_for_msm);
    }

    /**
     * @brief Get the number of rows in the 'msm' column section, for all msms in the circuit
     *
     * @return size_t
     */
    size_t get_num_msm_rows() const
    {
        size_t msm_rows = num_msm_rows + 2;
        if (cached_active_msm_count > 0) {
            msm_rows += num_eccvm_msm_rows(cached_active_msm_count);
        }
        return msm_rows;
    }

    /**
     * @brief Get the number of rows for the current ECCVM circuit
     *
     * @return size_t
     */
    size_t get_num_rows() const
    {
        // add 1 row to start and end of transcript and msm sections
        const size_t transcript_rows = num_transcript_rows + 2;
        size_t msm_rows = num_msm_rows + 2;
        // add 1 row to start of precompute table section
        size_t precompute_rows = num_precompute_table_rows + 1;
        if (cached_active_msm_count > 0) {
            msm_rows += num_eccvm_msm_rows(cached_active_msm_count);
            precompute_rows += get_precompute_table_row_count_for_single_msm(cached_active_msm_count);
        }

        return std::max(transcript_rows, std::max(msm_rows, precompute_rows));
    }

    /**
     * @brief Update cached_active_msm_count or update other row counts and reset cached_active_msm_count.
     * @details To the OpQueue, an MSM is a sequence of successive mul opcodes (note that mul might better be called
     * mul_add--its effect on the accumulator is += scalar * point).
     *
     * @param op
     */
    void update_cached_msms(const ECCVMOperation& op)
    {
        num_transcript_rows++;
        if (op.op_code.mul) {
            if (op.z1 != 0 && !op.base_point.is_point_at_infinity()) {
                cached_active_msm_count++;
            }
            if (op.z2 != 0 && !op.base_point.is_point_at_infinity()) {
                cached_active_msm_count++;
            }
        } else if (cached_active_msm_count != 0) {
            num_msm_rows += num_eccvm_msm_rows(cached_active_msm_count);
            num_precompute_table_rows += get_precompute_table_row_count_for_single_msm(cached_active_msm_count);
            cached_num_muls += cached_active_msm_count;
            cached_active_msm_count = 0;
        }
    }

    /**
     * @brief Get the precompute table row count for single msm object
     *
     * @param msm_count
     * @return uint32_t
     */
    static uint32_t get_precompute_table_row_count_for_single_msm(const size_t msm_count)
    {
        constexpr size_t num_precompute_rows_per_scalar =
            eccvm::NUM_WNAF_DIGITS_PER_SCALAR / eccvm::WNAF_DIGITS_PER_ROW;
        const size_t num_rows_for_precompute_table = msm_count * num_precompute_rows_per_scalar;
        return static_cast<uint32_t>(num_rows_for_precompute_table);
    }
};

} // namespace bb
