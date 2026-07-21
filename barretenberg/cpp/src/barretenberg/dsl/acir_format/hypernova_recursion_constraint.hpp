// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include <vector>

namespace acir_format {

using namespace bb;

/**
 * @brief Utilities for mocking Chonk state from ACIR recursion constraints
 *
 * @details These functions enable VK generation for Aztec kernel circuits without running a full IVC.
 * When compiling a Noir kernel program to generate its verification key, we need to populate the
 * circuit builder with valid witness values. Since the kernel performs recursive verification of
 * proofs that don't exist at compile time, we create mock proofs and VKs with the correct structure.
 *
 * The mocking is necessary because:
 * 1. Kernel circuits contain recursive verifier constraints that expect proof/VK witness data
 * 2. To generate a VK, we need to build the circuit which requires populating all witnesses
 * 3. The actual proofs being verified don't exist at VK generation time
 *
 * Security note: Mock data is only used for VK generation. During actual proving, real proofs
 * and VKs from the IVC are used. The VK generation process only needs structurally correct data
 * to determine the circuit's constraint structure.
 */

/**
 * @brief Create a Chonk instance with mocked state matching the given recursion constraints
 * @details Analyzes the constraint types to determine what mock data is needed (Oink proof, HN proof, etc.)
 *
 * @param constraints The IVC recursion constraints from an Aztec kernel program
 * @return A Chonk instance with mock verification queue entries and for the hiding kernels a batch merge proof
 */
std::shared_ptr<Chonk> create_mock_chonk_from_constraints(const std::vector<RecursionConstraint>& constraints);

/**
 * @brief Add mock accumulation data to a Chonk instance
 * @details DO NOT use directly, this is an helper function used in create_mock_chonk_from_constraints. Use that
 * function to create a mock Chonk state.
 */
void mock_chonk_accumulation(const std::shared_ptr<Chonk>& ivc, bool is_kernel, bool is_hiding_kernel = false);

} // namespace acir_format
