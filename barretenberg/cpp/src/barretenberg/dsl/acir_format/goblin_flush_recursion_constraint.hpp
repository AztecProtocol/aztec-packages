#pragma once

#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint_output.hpp"

namespace acir_format {

/**
 * @brief Process an ULTRA_GOBLIN recursion constraint.
 *
 * @details This function directly verifies ECCVM and Translator proofs inside the Mega circuit
 * using GoblinWithoutMergeRecursiveVerifier_<MegaCircuitBuilder>. The Translator's KZG batch_mul
 * operations (BN254 EC ops) are deferred to the Mega circuit's op queue via goblin biggroup dispatch,
 * to be verified in a subsequent ECCVM+Translator round.
 *
 * @param builder The Mega circuit builder
 * @param input The recursion constraint from ACIR (proof/public_inputs are empty for ULTRA_GOBLIN)
 * @param ivc_base The IVC instance containing the Goblin state
 * @return HonkRecursionConstraintOutput with accumulated pairing points and IPA claim
 */
HonkRecursionConstraintOutput<bb::MegaCircuitBuilder> create_goblin_flush_recursion_constraints(
    bb::MegaCircuitBuilder& builder, const RecursionConstraint& input, const std::shared_ptr<bb::IVCBase>& ivc_base);

} // namespace acir_format
