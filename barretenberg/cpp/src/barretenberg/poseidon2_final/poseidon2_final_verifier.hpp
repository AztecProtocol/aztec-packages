#pragma once

#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/flavor/poseidon2_single_row_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"

namespace bb {

/**
 * @brief Verifier for the Poseidon2 final proof in the IVC chain.
 *
 * @details Wraps UltraVerifier_<Poseidon2SingleRowFlavor> but substitutes the merged
 * poseidon2_op_wire commitments for the proof's wire commitments before verification.
 * This ensures the proof is verified against the same data that the merge protocol
 * accumulated.
 *
 * Commitment substitution (matching Translator pattern at translator_verifier.cpp:163-167):
 *   commitments.w_l              = op_wire_commitments[0]  (input[0])
 *   commitments.w_r              = op_wire_commitments[1]  (input[1])
 *   commitments.w_o              = op_wire_commitments[2]  (input[2])
 *   commitments.w_4              = op_wire_commitments[3]  (input[3])
 *   commitments.poseidon2_state[84]  = op_wire_commitments[4]  (output = state[0] after perm)
 *
 * The Poseidon2SingleRowRelation enforces permutation(w_l, w_r, w_o, w_4) → poseidon2_state[stage_64],
 * so substituting these commitments proves the op wire data is correct.
 *
 * @tparam Curve The curve type (native curve::BN254 or stdlib bn254<Builder>)
 */
template <typename Curve> class Poseidon2FinalVerifier_ {
  public:
    using Flavor = Poseidon2SingleRowFlavor;
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using PCS = bb::KZG<Curve>;
    using PairingPoints =
        std::conditional_t<Curve::is_stdlib_type, stdlib::recursion::PairingPoints<Curve>, bb::PairingPoints<Curve>>;
    static constexpr bool IsRecursive = Curve::is_stdlib_type;
    using Proof = HonkProof; // Native only for now
    static constexpr size_t NUM_OP_WIRES = 5;

    // Index of the output column in poseidon2_state array: last external round output element 0
    // Column layout: [0..15]=ext rounds 0-3, [16..71]=int rounds, [72..87]=ext rounds 60-63
    // Output of round 63 starts at column 84
    static constexpr size_t OUTPUT_STATE_IDX = 84;

    struct ReductionResult {
        PairingPoints pairing_points;
        bool reduction_succeeded = false;
    };

    /**
     * @brief Verify the Poseidon2 final proof with op wire commitment substitution.
     *
     * @param proof The Poseidon2SingleRowFlavor proof (from UltraProver_)
     * @param op_wire_commitments The 5 accumulated poseidon2_op_wire commitments from merge
     * @return ReductionResult with pairing points for deferred KZG verification
     */
    [[nodiscard("Verification result should be checked")]]
    ReductionResult reduce_to_pairing_check(
        const Proof& proof,
        const std::array<Commitment, NUM_OP_WIRES>& op_wire_commitments);
};

using Poseidon2FinalVerifier = Poseidon2FinalVerifier_<curve::BN254>;

} // namespace bb
