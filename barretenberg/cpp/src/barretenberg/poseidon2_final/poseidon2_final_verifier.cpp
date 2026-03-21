#include "poseidon2_final_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb {

/**
 * @brief Verify Poseidon2 final proof with op wire commitment substitution.
 *
 * @details Follows the same flow as UltraVerifier_::reduce_to_pairing_check() but substitutes
 * the merged poseidon2_op_wire commitments for the wire commitments before Sumcheck/PCS.
 * This matches the Translator pattern (translator_verifier.cpp:163-167) where op queue wire
 * commitments from the merge protocol are injected into the verifier commitments.
 */
template <typename Curve>
typename Poseidon2FinalVerifier_<Curve>::ReductionResult Poseidon2FinalVerifier_<Curve>::reduce_to_pairing_check(
    const Proof& proof,
    const std::array<Commitment, NUM_OP_WIRES>& op_wire_commitments)
{
    using Shplemini = ShpleminiVerifier_<Curve, Flavor::HasZK>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = typename ClaimBatcher::Batch;

    auto transcript = std::make_shared<typename Flavor::Transcript>();
    transcript->load_proof(proof);

    // Compute log_n from proof size
    const auto log_n_field = transcript->template receive_from_prover<FF>("circuit_size");
    size_t log_n;
    if constexpr (IsRecursive) {
        log_n = static_cast<size_t>(uint256_t(log_n_field.get_value()));
    } else {
        log_n = static_cast<size_t>(uint256_t(log_n_field));
    }

    // Run OinkVerifier to get witness commitments and relation parameters
    auto vk = std::make_shared<typename Flavor::VerificationKey>();
    auto verifier_instance = std::make_shared<VerifierInstance_<Flavor>>(vk);

    const size_t num_public_inputs = 0; // Poseidon2 final proof has no public inputs
    OinkVerifier<Flavor> oink_verifier{ verifier_instance, transcript, num_public_inputs };
    oink_verifier.verify();

    // Build VerifierCommitments from VK + witness commitments
    typename Flavor::VerifierCommitments commitments{ verifier_instance->get_vk(),
                                                      verifier_instance->witness_commitments };

    // === KEY STEP: Substitute op wire commitments for wire commitments ===
    // This is the Poseidon2 equivalent of translator_verifier.cpp:163-167
    commitments.w_l = op_wire_commitments[0];              // input[0]
    commitments.w_r = op_wire_commitments[1];              // input[1]
    commitments.w_o = op_wire_commitments[2];              // input[2]
    commitments.w_4 = op_wire_commitments[3];              // input[3]
    commitments.poseidon2_state[OUTPUT_STATE_IDX] = op_wire_commitments[4]; // output = state[0] after perm

    // Padding indicator array
    std::vector<FF> padding_indicator_array(log_n, FF(1));

    // Gate challenges
    verifier_instance->gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", log_n);

    // Sumcheck
    const FF alpha = verifier_instance->alpha;
    SumcheckVerifier<Flavor> sumcheck(transcript, alpha, log_n);
    auto sumcheck_output =
        sumcheck.verify(verifier_instance->relation_parameters, verifier_instance->gate_challenges, padding_indicator_array);

    // PCS (Shplemini)
    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ commitments.get_unshifted(), sumcheck_output.claimed_evaluations.get_unshifted() },
        .shifted = ClaimBatch{ commitments.get_to_be_shifted(), sumcheck_output.claimed_evaluations.get_shifted() }
    };

    Commitment one_commitment;
    if constexpr (IsRecursive) {
        one_commitment = Commitment::one(op_wire_commitments[0].get_context());
    } else {
        one_commitment = Commitment::one();
    }

    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};
    auto shplemini_output = Shplemini::compute_batch_opening_claim(padding_indicator_array,
                                                                   claim_batcher,
                                                                   sumcheck_output.challenge,
                                                                   one_commitment,
                                                                   transcript,
                                                                   Flavor::REPEATED_COMMITMENTS,
                                                                   libra_commitments,
                                                                   sumcheck_output.claimed_libra_evaluation);

    auto pairing_points = PCS::reduce_verify_batch_opening_claim(
        std::move(shplemini_output.batch_opening_claim), transcript, Flavor::FINAL_PCS_MSM_SIZE(log_n));

    vinfo("Poseidon2 Final Verifier: sumcheck verified: ", sumcheck_output.verified);

    return { pairing_points, sumcheck_output.verified };
}

// Explicit template instantiation
template class Poseidon2FinalVerifier_<curve::BN254>;

} // namespace bb
