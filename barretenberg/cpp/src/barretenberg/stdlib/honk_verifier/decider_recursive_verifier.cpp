// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/stdlib/honk_verifier/decider_recursive_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/stdlib/primitives/padding_indicator_array/padding_indicator_array.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief Create a circuit used to prove that a Protogalaxy folding verification was executed.
 *
 */
template <typename Flavor>
DeciderRecursiveVerifier_<Flavor>::AggregationObject DeciderRecursiveVerifier_<Flavor>::verify_proof(
    const HonkProof& proof)
{
    using Sumcheck = ::bb::SumcheckVerifier<Flavor>;
    using PCS = typename Flavor::PCS;
    using Curve = typename Flavor::Curve;
    using Shplemini = ::bb::ShpleminiVerifier_<Curve>;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using Transcript = typename Flavor::Transcript;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    StdlibProof<Builder> stdlib_proof = bb::convert_native_proof_to_stdlib(builder, proof);
    transcript = std::make_shared<Transcript>(stdlib_proof);

    VerifierCommitments commitments{ accumulator->verification_key, accumulator->witness_commitments };

    const auto padding_indicator_array =
        compute_padding_indicator_array<Curve, CONST_PROOF_SIZE_LOG_N>(accumulator->verification_key->log_circuit_size);

    constrain_log_circuit_size(padding_indicator_array, accumulator->verification_key->circuit_size);

    Sumcheck sumcheck(transcript, accumulator->target_sum);

    SumcheckOutput<Flavor> output = sumcheck.verify(
        accumulator->relation_parameters, accumulator->alphas, accumulator->gate_challenges, padding_indicator_array);

    // Execute Shplemini rounds.
    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ commitments.get_unshifted(), output.claimed_evaluations.get_unshifted() },
        .shifted = ClaimBatch{ commitments.get_to_be_shifted(), output.claimed_evaluations.get_shifted() }
    };
    const auto opening_claim = Shplemini::compute_batch_opening_claim(padding_indicator_array,
                                                                      claim_batcher,
                                                                      output.challenge,
                                                                      Commitment::one(builder),
                                                                      transcript,
                                                                      Flavor::REPEATED_COMMITMENTS,
                                                                      Flavor::HasZK);
    auto pairing_points = PCS::reduce_verify_batch_opening_claim(opening_claim, transcript);

    return { pairing_points[0], pairing_points[1] };
}

template class DeciderRecursiveVerifier_<bb::MegaRecursiveFlavor_<MegaCircuitBuilder>>;
template class DeciderRecursiveVerifier_<bb::MegaRecursiveFlavor_<UltraCircuitBuilder>>;
} // namespace bb::stdlib::recursion::honk
