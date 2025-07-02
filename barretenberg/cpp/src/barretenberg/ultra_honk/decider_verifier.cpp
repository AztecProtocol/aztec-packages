// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "decider_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/stdlib/primitives/padding_indicator_array/padding_indicator_array.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/decider_verification_key.hpp"

namespace bb {

template <typename Flavor>
DeciderVerifier_<Flavor>::DeciderVerifier_(const std::shared_ptr<DeciderVerificationKey>& accumulator,
                                           const std::shared_ptr<Transcript>& transcript)
    : accumulator(accumulator)
    , transcript(transcript)
{}

/**
 * @brief Verify a decider proof relative to a decider verification key (ϕ, \vec{β*}, e*).
 */
template <typename Flavor>
typename DeciderVerifier_<Flavor>::Output DeciderVerifier_<Flavor>::verify_proof(const DeciderProof& proof)
{
    transcript->load_proof(proof);
    return verify();
}

/**
 * @brief Verify a decider proof that is assumed to be contained in the transcript
 *
 */
template <typename Flavor> typename DeciderVerifier_<Flavor>::Output DeciderVerifier_<Flavor>::verify()
{
    using PCS = typename Flavor::PCS;
    using Curve = typename Flavor::Curve;
    using Shplemini = ShpleminiVerifier_<Curve>;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    VerifierCommitments commitments{ accumulator->vk, accumulator->witness_commitments };

    const size_t log_circuit_size = static_cast<size_t>(accumulator->vk->log_circuit_size);

    std::array<FF, CONST_PROOF_SIZE_LOG_N> padding_indicator_array;

    for (size_t idx = 0; idx < CONST_PROOF_SIZE_LOG_N; idx++) {
        padding_indicator_array[idx] = (idx < log_circuit_size) ? FF{ 1 } : FF{ 0 };
    }

    SumcheckVerifier<Flavor> sumcheck(transcript, accumulator->target_sum);
    // For MegaZKFlavor: receive commitments to Libra masking polynomials
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};
    if constexpr (Flavor::HasZK) {
        libra_commitments[0] = transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");
    }
    SumcheckOutput<Flavor> sumcheck_output = sumcheck.verify(
        accumulator->relation_parameters, accumulator->alphas, accumulator->gate_challenges, padding_indicator_array);

    // For MegaZKFlavor: the sumcheck output contains claimed evaluations of the Libra polynomials
    if constexpr (Flavor::HasZK) {
        libra_commitments[1] = transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
        libra_commitments[2] = transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");
    }

    bool consistency_checked = true;
    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ commitments.get_unshifted(), sumcheck_output.claimed_evaluations.get_unshifted() },
        .shifted = ClaimBatch{ commitments.get_to_be_shifted(), sumcheck_output.claimed_evaluations.get_shifted() }
    };
    const BatchOpeningClaim<Curve> opening_claim =
        Shplemini::compute_batch_opening_claim(padding_indicator_array,
                                               claim_batcher,
                                               sumcheck_output.challenge,
                                               Commitment::one(),
                                               transcript,
                                               Flavor::REPEATED_COMMITMENTS,
                                               Flavor::HasZK,
                                               &consistency_checked,
                                               libra_commitments,
                                               sumcheck_output.claimed_libra_evaluation);

    const auto pairing_points = PCS::reduce_verify_batch_opening_claim(opening_claim, transcript);

    return Output{ sumcheck_output.verified, consistency_checked, { pairing_points[0], pairing_points[1] } };
}

template class DeciderVerifier_<UltraFlavor>;
template class DeciderVerifier_<UltraZKFlavor>;
template class DeciderVerifier_<UltraKeccakFlavor>;
#ifdef STARKNET_GARAGA_FLAVORS
template class DeciderVerifier_<UltraStarknetFlavor>;
template class DeciderVerifier_<UltraStarknetZKFlavor>;
#endif
template class DeciderVerifier_<UltraKeccakZKFlavor>;
template class DeciderVerifier_<UltraRollupFlavor>;
template class DeciderVerifier_<MegaFlavor>;
template class DeciderVerifier_<MegaZKFlavor>;

} // namespace bb
