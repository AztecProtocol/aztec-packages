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

template <class DeciderVerificationKeys>
void ProtogalaxyVerifier_<DeciderVerificationKeys>::run_oink_verifier_on_one_incomplete_key(
    const std::shared_ptr<DeciderVK>& keys, const std::string& domain_separator)
{
    OinkVerifier<Flavor> oink_verifier{ keys, transcript, domain_separator + '_' };
    oink_verifier.verify();
}

template <class DeciderVerificationKeys>
void ProtogalaxyVerifier_<DeciderVerificationKeys>::run_oink_verifier_on_each_incomplete_key(
    const std::vector<FF>& proof)
{
    transcript = std::make_shared<Transcript>(proof);
    transcript->enable_manifest();
    size_t index = 0;
    auto key = keys_to_fold[0];
    auto domain_separator = std::to_string(index);
    if (!key->is_accumulator) {
        run_oink_verifier_on_one_incomplete_key(key, domain_separator);
        key->target_sum = 0;
        key->gate_challenges = std::vector<FF>(CONST_PG_LOG_N, 0);
    }
    index++;

    for (auto it = keys_to_fold.begin() + 1; it != keys_to_fold.end(); it++, index++) {
        auto key = *it;
        auto domain_separator = std::to_string(index);
        run_oink_verifier_on_one_incomplete_key(key, domain_separator);
    }
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

template <class DeciderVerificationKeys>
std::shared_ptr<typename DeciderVerificationKeys::DeciderVK> ProtogalaxyVerifier_<
    DeciderVerificationKeys>::verify_folding_proof(const std::vector<FF>& proof)
{
    static constexpr size_t BATCHED_EXTENDED_LENGTH = DeciderVerificationKeys::BATCHED_EXTENDED_LENGTH;
    static constexpr size_t NUM_KEYS = DeciderVerificationKeys::NUM;

    const std::shared_ptr<const DeciderVK>& accumulator = keys_to_fold[0];

    run_oink_verifier_on_each_incomplete_key(proof);

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
    const Polynomial<FF> perturbator(perturbator_coeffs);
    const FF perturbator_evaluation = perturbator.evaluate(perturbator_challenge);

    std::array<FF, BATCHED_EXTENDED_LENGTH - NUM_KEYS>
        combiner_quotient_evals; // The degree of the combiner quotient (K in the paper) is dk - k - 1 = k(d - 1) - 1.
                                 // Hence we need  k(d - 1) evaluations to represent it.
    for (size_t idx = DeciderVerificationKeys::NUM; auto& val : combiner_quotient_evals) {
        val = transcript->template receive_from_prover<FF>("combiner_quotient_" + std::to_string(idx++));
    }

    // Folding
    const FF combiner_challenge = transcript->template get_challenge<FF>("combiner_quotient_challenge");
    const Univariate<FF, BATCHED_EXTENDED_LENGTH, NUM_KEYS> combiner_quotient(combiner_quotient_evals);
    const FF combiner_quotient_evaluation = combiner_quotient.evaluate(combiner_challenge);

    auto next_accumulator = std::make_shared<DeciderVK>();
    next_accumulator->verification_key = std::make_shared<VerificationKey>(*accumulator->verification_key);
    next_accumulator->is_accumulator = true;

    // Set the accumulator circuit size data based on the max of the keys being accumulated
    const size_t accumulator_log_circuit_size = keys_to_fold.get_max_log_circuit_size();
    next_accumulator->verification_key->log_circuit_size = accumulator_log_circuit_size;
    next_accumulator->verification_key->circuit_size = 1 << accumulator_log_circuit_size;

    // Compute next folding parameters
    const auto [vanishing_polynomial_at_challenge, lagranges] =
        compute_vanishing_polynomial_and_lagrange_evaluations<FF, NUM_KEYS>(combiner_challenge);
    next_accumulator->target_sum =
        perturbator_evaluation * lagranges[0] + vanishing_polynomial_at_challenge * combiner_quotient_evaluation;
    next_accumulator->gate_challenges = // note: known already in previous round
        update_gate_challenges(perturbator_challenge, accumulator->gate_challenges, deltas);

    // // Fold the commitments
    for (auto [combination, to_combine] :
         zip_view(next_accumulator->verification_key->get_all(), keys_to_fold.get_precomputed_commitments())) {
        combination = batch_mul_native(to_combine, lagranges);
    }
    for (auto [combination, to_combine] :
         zip_view(next_accumulator->witness_commitments.get_all(), keys_to_fold.get_witness_commitments())) {
        combination = batch_mul_native(to_combine, lagranges);
    }

    // Fold the relation parameters
    for (auto [combination, to_combine] : zip_view(next_accumulator->alphas, keys_to_fold.get_alphas())) {
        combination = linear_combination(to_combine, lagranges);
    }
    for (auto [combination, to_combine] :
         zip_view(next_accumulator->relation_parameters.get_to_fold(), keys_to_fold.get_relation_parameters())) {
        combination = linear_combination(to_combine, lagranges);
    }

    // We need to add some commitments to the transcript to ensure the manifest matches with the recursive verifier
    // manifest This is because the recursive verifier uses a trick to convert smaller MSMs into one large one, and so
    // the number of commitments in the manifest is different
    for (size_t i = 0;
         i < keys_to_fold.get_precomputed_commitments().size() + keys_to_fold.get_witness_commitments().size();
         i++) {

        transcript->add_to_hash_buffer("new_accumulator_commitment_" + std::to_string(i), Commitment::one());
    }

    // generate recursive folding challenges to ensure manifest matches with recursive verifier
    // (in recursive verifier we use random challenges to convert Flavor::NUM_FOLDED_ENTITIES muls
    //  into one large multiscalar multiplication)
    std::array<std::string, Flavor::NUM_FOLDED_ENTITIES> args;
    for (size_t idx = 0; idx < Flavor::NUM_FOLDED_ENTITIES; ++idx) {
        args[idx] = "accumulator_combination_challenges" + std::to_string(idx);
    }
    transcript->template get_challenges<FF>(args);

    return next_accumulator;
}

template class ProtogalaxyVerifier_<DeciderVerificationKeys_<MegaFlavor, 2>>;

} // namespace bb
