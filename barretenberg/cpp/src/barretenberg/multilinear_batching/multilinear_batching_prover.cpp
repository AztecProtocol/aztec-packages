// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "multilinear_batching_prover.hpp"
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb {

MultilinearBatchingProver::MultilinearBatchingProver(const std::shared_ptr<MultilinearBatchingProvingKey>& key,
                                                     const std::shared_ptr<Transcript>& transcript)
    : transcript(transcript)
    , key(key)
{
    BB_BENCH();
}

/**
 * @brief Add circuit size and values used in the relations to the transcript
 *
 */
void MultilinearBatchingProver::execute_preamble_round()
{
    // Fiat-Shamir the vk hash
    transcript->send_to_verifier("initial_randomness", fr::random_element());
    vinfo("MultilinearBatchingProver initial randomness in prover: ", fr::random_element());
}

void MultilinearBatchingProver::execute_challenges_and_evaluations_round()
{
    for (size_t i = 0; i < Flavor::VIRTUAL_LOG_N; i++) {
        transcript->send_to_verifier("accumulator_challenge_" + std::to_string(i),
                                     key->proving_key->accumulator_challenge[i]);
        transcript->send_to_verifier("instance_challenge_" + std::to_string(i),
                                     key->proving_key->instance_challenge[i]);
    }
    for (size_t i = 0; i < 2; i++) {
        transcript->send_to_verifier("accumulator_evaluation_" + std::to_string(i),
                                     key->proving_key->accumulator_evaluations[i]);
        transcript->send_to_verifier("instance_evaluation_" + std::to_string(i),
                                     key->proving_key->instance_evaluations[i]);
    }
}

// /**
//  * @brief Utility to commit to witness polynomial and send the commitment to verifier.
//  *
//  * @param polynomial
//  * @param label
//  */
// void TranslatorProver::commit_to_witness_polynomial(Polynomial& polynomial, const std::string& label)
// {
//     transcript->send_to_verifier(label, key->proving_key->commitment_key.commit(polynomial));
// }

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
void MultilinearBatchingProver::execute_relation_check_rounds()
{
    using Sumcheck = SumcheckProver<Flavor>;

    // Each linearly independent subrelation contribution is multiplied by `alpha^i`, where
    //  i = 0, ..., NUM_SUBRELATIONS- 1.
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    std::vector<FF> gate_challenges(Flavor::VIRTUAL_LOG_N);
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = FF(1);
    }

    const size_t circuit_size = key->proving_key->circuit_size;

    Sumcheck sumcheck(circuit_size,
                      key->proving_key->polynomials,
                      transcript,
                      alpha,
                      gate_challenges,
                      relation_parameters,
                      Flavor::VIRTUAL_LOG_N,
                      key->proving_key->accumulator_challenge,
                      key->proving_key->instance_challenge);

    sumcheck_output = sumcheck.prove();
}

HonkProof MultilinearBatchingProver::export_proof()
{
    return transcript->export_proof();
}

HonkProof MultilinearBatchingProver::construct_proof()
{
    BB_BENCH_NAME("MultilinearBatchingProver::construct_proof");

    // Add circuit size public input size and public inputs to transcript.
    execute_preamble_round();

    // Fiat-Shamir: challenges and evaluations
    execute_challenges_and_evaluations_round();
    // Fiat-Shamir: alpha
    // Run sumcheck subprotocol.
    execute_relation_check_rounds();

    vinfo("computed opening proof");
    return export_proof();
}

} // namespace bb
