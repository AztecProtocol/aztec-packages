#pragma once

#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint_output.hpp"

namespace acir_format {

/**
 * @brief Process an ULTRA_GOBLIN recursion constraint: build Circuit C on-the-fly and recursively verify it.
 *
 * @details This function implements the Goblin flush app (A_G) logic:
 *   1. Extracts the Goblin proof and merge commitments from the IVC state (or creates mocks for VK generation)
 *   2. Builds Circuit C (an UltraCircuitBuilder that recursively verifies the Goblin proof)
 *   3. Proves Circuit C with Ultra Honk
 *   4. Recursively verifies C's proof inside the Mega circuit, using GoblinFlushIO to extract:
 *      - Aggregated pairing points (from Merge + Translator verification)
 *      - IPA opening claim (from ECCVM verification)
 *      - T_prev and t table commitments
 *
 * @param builder The Mega circuit builder (A_G's circuit)
 * @param input The recursion constraint from ACIR (proof/public_inputs are empty for ULTRA_GOBLIN)
 * @param ivc_base The IVC instance containing the Goblin state (nullptr for VK generation)
 * @return HonkRecursionConstraintOutput with accumulated pairing points and IPA claim
 */
HonkRecursionConstraintOutput<bb::MegaCircuitBuilder> create_goblin_flush_recursion_constraints(
    bb::MegaCircuitBuilder& builder, const RecursionConstraint& input, const std::shared_ptr<bb::IVCBase>& ivc_base);

} // namespace acir_format
