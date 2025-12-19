// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include <iomanip>
#include <iostream>
#include <string>

namespace bb::eccvm_test_utils {

using FF = ECCVMFlavor::FF;

/**
 * @brief Print selected ECCVM columns for debugging purposes.
 * @details Prints a formatted table of key polynomial values for the first N rows.
 * Useful for inspecting trace structure during development and debugging.
 *
 * @param test_name A label for the test case being printed
 * @param polys The prover polynomials to inspect
 * @param num_rows Number of rows to print (from the beginning)
 */
inline void print_eccvm_columns(const std::string& test_name,
                                const ECCVMFlavor::ProverPolynomials& polys,
                                size_t num_rows)
{
    auto to_uint = [](const FF& f) -> uint64_t { return static_cast<uint64_t>(f); };

    std::cout << "\n========== " << test_name << " ==========\n";
    std::cout << "First " << num_rows << " rows of selected columns:\n\n";

    // Print header
    std::cout << std::setw(4) << "row"
              << " | " << std::setw(7) << "pre_sel"
              << " | " << std::setw(7) << "pre_pc"
              << " | " << std::setw(7) << "pre_rnd"
              << " | " << std::setw(7) << "pt_tr"
              << " | " << std::setw(7) << "sc_sum"
              << " | " << std::setw(7) << "s1hi"
              << " | " << std::setw(7) << "s1lo"
              << " | " << std::setw(7) << "skew"
              << " | " << std::setw(7) << "tx_pc"
              << " | " << std::setw(7) << "msm_pc"
              << " | " << std::setw(7) << "tx_mul"
              << " | " << std::setw(7) << "tx_eq"
              << "\n";
    std::cout << std::string(130, '-') << "\n";

    for (size_t i = 0; i < num_rows; i++) {
        std::cout << std::setw(4) << i << " | " << std::setw(7) << to_uint(polys.precompute_select[i]) << " | "
                  << std::setw(7) << to_uint(polys.precompute_pc[i]) << " | " << std::setw(7)
                  << to_uint(polys.precompute_round[i]) << " | " << std::setw(7)
                  << to_uint(polys.precompute_point_transition[i]) << " | " << std::setw(7)
                  << to_uint(polys.precompute_scalar_sum[i]) << " | " << std::setw(7)
                  << to_uint(polys.precompute_s1hi[i]) << " | " << std::setw(7) << to_uint(polys.precompute_s1lo[i])
                  << " | " << std::setw(7) << to_uint(polys.precompute_skew[i]) << " | " << std::setw(7)
                  << to_uint(polys.transcript_pc[i]) << " | " << std::setw(7) << to_uint(polys.msm_pc[i]) << " | "
                  << std::setw(7) << to_uint(polys.transcript_mul[i]) << " | " << std::setw(7)
                  << to_uint(polys.transcript_eq[i]) << "\n";
    }
    std::cout << "\n";
}

/**
 * @brief Set a hiding op on the op_queue for testing.
 * @details The hiding op is stored via `append_hiding_op`, but when `get_eccvm_ops()` is called,
 * it gets prepended at index 0 of the ECCVM operations list. This ensures the ECCVM transcript
 * table has q_eq = 1 at row 1 (lagrange_second), which is required for the relation constraints.
 * In production (Chonk flow), a hiding op with random Px, Py provides statistical hiding.
 * For tests, we also use random values to match production behavior.
 */
inline void add_hiding_op_for_test(const std::shared_ptr<ECCOpQueue>& op_queue)
{
    using Fq = curve::BN254::BaseField;
    op_queue->append_hiding_op(Fq::random_element(), Fq::random_element());
}

} // namespace bb::eccvm_test_utils
