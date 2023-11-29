#include "protogalaxy_verifier.hpp"
#include "barretenberg/proof_system/library/grand_product_delta.hpp"
namespace proof_system::honk {

template <class VerifierInstances>
void ProtoGalaxyVerifier_<VerifierInstances>::prepare_for_folding(std::vector<uint8_t> fold_data)
{
    transcript = BaseTranscript<FF>{ fold_data };
    auto index = 0;
    for (auto it = instances.begin(); it != instances.end(); it++, index++) {
        auto inst = *it;
        auto domain_separator = std::to_string(index);
        inst->is_accumulator = transcript.template receive_from_prover<uint32_t>(domain_separator + "is_accumulator");

        inst->instance_size = transcript.template receive_from_prover<uint32_t>(domain_separator + "_instance_size");
        inst->log_instance_size = static_cast<size_t>(numeric::get_msb(inst->instance_size));
        inst->public_input_size =
            transcript.template receive_from_prover<uint32_t>(domain_separator + "_public_input_size");

        for (size_t i = 0; i < inst->public_input_size; ++i) {
            auto public_input_i =
                transcript.template receive_from_prover<FF>(domain_separator + "_public_input_" + std::to_string(i));
            inst->public_inputs.emplace_back(public_input_i);
        }

        if (static_cast<bool>(inst->is_accumulator)) {
            auto eta = transcript.template receive_from_prover<FF>(domain_separator + "_eta");
            auto beta = transcript.template receive_from_prover<FF>(domain_separator + "_beta");
            auto gamma = transcript.template receive_from_prover<FF>(domain_separator + "_gamma");
            auto public_input_delta =
                transcript.template receive_from_prover<FF>(domain_separator + "_public_input_delta");
            auto lookup_grand_product_delta =
                transcript.template receive_from_prover<FF>(domain_separator + "_lookup_grand_product_delta");
            inst->relation_parameters =
                RelationParameters<FF>{ eta, beta, gamma, public_input_delta, lookup_grand_product_delta };
            inst->alpha = transcript.template receive_from_prover<FF>(domain_separator + "_alpha");

            inst->folding_parameters.target_sum =
                transcript.template receive_from_prover<FF>(domain_separator + "_target_sum");

            inst->folding_parameters.gate_challenges = std::vector<FF>(inst->log_instance_size);
            for (size_t idx = 0; idx < inst->log_instance_size; idx++) {
                inst->folding_parameters.gate_challenges[idx] = transcript.template receive_from_prover<FF>(
                    domain_separator + "_gate_challenge_" + std::to_string(idx));
            }
        } else {

            auto [eta, beta, gamma] = transcript.get_challenges(
                domain_separator + "_eta", domain_separator + "_beta", domain_separator + "_gamma");
            const FF public_input_delta = compute_public_input_delta<Flavor>(
                inst->public_inputs, beta, gamma, inst->instance_size, inst->pub_inputs_offset);
            const FF lookup_grand_product_delta =
                compute_lookup_grand_product_delta<FF>(beta, gamma, inst->instance_size);
            inst->relation_parameters =
                RelationParameters<FF>{ eta, beta, gamma, public_input_delta, lookup_grand_product_delta };
            inst->alpha = transcript.get_challenge(domain_separator + "_alpha");
        }

        inst->verification_key = std::make_shared<VerificationKey>(inst->instance_size, inst->public_input_size);
        auto vk_view = inst->verification_key->pointer_view();
        auto labels = typename Flavor::CommitmentLabels().get_precomputed();
        for (size_t idx = 0; idx < labels.size(); idx++) {
            (*vk_view[idx]) = transcript.template receive_from_prover<Commitment>(domain_separator + "_" + labels[idx]);
        }
    }
}

template <class VerifierInstances>
bool ProtoGalaxyVerifier_<VerifierInstances>::verify_folding_proof(std::vector<uint8_t> fold_data)
{
    prepare_for_folding(fold_data);

    auto delta = transcript.get_challenge("delta");
    auto accumulator = get_accumulator();
    auto deltas = compute_round_challenge_pows(accumulator->log_instance_size, delta);

    std::vector<FF> perturbator_coeffs(accumulator->log_instance_size + 1);
    for (size_t idx = 0; idx <= accumulator->log_instance_size; idx++) {
        perturbator_coeffs[idx] = transcript.template receive_from_prover<FF>("perturbator_" + std::to_string(idx));
    }
    assert(perturbator_coeffs[0] == accumulator->folding_parameters.target_sum);
    auto perturbator = Polynomial<FF>(perturbator_coeffs);
    auto perturbator_challenge = transcript.get_challenge("perturbator_challenge");
    auto perturbator_at_challenge = perturbator.evaluate(perturbator_challenge);

    // Thed degree of K(X) is dk - k - 1 = k(d - 1) - 1. Hence we need  k(d - 1) evaluations to represent it.
    std::array<FF, VerifierInstances::BATCHED_EXTENDED_LENGTH - VerifierInstances::NUM> combiner_quotient_evals;
    for (size_t idx = 0; idx < VerifierInstances::BATCHED_EXTENDED_LENGTH - VerifierInstances::NUM; idx++) {
        combiner_quotient_evals[idx] = transcript.template receive_from_prover<FF>(
            "combiner_quotient_" + std::to_string(idx + VerifierInstances::NUM));
    }
    Univariate<FF, VerifierInstances::BATCHED_EXTENDED_LENGTH, VerifierInstances::NUM> combiner_quotient(
        combiner_quotient_evals);

    auto combiner_challenge = transcript.get_challenge("combiner_quotient_challenge");
    auto combiner_quotient_at_challenge = combiner_quotient.evaluate(combiner_challenge);

    auto vanishing_polynomial_at_challenge = combiner_challenge * (combiner_challenge - FF(1));
    auto lagranges = std::vector<FF>{ FF(1) - combiner_challenge, combiner_challenge };

    auto expected_next_target_sum =
        perturbator_at_challenge * lagranges[0] + vanishing_polynomial_at_challenge * combiner_quotient_at_challenge;
    auto next_target_sum = transcript.template receive_from_prover<FF>("next_target_sum");
    bool verified = (expected_next_target_sum == next_target_sum);

    auto expected_betas_star =
        update_gate_challenges(perturbator_challenge, accumulator->folding_parameters.gate_challenges, deltas);
    for (size_t idx = 0; idx < accumulator->log_instance_size; idx++) {
        auto beta_star = transcript.template receive_from_prover<FF>("next_gate_challenge_" + std::to_string(idx));
        verified = verified & (expected_betas_star[idx] == beta_star);
    }

    std::vector<FF> folded_public_inputs(instances[0]->public_inputs.size());
    auto folded_alpha = FF(0);
    auto folded_parameters = proof_system::RelationParameters<FF>{};
    for (size_t inst_idx = 0; inst_idx < VerifierInstances::NUM; inst_idx++) {
        auto instance = instances[inst_idx];
        auto inst_public_inputs = instance->public_inputs;
        for (size_t el_idx = 0; el_idx < inst_public_inputs.size(); el_idx++) {
            folded_public_inputs[el_idx] += inst_public_inputs[el_idx] * lagranges[inst_idx];
        }
        folded_alpha += instance->alpha * lagranges[inst_idx];
        folded_parameters.eta += instance->relation_parameters.eta * lagranges[inst_idx];
        folded_parameters.beta += instance->relation_parameters.beta * lagranges[inst_idx];
        folded_parameters.gamma += instance->relation_parameters.gamma * lagranges[inst_idx];
        folded_parameters.public_input_delta += instance->relation_parameters.public_input_delta * lagranges[inst_idx];
        folded_parameters.lookup_grand_product_delta +=
            instance->relation_parameters.lookup_grand_product_delta * lagranges[inst_idx];
    }

    for (size_t idx = 0; idx < folded_public_inputs.size(); idx++) {
        auto public_input = transcript.template receive_from_prover<FF>("next_public_input" + std::to_string(idx));
        verified = verified & (public_input == folded_public_inputs[idx]);
    }

    auto next_alpha = transcript.template receive_from_prover<FF>("next_alpha");
    verified = verified & (next_alpha == folded_alpha);

    auto next_eta = transcript.template receive_from_prover<FF>("next_eta");
    info(next_eta);
    info(folded_parameters.eta);
    verified = verified & (next_eta == folded_parameters.eta);
    auto next_beta = transcript.template receive_from_prover<FF>("next_beta");
    info(next_beta);
    info(folded_parameters.beta);
    verified = verified & (next_beta == folded_parameters.beta);
    auto next_gamma = transcript.template receive_from_prover<FF>("next_gamma");
    verified = verified & (next_gamma == folded_parameters.gamma);
    info(next_gamma);
    info(folded_parameters.gamma);
    auto next_public_input_delta = transcript.template receive_from_prover<FF>("next_public_input_delta");
    info(next_public_input_delta);
    info(folded_parameters.public_input_delta);
    verified = verified & (next_public_input_delta == folded_parameters.public_input_delta);
    auto next_lookup_grand_product_delta =
        transcript.template receive_from_prover<FF>("next_lookup_grand_product_delta");
    verified = verified & (next_lookup_grand_product_delta == folded_parameters.lookup_grand_product_delta);
    info(next_lookup_grand_product_delta);
    info(folded_parameters.lookup_grand_product_delta);
    info(verified);
    auto acc_vk = std::make_shared<VerificationKey>(instances[0]->instance_size, instances[0]->public_input_size);
    auto acc_vk_view = acc_vk->pointer_view();
    for (size_t inst_idx = 0; inst_idx < VerifierInstances::NUM; inst_idx++) {
        auto inst_vk_view = instances[inst_idx]->verification_key->pointer_view();
        for (size_t idx = 0; idx < inst_vk_view.size(); idx++) {
            (*acc_vk_view[idx]) = (*acc_vk_view[idx]) + (*inst_vk_view[idx]) * lagranges[inst_idx];
        }
    }

    auto labels = typename Flavor::CommitmentLabels().get_precomputed();
    for (size_t idx = 0; idx < labels.size(); idx++) {
        auto vk = transcript.template receive_from_prover<Commitment>("next" + labels[idx]);
        verified = verified & (vk == (*acc_vk_view[idx]));
    }

    return verified;
}

template class ProtoGalaxyVerifier_<VerifierInstances_<honk::flavor::Ultra, 2>>;
// template class ProtoGalaxyVerifier_<VerifierInstances_<honk::flavor::GoblinUltra, 2>>;
} // namespace proof_system::honk