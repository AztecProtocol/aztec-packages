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
#include "barretenberg/multilinear_batching/multilinear_batching_claims.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb {

MultilinearBatchingProver::MultilinearBatchingProver(
    const std::shared_ptr<MultilinearBatchingProverClaim>& accumulator_claim,
    const std::shared_ptr<MultilinearBatchingProverClaim>& instance_claim,
    const std::shared_ptr<Transcript>& transcript)
    : transcript(transcript)
{
    BB_BENCH();
    ProverPolynomials polynomials;
    size_t virtual_circuit_size = 1 << Flavor::VIRTUAL_LOG_N;
    size_t max_dyadic_size = std::max(accumulator_claim->dyadic_size, instance_claim->dyadic_size);
    polynomials.w_non_shifted_accumulator = accumulator_claim->non_shifted_polynomial;
    polynomials.w_shifted_accumulator = accumulator_claim->shifted_polynomial.shifted();
    polynomials.w_non_shifted_instance = instance_claim->non_shifted_polynomial;
    polynomials.w_shifted_instance = instance_claim->shifted_polynomial.shifted();
    polynomials.w_evaluations_accumulator =
        ProverEqPolynomial<FF>::construct(accumulator_claim->challenge, bb::numeric::get_msb(max_dyadic_size));
    polynomials.w_evaluations_instance =
        ProverEqPolynomial<FF>::construct(instance_claim->challenge, bb::numeric::get_msb(max_dyadic_size));

    polynomials.increase_polynomials_virtual_size(virtual_circuit_size);
    std::vector<FF> accumulator_evaluations = { accumulator_claim->non_shifted_evaluation,
                                                accumulator_claim->shifted_evaluation };
    std::vector<FF> instance_evaluations = { instance_claim->non_shifted_evaluation,
                                             instance_claim->shifted_evaluation };
    key = std::make_shared<MultilinearBatchingProvingKey>(polynomials,
                                                          accumulator_claim->challenge,
                                                          instance_claim->challenge,
                                                          accumulator_evaluations,
                                                          instance_evaluations,
                                                          accumulator_claim->non_shifted_commitment,
                                                          accumulator_claim->shifted_commitment,
                                                          instance_claim->non_shifted_commitment,
                                                          instance_claim->shifted_commitment,
                                                          accumulator_claim->shifted_polynomial,
                                                          instance_claim->shifted_polynomial);
    key->proving_key->circuit_size = max_dyadic_size;
}

void MultilinearBatchingProver::execute_commitments_round()
{
    BB_BENCH();
    transcript->send_to_verifier("non_shifted_accumulator_commitment", key->non_shifted_accumulator_commitment);
    transcript->send_to_verifier("shifted_accumulator_commitment", key->shifted_accumulator_commitment);
}
void MultilinearBatchingProver::execute_challenges_and_evaluations_round()
{
    BB_BENCH();
    for (size_t i = 0; i < Flavor::VIRTUAL_LOG_N; i++) {
        transcript->send_to_verifier("accumulator_challenge_" + std::to_string(i),
                                     key->proving_key->accumulator_challenge[i]);
    }
    for (size_t i = 0; i < 2; i++) {
        transcript->send_to_verifier("accumulator_evaluation_" + std::to_string(i),
                                     key->proving_key->accumulator_evaluations[i]);
    }
}

/**
 * @brief Run Sumcheck resulting in u = (u_1,...,u_d) challenges and all evaluations at u being calculated.
 *
 */
void MultilinearBatchingProver::execute_relation_check_rounds()
{
    BB_BENCH();
    using Sumcheck = SumcheckProver<Flavor>;

    // Each linearly independent subrelation contribution is multiplied by `alpha^i`, where
    //  i = 0, ..., NUM_SUBRELATIONS- 1.
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    const size_t circuit_size = key->proving_key->circuit_size;

    Sumcheck sumcheck(circuit_size,
                      key->proving_key->polynomials,
                      transcript,
                      alpha,
                      Flavor::VIRTUAL_LOG_N,
                      key->proving_key->accumulator_challenge,
                      key->proving_key->instance_challenge);

    sumcheck_output = sumcheck.prove();
}

MultilinearBatchingProverClaim MultilinearBatchingProver::compute_new_claim()
{
    BB_BENCH();

    // Batching challenge: the new claim is computed as instance + challenge * accumulator
    auto claim_batching_challenge = transcript->get_challenge<FF>("claim_batching_challenge");

    // New polynomials
    auto new_non_shifted_polynomial = Polynomial(key->proving_key->circuit_size);
    new_non_shifted_polynomial += key->proving_key->polynomials.w_non_shifted_instance;
    new_non_shifted_polynomial.add_scaled(key->proving_key->polynomials.w_non_shifted_accumulator,
                                          claim_batching_challenge);

    auto new_shifted_polynomial = Polynomial::shiftable(key->proving_key->circuit_size);
    new_shifted_polynomial += key->preshifted_instance;
    new_shifted_polynomial.add_scaled(key->preshifted_accumulator, claim_batching_challenge);

    // New commitments
    auto new_non_shifted_commitment =
        key->non_shifted_instance_commitment + key->non_shifted_accumulator_commitment * claim_batching_challenge;
    auto new_shifted_commitment =
        key->shifted_instance_commitment + key->shifted_accumulator_commitment * claim_batching_challenge;

    // New evaluations
    FF new_non_shifted_evaluation =
        sumcheck_output.claimed_evaluations.w_non_shifted_instance +
        sumcheck_output.claimed_evaluations.w_non_shifted_accumulator * claim_batching_challenge;
    FF new_shifted_evaluation = sumcheck_output.claimed_evaluations.w_shifted_instance +
                                sumcheck_output.claimed_evaluations.w_shifted_accumulator * claim_batching_challenge;

    return MultilinearBatchingProverClaim{ .challenge = sumcheck_output.challenge,
                                           .non_shifted_evaluation = new_non_shifted_evaluation,
                                           .shifted_evaluation = new_shifted_evaluation,
                                           .non_shifted_polynomial = new_non_shifted_polynomial,
                                           .shifted_polynomial = new_shifted_polynomial,
                                           .non_shifted_commitment = new_non_shifted_commitment,
                                           .shifted_commitment = new_shifted_commitment,
                                           .dyadic_size = key->proving_key->circuit_size

    };
}

HonkProof MultilinearBatchingProver::export_proof()
{
    return transcript->export_proof();
}

HonkProof MultilinearBatchingProver::construct_proof()
{
    BB_BENCH_NAME("MultilinearBatchingProver::construct_proof");

    // Add circuit size public input size and public inputs to transcript.
    execute_commitments_round();

    // Fiat-Shamir: challenges and evaluations
    execute_challenges_and_evaluations_round();
    // Fiat-Shamir: alpha
    // Run sumcheck subprotocol.
    execute_relation_check_rounds();

    vinfo("MultilinearBatchingProver:: Computed batching proof");
    return export_proof();
}

} // namespace bb
