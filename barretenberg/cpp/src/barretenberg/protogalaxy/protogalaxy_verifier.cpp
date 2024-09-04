#include "protogalaxy_verifier.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_delta.hpp"
#include "barretenberg/protogalaxy/prover_verifier_shared.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"

namespace bb {

template <class DeciderVerificationKeys>
void ProtogalaxyVerifier_<DeciderVerificationKeys>::receive_and_finalise_instance(const std::shared_ptr<Instance>& inst,
                                                                                  const std::string& domain_separator)
{
    OinkVerifier<Flavor> oink_verifier{ inst, transcript, domain_separator + '_' };
    oink_verifier.verify();
}

template <class DeciderVerificationKeys>
void ProtogalaxyVerifier_<DeciderVerificationKeys>::prepare_for_folding(const std::vector<FF>& fold_data)
{
    transcript = std::make_shared<Transcript>(fold_data);
    auto index = 0;
    auto inst = instances[0];
    auto domain_separator = std::to_string(index);
    if (!inst->is_accumulator) {
        receive_and_finalise_instance(inst, domain_separator);
        inst->target_sum = 0;
        inst->gate_challenges = std::vector<FF>(static_cast<size_t>(inst->verification_key->log_circuit_size), 0);
    }
    index++;

    for (auto it = instances.begin() + 1; it != instances.end(); it++, index++) {
        auto inst = *it;
        auto domain_separator = std::to_string(index);
        receive_and_finalise_instance(inst, domain_separator);
    }
}

template <class DeciderVerificationKeys>
std::shared_ptr<typename DeciderVerificationKeys::Instance> ProtogalaxyVerifier_<
    DeciderVerificationKeys>::verify_folding_proof(const std::vector<FF>& fold_data)
{
    prepare_for_folding(fold_data);

    auto delta = transcript->template get_challenge<FF>("delta");
    auto accumulator = get_accumulator();
    auto deltas =
        compute_round_challenge_pows(static_cast<size_t>(accumulator->verification_key->log_circuit_size), delta);

    std::vector<FF> perturbator_coeffs(static_cast<size_t>(accumulator->verification_key->log_circuit_size) + 1, 0);
    if (accumulator->is_accumulator) {
        for (size_t idx = 1; idx <= static_cast<size_t>(accumulator->verification_key->log_circuit_size); idx++) {
            perturbator_coeffs[idx] =
                transcript->template receive_from_prover<FF>("perturbator_" + std::to_string(idx));
        }
    }

    perturbator_coeffs[0] = accumulator->target_sum;
    Polynomial<FF> perturbator(perturbator_coeffs);
    FF perturbator_challenge = transcript->template get_challenge<FF>("perturbator_challenge");
    auto perturbator_at_challenge = perturbator.evaluate(perturbator_challenge);

    // The degree of K(X) is dk - k - 1 = k(d - 1) - 1. Hence we need  k(d - 1) evaluations to represent it.
    std::array<FF, DeciderVerificationKeys::BATCHED_EXTENDED_LENGTH - DeciderVerificationKeys::NUM>
        combiner_quotient_evals;
    for (size_t idx = 0; idx < DeciderVerificationKeys::BATCHED_EXTENDED_LENGTH - DeciderVerificationKeys::NUM; idx++) {
        combiner_quotient_evals[idx] = transcript->template receive_from_prover<FF>(
            "combiner_quotient_" + std::to_string(idx + DeciderVerificationKeys::NUM));
    }
    Univariate<FF, DeciderVerificationKeys::BATCHED_EXTENDED_LENGTH, DeciderVerificationKeys::NUM> combiner_quotient(
        combiner_quotient_evals);
    FF combiner_challenge = transcript->template get_challenge<FF>("combiner_quotient_challenge");
    auto combiner_quotient_at_challenge = combiner_quotient.evaluate(combiner_challenge);

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
    auto next_accumulator = std::make_shared<Instance>(accumulator->verification_key);
    next_accumulator->verification_key = std::make_shared<VerificationKey>(
        accumulator->verification_key->circuit_size, accumulator->verification_key->num_public_inputs);
    next_accumulator->verification_key->pcs_verification_key = accumulator->verification_key->pcs_verification_key;
    next_accumulator->verification_key->pub_inputs_offset = accumulator->verification_key->pub_inputs_offset;
    next_accumulator->verification_key->contains_recursive_proof =
        accumulator->verification_key->contains_recursive_proof;
    next_accumulator->verification_key->recursive_proof_public_input_indices =
        accumulator->verification_key->recursive_proof_public_input_indices;

    if constexpr (IsGoblinFlavor<Flavor>) { // Databus commitment propagation data
        next_accumulator->verification_key->databus_propagation_data =
            accumulator->verification_key->databus_propagation_data;
    }

    size_t vk_idx = 0;
    for (auto& expected_vk : next_accumulator->verification_key->get_all()) {
        size_t inst = 0;
        expected_vk = Commitment::infinity();
        for (auto& instance : instances) {
            expected_vk = expected_vk + instance->verification_key->get_all()[vk_idx] * lagranges[inst];
            inst++;
        }
        vk_idx++;
    }
    next_accumulator->verification_key->num_public_inputs = accumulator->verification_key->num_public_inputs;
    next_accumulator->public_inputs =
        std::vector<FF>(static_cast<size_t>(next_accumulator->verification_key->num_public_inputs), 0);

    next_accumulator->is_accumulator = true;

    // Compute next folding parameters
    next_accumulator->target_sum =
        perturbator_at_challenge * lagranges[0] + vanishing_polynomial_at_challenge * combiner_quotient_at_challenge;
    next_accumulator->gate_challenges =
        update_gate_challenges(perturbator_challenge, accumulator->gate_challenges, deltas);

    // Compute ϕ
    auto& acc_witness_commitments = next_accumulator->witness_commitments;
    size_t comm_idx = 0;
    for (auto& comm : acc_witness_commitments.get_all()) {
        comm = Commitment::infinity();
        size_t inst = 0;
        for (auto& instance : instances) {
            comm = comm + instance->witness_commitments.get_all()[comm_idx] * lagranges[inst];
            inst++;
        }
        comm_idx++;
    }

    size_t alpha_idx = 0;
    for (auto& alpha : next_accumulator->alphas) {
        alpha = FF(0);
        size_t instance_idx = 0;
        for (auto& instance : instances) {
            alpha += instance->alphas[alpha_idx] * lagranges[instance_idx];
            instance_idx++;
        }
        alpha_idx++;
    }
    auto& expected_parameters = next_accumulator->relation_parameters;
    for (size_t inst_idx = 0; inst_idx < DeciderVerificationKeys::NUM; inst_idx++) {
        auto instance = instances[inst_idx];
        expected_parameters.eta += instance->relation_parameters.eta * lagranges[inst_idx];
        expected_parameters.eta_two += instance->relation_parameters.eta_two * lagranges[inst_idx];
        expected_parameters.eta_three += instance->relation_parameters.eta_three * lagranges[inst_idx];
        expected_parameters.beta += instance->relation_parameters.beta * lagranges[inst_idx];
        expected_parameters.gamma += instance->relation_parameters.gamma * lagranges[inst_idx];
        expected_parameters.public_input_delta +=
            instance->relation_parameters.public_input_delta * lagranges[inst_idx];
        expected_parameters.lookup_grand_product_delta +=
            instance->relation_parameters.lookup_grand_product_delta * lagranges[inst_idx];
    }

    return next_accumulator;
}

template class ProtogalaxyVerifier_<DeciderVerificationKeys_<UltraFlavor, 2>>;
template class ProtogalaxyVerifier_<DeciderVerificationKeys_<MegaFlavor, 2>>;

} // namespace bb