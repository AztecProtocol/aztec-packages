// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_recursive_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include <vector>

namespace acir_format {

using namespace bb;

/**
 * @brief Add to the builder the constraints to recursively verify a Honk proof.
 *
 * @tparam Flavor The flavor with which the proof was generated.
 *
 * @details A recursion constraint contains the data representing a Honk proof (verification key, verification key hash,
 * proof, public inputs), the proof type, and a predicate indicating whether the constraint should be active. If the
 * predicate is a witness holding the value false, then the constraint should not fail even if the proof is invalid.
 * The function works as follows:
 * 1. Given the witness indices contained in `input`, reconstruct in-circuit representations of the data required to
 *    recursively verify a proof.
 * 2. If we are in write_vk scenario, set the witness values in the builder to be valid elements (e.g. points on BN254)
 *    to avoid failures due to assertions present in the code. Not that the values will not necessarily represent a
 * valid proof.
 * 3. If predicate is witness false, conditionally assign the values so that the recursive verifications succeeds.
 * 4. Perform the recursive verification.
 *
 * @note To avoid perfoming pairings in-circuit, as we do across the whole codebase, the recursive verification returns
 * a PairingPoints object. The recursive verification was successful if the object passes the check: \f$(P_1, P_2)\f$
 * must satisfy \f$e(P_1, [1]) e(P_2, [x]) = 1\f$, where \f$x\f$ is the randomness used to generate the SRS.
 */
template <typename Flavor>
[[nodiscard("IPA claim and Pairing points should be accumulated")]] HonkRecursionConstraintOutput<
    typename Flavor::CircuitBuilder>
create_honk_recursion_constraints(typename Flavor::CircuitBuilder& builder, const RecursionConstraint& input)
    requires(IsRecursiveFlavor<Flavor> && IsUltraHonk<typename Flavor::NativeFlavor>);

#ifndef NDEBUG
template <typename Flavor>
void native_verification_debug(const std::shared_ptr<typename Flavor::VerificationKey> vkey,
                               const typename Flavor::NativeFlavor::FF vkey_hash,
                               const bb::stdlib::Proof<typename Flavor::CircuitBuilder>& proof_fields);
#endif

} // namespace acir_format
