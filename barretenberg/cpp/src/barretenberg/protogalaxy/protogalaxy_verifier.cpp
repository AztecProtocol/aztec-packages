#include "protogalaxy_verifier.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_delta.hpp"
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
    size_t index = 0;
    auto key = keys_to_fold[0];
    auto domain_separator = std::to_string(index);
    if (!key->is_accumulator) {
        run_oink_verifier_on_one_incomplete_key(key, domain_separator);
        key->target_sum = 0;
        key->gate_challenges = std::vector<FF>(static_cast<size_t>(key->verification_key->log_circuit_size), 0);
    }
    index++;

    for (auto it = keys_to_fold.begin() + 1; it != keys_to_fold.end(); it++, index++) {
        auto key = *it;
        auto domain_separator = std::to_string(index);
        run_oink_verifier_on_one_incomplete_key(key, domain_separator);
    }
}

template <class DeciderVerificationKeys>
std::shared_ptr<typename DeciderVerificationKeys::DeciderVK> ProtogalaxyVerifier_<
    DeciderVerificationKeys>::verify_folding_proof(const std::vector<FF>& proof)
{
    run_oink_verifier_on_each_incomplete_key(proof);

    const FF delta = transcript->template get_challenge<FF>("delta");
    const std::shared_ptr<const DeciderVK>& accumulator = keys_to_fold[0]; // WORKTODO: move

    const size_t log_circuit_size = static_cast<size_t>(accumulator->verification_key->log_circuit_size);
    const std::vector<FF> deltas = compute_round_challenge_pows(log_circuit_size, delta);

    std::vector<FF> perturbator_coeffs(log_circuit_size + 1, 0);
    if (accumulator->is_accumulator) {
        for (size_t idx = 1; idx <= log_circuit_size; idx++) {
            perturbator_coeffs[idx] =
                transcript->template receive_from_prover<FF>("perturbator_" + std::to_string(idx));
        }
    }

    perturbator_coeffs[0] = accumulator->target_sum;
    const Polynomial<FF> perturbator(perturbator_coeffs);
    const FF perturbator_challenge = transcript->template get_challenge<FF>("perturbator_challenge");
    const FF perturbator_evaluation = perturbator.evaluate(perturbator_challenge);

    // The degree of K(X) is dk - k - 1 = k(d - 1) - 1. Hence we need  k(d - 1) evaluations to represent it.
    std::array<FF, DeciderVerificationKeys::BATCHED_EXTENDED_LENGTH - DeciderVerificationKeys::NUM>
        combiner_quotient_evals;
    for (size_t idx = 0; idx < DeciderVerificationKeys::BATCHED_EXTENDED_LENGTH - DeciderVerificationKeys::NUM; idx++) {
        combiner_quotient_evals[idx] = transcript->template receive_from_prover<FF>(
            "combiner_quotient_" + std::to_string(idx + DeciderVerificationKeys::NUM));
    }
    const Univariate<FF, DeciderVerificationKeys::BATCHED_EXTENDED_LENGTH, DeciderVerificationKeys::NUM>
        combiner_quotient(combiner_quotient_evals);
    const FF combiner_challenge = transcript->template get_challenge<FF>("combiner_quotient_challenge");
    const FF combiner_quotient_evaluation = combiner_quotient.evaluate(combiner_challenge);

    constexpr FF inverse_two = FF(2).invert();
    FF vanishing_polynomial_at_challenge;
    std::array<FF, DeciderVerificationKeys::NUM> lagranges;
    if constexpr (DeciderVerificationKeys::NUM == 2) {
        vanishing_polynomial_at_challenge = combiner_challenge * (combiner_challenge - FF(1));
        lagranges = { FF(1) - combiner_challenge, combiner_challenge };
    } else if constexpr (DeciderVerificationKeys::NUM == 3) {
        vanishing_polynomial_at_challenge =
            combiner_challenge * (combiner_challenge - FF(1)) * (combiner_challenge - FF(2));
        lagranges = { (FF(1) - combiner_challenge) * (FF(2) - combiner_challenge) * inverse_two,
                      combiner_challenge * (FF(2) - combiner_challenge),
                      combiner_challenge * (combiner_challenge - FF(1)) * inverse_two };
    } else if constexpr (DeciderVerificationKeys::NUM == 4) {
        constexpr FF inverse_six = FF(6).invert();
        vanishing_polynomial_at_challenge = combiner_challenge * (combiner_challenge - FF(1)) *
                                            (combiner_challenge - FF(2)) * (combiner_challenge - FF(3));
        lagranges = { (FF(1) - combiner_challenge) * (FF(2) - combiner_challenge) * (FF(3) - combiner_challenge) *
                          inverse_six,
                      combiner_challenge * (FF(2) - combiner_challenge) * (FF(3) - combiner_challenge) * inverse_two,
                      combiner_challenge * (combiner_challenge - FF(1)) * (FF(3) - combiner_challenge) * inverse_two,
                      combiner_challenge * (combiner_challenge - FF(1)) * (combiner_challenge - FF(2)) * inverse_six };
    }
    static_assert(DeciderVerificationKeys::NUM < 5);

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/881): bad pattern
    auto next_accumulator = std::make_shared<DeciderVK>();
    next_accumulator->verification_key = std::make_shared<VerificationKey>(*accumulator->verification_key);
    next_accumulator->is_accumulator = true;

    size_t commitment_idx = 0;
    for (auto& expected_vk : next_accumulator->verification_key->get_all()) {
        size_t vk_idx = 0;
        expected_vk = Commitment::infinity();
        for (auto& key : keys_to_fold) {
            expected_vk = expected_vk + key->verification_key->get_all()[commitment_idx] * lagranges[vk_idx];
            vk_idx++;
        }
        commitment_idx++;
    }

    // Compute next folding parameters
    next_accumulator->target_sum =
        perturbator_evaluation * lagranges[0] + vanishing_polynomial_at_challenge * combiner_quotient_evaluation;
    next_accumulator->gate_challenges =
        update_gate_challenges(perturbator_challenge, accumulator->gate_challenges, deltas);

    // Compute ϕ
    auto& acc_witness_commitments = next_accumulator->witness_commitments;
    commitment_idx = 0;
    for (auto& comm : acc_witness_commitments.get_all()) {
        comm = Commitment::infinity();
        size_t vk_idx = 0;
        for (auto& key : keys_to_fold) {
            comm = comm + key->witness_commitments.get_all()[commitment_idx] * lagranges[vk_idx];
            vk_idx++;
        }
        commitment_idx++;
    }

    size_t alpha_idx = 0;
    for (auto& alpha : next_accumulator->alphas) {
        alpha = FF(0);
        size_t vk_idx = 0;
        for (auto& key : keys_to_fold) {
            alpha += key->alphas[alpha_idx] * lagranges[vk_idx];
            vk_idx++;
        }
        alpha_idx++;
    }
    auto& expected_parameters = next_accumulator->relation_parameters;
    for (size_t vk_idx = 0; vk_idx < DeciderVerificationKeys::NUM; vk_idx++) {
        auto& key = keys_to_fold[vk_idx];
        expected_parameters.eta += key->relation_parameters.eta * lagranges[vk_idx];
        expected_parameters.eta_two += key->relation_parameters.eta_two * lagranges[vk_idx];
        expected_parameters.eta_three += key->relation_parameters.eta_three * lagranges[vk_idx];
        expected_parameters.beta += key->relation_parameters.beta * lagranges[vk_idx];
        expected_parameters.gamma += key->relation_parameters.gamma * lagranges[vk_idx];
        expected_parameters.public_input_delta += key->relation_parameters.public_input_delta * lagranges[vk_idx];
        expected_parameters.lookup_grand_product_delta +=
            key->relation_parameters.lookup_grand_product_delta * lagranges[vk_idx];
    }

    return next_accumulator;
}

template class ProtogalaxyVerifier_<DeciderVerificationKeys_<UltraFlavor, 2>>;
template class ProtogalaxyVerifier_<DeciderVerificationKeys_<MegaFlavor, 2>>;

} // namespace bb