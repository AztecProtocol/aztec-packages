// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "multilinear_batching_prover.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb {

MultilinearBatchingProver::MultilinearBatchingProver(MultilinearBatchingProverClaim&& accumulator_claim,
                                                     MultilinearBatchingProverClaim&& instance_claim,
                                                     std::shared_ptr<Transcript> transcript)
    : transcript(std::move(transcript))
    , key(std::move(accumulator_claim), std::move(instance_claim))
{}

void MultilinearBatchingProver::execute_commitments_round()
{
    BB_BENCH();
    transcript->send_to_verifier("non_shifted_accumulator_commitment", key.non_shifted_accumulator_commitment);
    transcript->send_to_verifier("shifted_accumulator_commitment", key.shifted_accumulator_commitment);
}

void MultilinearBatchingProver::execute_challenges_and_evaluations_round()
{
    BB_BENCH();
    for (size_t i = 0; i < Flavor::VIRTUAL_LOG_N; i++) {
        transcript->send_to_verifier("accumulator_challenge_" + std::to_string(i), key.accumulator_challenge[i]);
    }
    for (size_t i = 0; i < Flavor::NUM_ACCUMULATOR_EVALUATIONS; i++) {
        transcript->send_to_verifier("accumulator_evaluation_" + std::to_string(i), key.accumulator_evaluations[i]);
    }
}

void MultilinearBatchingProver::execute_relation_check_rounds()
{
    BB_BENCH();
    using Sumcheck = SumcheckProver<Flavor>;

    // Each linearly independent subrelation contribution is multiplied by `alpha^i`, where
    //  i = 0, ..., NUM_SUBRELATIONS- 1.
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    const size_t circuit_size = key.circuit_size;

    Sumcheck sumcheck(circuit_size,
                      key.polynomials,
                      transcript,
                      alpha,
                      Flavor::VIRTUAL_LOG_N,
                      key.accumulator_challenge,
                      key.instance_challenge);

    sumcheck_output = sumcheck.prove();
}

MultilinearBatchingProverClaim MultilinearBatchingProver::compute_new_claim()
{
    BB_BENCH();

    const FF claim_batching_challenge = transcript->get_challenge<FF>("claim_batching_challenge");

    // Accumulate into instance polynomial, extending only if accumulator is larger
    auto& unshifted = key.polynomials.batched_unshifted_instance;
    if (unshifted.end_index() < key.circuit_size) {
        unshifted = Polynomial<FF>(unshifted, key.circuit_size);
    }
    unshifted.add_scaled(key.polynomials.batched_unshifted_accumulator, claim_batching_challenge);

    auto& shifted = key.preshifted_instance;
    if (shifted.end_index() < key.circuit_size) {
        shifted = Polynomial<FF>(shifted, key.circuit_size - 1);
    }
    shifted.add_scaled(key.preshifted_accumulator, claim_batching_challenge);

    // New commitments
    auto new_non_shifted_commitment =
        key.non_shifted_instance_commitment + key.non_shifted_accumulator_commitment * claim_batching_challenge;
    auto new_shifted_commitment =
        key.shifted_instance_commitment + key.shifted_accumulator_commitment * claim_batching_challenge;

    // New evaluations
    FF new_non_shifted_evaluation =
        sumcheck_output.claimed_evaluations.batched_unshifted_instance +
        sumcheck_output.claimed_evaluations.batched_unshifted_accumulator * claim_batching_challenge;
    FF new_shifted_evaluation =
        sumcheck_output.claimed_evaluations.batched_shifted_instance +
        sumcheck_output.claimed_evaluations.batched_shifted_accumulator * claim_batching_challenge;

    return MultilinearBatchingProverClaim{ .challenge = std::move(sumcheck_output.challenge),
                                           .non_shifted_evaluation = new_non_shifted_evaluation,
                                           .shifted_evaluation = new_shifted_evaluation,
                                           .non_shifted_polynomial = std::move(unshifted),
                                           .shifted_polynomial = std::move(shifted),
                                           .non_shifted_commitment = new_non_shifted_commitment,
                                           .shifted_commitment = new_shifted_commitment,
                                           .dyadic_size = key.circuit_size };
}

HonkProof MultilinearBatchingProver::export_proof()
{
    return transcript->export_proof();
}

HonkProof MultilinearBatchingProver::construct_proof()
{
    BB_BENCH_NAME("MultilinearBatchingProver::construct_proof");

    execute_commitments_round();
    execute_challenges_and_evaluations_round();
    execute_relation_check_rounds();

    vinfo("MultilinearBatchingProver:: Computed batching proof");
    return export_proof();
}

} // namespace bb
