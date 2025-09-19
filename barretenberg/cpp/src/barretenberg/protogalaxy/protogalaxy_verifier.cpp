// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "protogalaxy_verifier.hpp"
#include "barretenberg/commitment_schemes/utils/batch_mul_native.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/protogalaxy/prover_verifier_shared.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"

namespace bb {

template <class VerifierInstances>
void ProtogalaxyVerifier_<VerifierInstances>::run_oink_verifier_on_each_incomplete_instance(
    const std::vector<FF>& proof)
{
    transcript->load_proof(proof);
    auto inst = insts_to_fold[0];
    auto domain_separator = std::to_string(0);
    if (!inst->is_complete) {
        OinkVerifier<Flavor> oink_verifier{ inst, transcript, domain_separator + '_' };
        oink_verifier.verify();
        inst->target_sum = 0;
        // Get the gate challenges for sumcheck/combiner computation
        inst->gate_challenges =
            transcript->template get_powers_of_challenge<FF>(domain_separator + "_gate_challenge", CONST_PG_LOG_N);
    }

    inst = insts_to_fold[1];
    domain_separator = std::to_string(1);
    OinkVerifier<Flavor> oink_verifier{ inst, transcript, domain_separator + '_' };
    oink_verifier.verify();
}

template <typename FF, size_t NUM>
std::tuple<FF, std::vector<FF>> compute_vanishing_polynomial_and_lagrange_evaluations(const FF& combiner_challenge)
{
    static_assert(NUM < 5);
    static constexpr FF inverse_two = FF(2).invert();

    std::vector<FF> lagranges(NUM);
    FF vanishing_polynomial_at_challenge;
    if constexpr (NUM == 2) {
        vanishing_polynomial_at_challenge = combiner_challenge * (combiner_challenge - FF(1));
        lagranges = { FF(1) - combiner_challenge, combiner_challenge };
    } else if constexpr (NUM == 3) {
        vanishing_polynomial_at_challenge =
            combiner_challenge * (combiner_challenge - FF(1)) * (combiner_challenge - FF(2));
        lagranges = { (FF(1) - combiner_challenge) * (FF(2) - combiner_challenge) * inverse_two,
                      combiner_challenge * (FF(2) - combiner_challenge),
                      combiner_challenge * (combiner_challenge - FF(1)) * inverse_two };
    } else if constexpr (NUM == 4) {
        static constexpr FF inverse_six = FF(6).invert();
        vanishing_polynomial_at_challenge = combiner_challenge * (combiner_challenge - FF(1)) *
                                            (combiner_challenge - FF(2)) * (combiner_challenge - FF(3));
        lagranges = { (FF(1) - combiner_challenge) * (FF(2) - combiner_challenge) * (FF(3) - combiner_challenge) *
                          inverse_six,
                      combiner_challenge * (FF(2) - combiner_challenge) * (FF(3) - combiner_challenge) * inverse_two,
                      combiner_challenge * (combiner_challenge - FF(1)) * (FF(3) - combiner_challenge) * inverse_two,
                      combiner_challenge * (combiner_challenge - FF(1)) * (combiner_challenge - FF(2)) * inverse_six };
    }
    return std::make_tuple(vanishing_polynomial_at_challenge, lagranges);
}

template <class VerifierInstances>
std::shared_ptr<typename VerifierInstances::VerifierInstance> ProtogalaxyVerifier_<
    VerifierInstances>::verify_folding_proof(const std::vector<FF>& proof)
{
    static constexpr size_t BATCHED_EXTENDED_LENGTH = VerifierInstances::BATCHED_EXTENDED_LENGTH;
    static constexpr size_t NUM_INSTANCES = VerifierInstances::NUM;
    // The degree of the combiner quotient (K in the paper) is dk - k - 1 = k(d - 1) - 1.
    // Hence we need  k(d - 1) evaluations to represent it.
    static constexpr size_t COMBINER_LENGTH = BATCHED_EXTENDED_LENGTH - NUM_INSTANCES;

    const std::shared_ptr<VerifierInstance>& accumulator = insts_to_fold[0];

    run_oink_verifier_on_each_incomplete_instance(proof);

    // Perturbator round
    const std::vector<FF> deltas = transcript->template get_powers_of_challenge<FF>("delta", CONST_PG_LOG_N);

    std::vector<FF> perturbator_coeffs(CONST_PG_LOG_N + 1, 0);
    for (size_t idx = 1; idx <= CONST_PG_LOG_N; idx++) {
        perturbator_coeffs[idx] = transcript->template receive_from_prover<FF>("perturbator_" + std::to_string(idx));
    }
    const FF perturbator_challenge = transcript->template get_challenge<FF>("perturbator_challenge");

    // Combiner quotient round
    perturbator_coeffs[0] = accumulator->target_sum;
    const Polynomial<FF> perturbator(perturbator_coeffs);
    const FF perturbator_evaluation = perturbator.evaluate(perturbator_challenge);

    std::array<FF, COMBINER_LENGTH> combiner_quotient_evals;
    for (size_t idx = VerifierInstances::NUM; auto& val : combiner_quotient_evals) {
        val = transcript->template receive_from_prover<FF>("combiner_quotient_" + std::to_string(idx++));
    }

    // Folding
    const FF combiner_challenge = transcript->template get_challenge<FF>("combiner_quotient_challenge");
    const Univariate<FF, BATCHED_EXTENDED_LENGTH, NUM_INSTANCES> combiner_quotient(combiner_quotient_evals);
    const FF combiner_quotient_evaluation = combiner_quotient.evaluate(combiner_challenge);

    // Set a constant virtual log circuit size in the accumulator
    const size_t accumulator_log_circuit_size = CONST_PG_LOG_N;
    accumulator->vk->log_circuit_size = accumulator_log_circuit_size;

    // Compute next folding parameters
    const auto [vanishing_polynomial_at_challenge, lagranges] =
        compute_vanishing_polynomial_and_lagrange_evaluations<FF, NUM_INSTANCES>(combiner_challenge);
    accumulator->target_sum =
        perturbator_evaluation * lagranges[0] + vanishing_polynomial_at_challenge * combiner_quotient_evaluation;
    accumulator->gate_challenges = // note: known already in previous round
        update_gate_challenges(perturbator_challenge, accumulator->gate_challenges, deltas);

    // // Fold the commitments
    for (auto [combination, to_combine] :
         zip_view(accumulator->vk->get_all(), insts_to_fold.get_precomputed_commitments())) {
        combination = batch_mul_native(to_combine, lagranges);
    }
    for (auto [combination, to_combine] :
         zip_view(accumulator->witness_commitments.get_all(), insts_to_fold.get_witness_commitments())) {
        combination = batch_mul_native(to_combine, lagranges);
    }

    // Fold the relation parameters
    for (auto [combination, to_combine] : zip_view(accumulator->alphas, insts_to_fold.get_alphas())) {
        combination = linear_combination(to_combine, lagranges);
    }
    for (auto [combination, to_combine] :
         zip_view(accumulator->relation_parameters.get_to_fold(), insts_to_fold.get_relation_parameters())) {
        combination = linear_combination(to_combine, lagranges);
    }

    return accumulator;
}

template class ProtogalaxyVerifier_<VerifierInstances_<MegaFlavor, 2>>;

} // namespace bb
