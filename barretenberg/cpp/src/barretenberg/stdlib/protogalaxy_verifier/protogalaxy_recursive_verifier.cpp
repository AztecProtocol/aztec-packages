#include "protogalaxy_recursive_verifier.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_delta.hpp"
#include "barretenberg/protogalaxy/prover_verifier_shared.hpp"
#include "barretenberg/stdlib/honk_verifier/oink_recursive_verifier.hpp"
#include "barretenberg/ultra_honk/decider_keys.hpp"

namespace bb::stdlib::recursion::honk {

template <class DeciderVerificationKeys>
void ProtogalaxyRecursiveVerifier_<DeciderVerificationKeys>::run_oink_verifier_on_one_incomplete_key(
    const std::shared_ptr<DeciderVK>& key, std::string& domain_separator)
{
    OinkRecursiveVerifier_<Flavor> oink_verifier{ builder, key, transcript, domain_separator + '_' };
    oink_verifier.verify();
}

template <class DeciderVerificationKeys>
void ProtogalaxyRecursiveVerifier_<DeciderVerificationKeys>::run_oink_verifier_on_each_incomplete_key(
    const std::vector<FF>& proof)
{
    transcript = std::make_shared<Transcript>(proof);
    size_t index = 0;
    auto key = keys_to_fold[0];
    auto domain_separator = std::to_string(index);
    if (!key->is_accumulator) {
        run_oink_verifier_on_one_incomplete_key(key, domain_separator);
        key->target_sum = 0;
        key->gate_challenges = std::vector<FF>(static_cast<size_t>(CONST_PG_LOG_N), 0);
    }
    index++;

    for (auto it = keys_to_fold.begin() + 1; it != keys_to_fold.end(); it++, index++) {
        auto key = *it;
        auto domain_separator = std::to_string(index);
        run_oink_verifier_on_one_incomplete_key(key, domain_separator);
    }
}

template <class DeciderVerificationKeys>
std::shared_ptr<typename DeciderVerificationKeys::DeciderVK> ProtogalaxyRecursiveVerifier_<
    DeciderVerificationKeys>::verify_folding_proof(const StdlibProof<Builder>& proof)
{
    static constexpr size_t BATCHED_EXTENDED_LENGTH = DeciderVerificationKeys::BATCHED_EXTENDED_LENGTH;
    static constexpr size_t NUM_KEYS = DeciderVerificationKeys::NUM;
    static constexpr size_t COMBINER_LENGTH = BATCHED_EXTENDED_LENGTH - NUM_KEYS;

    run_oink_verifier_on_each_incomplete_key(proof);

    std::shared_ptr<DeciderVK> accumulator = keys_to_fold[0];

    // Perturbator round
    const FF delta = transcript->template get_challenge<FF>("delta");
    const std::vector<FF> deltas = compute_round_challenge_pows(CONST_PG_LOG_N, delta);
    std::vector<FF> perturbator_coeffs(CONST_PG_LOG_N + 1, 0);
    for (size_t idx = 1; idx <= CONST_PG_LOG_N; idx++) {
        perturbator_coeffs[idx] = transcript->template receive_from_prover<FF>("perturbator_" + std::to_string(idx));
    }
    const FF perturbator_challenge = transcript->template get_challenge<FF>("perturbator_challenge");

    // Combiner quotient round
    perturbator_coeffs[0] = accumulator->target_sum;
    const FF perturbator_evaluation = evaluate_perturbator(perturbator_coeffs, perturbator_challenge);

    std::array<FF, COMBINER_LENGTH>
        combiner_quotient_evals; // The degree of the combiner quotient (K in the paper) is dk - k - 1 = k(d - 1) - 1.
                                 // Hence we need  k(d - 1) evaluations to represent it.
    for (size_t idx = 0; idx < COMBINER_LENGTH; idx++) {
        combiner_quotient_evals[idx] =
            transcript->template receive_from_prover<FF>("combiner_quotient_" + std::to_string(idx + NUM_KEYS));
    }

    // Folding
    const FF combiner_challenge = transcript->template get_challenge<FF>("combiner_quotient_challenge");
    const Univariate<FF, BATCHED_EXTENDED_LENGTH, NUM_KEYS> combiner_quotient(combiner_quotient_evals);
    const FF combiner_quotient_at_challenge = combiner_quotient.evaluate(combiner_challenge);

    const FF vanishing_polynomial_at_challenge = combiner_challenge * (combiner_challenge - FF(1));
    const std::vector<FF> lagranges = { FF(1) - combiner_challenge, combiner_challenge };

    // Compute next folding parameters
    accumulator->is_accumulator = true;
    accumulator->target_sum =
        perturbator_evaluation * lagranges[0] + vanishing_polynomial_at_challenge * combiner_quotient_at_challenge;
    accumulator->gate_challenges = update_gate_challenges(perturbator_challenge, accumulator->gate_challenges, deltas);

    // Fold the commitments
    for (auto [combination, to_combine] :
         zip_view(accumulator->verification_key->get_all(), keys_to_fold.get_precomputed_commitments())) {
        combination = Commitment::batch_mul(
            to_combine, lagranges, /*max_num_bits=*/0, /*with_edgecases=*/IsUltraBuilder<Builder>);
    }

    for (auto [combination, to_combine] :
         zip_view(accumulator->witness_commitments.get_all(), keys_to_fold.get_witness_commitments())) {
        combination = Commitment::batch_mul(
            to_combine, lagranges, /*max_num_bits=*/0, /*with_edgecases=*/IsUltraBuilder<Builder>);
    }

    // Fold the relation parameters
    for (auto [combination, to_combine] : zip_view(accumulator->alphas, keys_to_fold.get_alphas())) {
        combination = linear_combination(to_combine, lagranges);
    }
    for (auto [combination, to_combine] :
         zip_view(accumulator->relation_parameters.get_to_fold(), keys_to_fold.get_relation_parameters())) {
        combination = linear_combination(to_combine, lagranges);
    }

    return accumulator;
}

// Instantiate the template with specific flavors and builders
template class ProtogalaxyRecursiveVerifier_<
    RecursiveDeciderVerificationKeys_<MegaRecursiveFlavor_<MegaCircuitBuilder>, 2>>;
template class ProtogalaxyRecursiveVerifier_<
    RecursiveDeciderVerificationKeys_<MegaRecursiveFlavor_<UltraCircuitBuilder>, 2>>;
template class ProtogalaxyRecursiveVerifier_<
    RecursiveDeciderVerificationKeys_<MegaRecursiveFlavor_<CircuitSimulatorBN254>, 2>>;

} // namespace bb::stdlib::recursion::honk
