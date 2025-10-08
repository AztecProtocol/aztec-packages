// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "multilinear_batching_verifier.hpp"

namespace bb {

MultilinearBatchingVerifier::MultilinearBatchingVerifier(const std::shared_ptr<Transcript>& transcript)
    : transcript(transcript)
{}

bool MultilinearBatchingVerifier::verify_proof(const HonkProof& proof)
{
    transcript->load_proof(proof);

    [[maybe_unused]] auto randomness = transcript->template receive_from_prover<FF>("initial_randomness");
    std::vector<FF> accumulator_challenges(Flavor::VIRTUAL_LOG_N);
    std::vector<FF> instance_challenges(Flavor::VIRTUAL_LOG_N);
    std::vector<FF> accumulator_evaluations(2);
    std::vector<FF> instance_evaluations(2);
    for (size_t i = 0; i < Flavor::VIRTUAL_LOG_N; i++) {
        accumulator_challenges[i] =
            transcript->template receive_from_prover<FF>("accumulator_challenge_" + std::to_string(i));
        instance_challenges[i] =
            transcript->template receive_from_prover<FF>("instance_challenge_" + std::to_string(i));
    }
    for (size_t i = 0; i < 2; i++) {
        accumulator_evaluations[i] =
            transcript->template receive_from_prover<FF>("accumulator_evaluation_" + std::to_string(i));
        instance_evaluations[i] =
            transcript->template receive_from_prover<FF>("instance_evaluation_" + std::to_string(i));
    }

    auto accumulator_non_shifted_evaluation = accumulator_evaluations[0];
    auto accumulator_shifted_evaluation = accumulator_evaluations[1];
    auto instance_non_shifted_evaluation = instance_evaluations[0];
    auto instance_shifted_evaluation = instance_evaluations[1];

    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");
    std::vector<FF> gate_challenges(Flavor::VIRTUAL_LOG_N);
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = FF(1);
    }

    std::vector<FF> padding_indicator(Flavor::VIRTUAL_LOG_N);
    std::ranges::fill(padding_indicator, FF{ 1 });

    info("accumulator_non_shifted_evaluation: ", accumulator_non_shifted_evaluation);
    info("instance_non_shifted_evaluation: ", instance_non_shifted_evaluation);
    info("accumulator_shifted_evaluation: ", accumulator_shifted_evaluation);
    info("instance_shifted_evaluation: ", instance_shifted_evaluation);
    info("alpha: ", alpha);
    auto target_sum = (((instance_shifted_evaluation * alpha + accumulator_shifted_evaluation) * alpha +
                        instance_non_shifted_evaluation) *
                           alpha +
                       accumulator_non_shifted_evaluation);
    Sumcheck sumcheck(transcript, alpha, Flavor::VIRTUAL_LOG_N, target_sum);
    const auto sumcheck_result = sumcheck.verify(relation_parameters, gate_challenges, padding_indicator);
    return sumcheck_result.verified;
}

} // namespace bb
