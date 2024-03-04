#include "protogalaxy_verifier.hpp"
#include "barretenberg/proof_system/library/grand_product_delta.hpp"
namespace bb {

template <class VerifierInstances>
void ProtoGalaxyVerifier_<VerifierInstances>::receive_and_finalise_instance(const std::shared_ptr<Instance>& inst,
                                                                            const std::string& domain_separator)
{
    // Get circuit parameters and the public inputs
    inst->instance_size = transcript->template receive_from_prover<uint32_t>(domain_separator + "_instance_size");
    inst->log_instance_size = static_cast<size_t>(numeric::get_msb(inst->instance_size));
    inst->public_input_size =
        transcript->template receive_from_prover<uint32_t>(domain_separator + "_public_input_size");

    for (size_t i = 0; i < inst->public_input_size; ++i) {
        auto public_input_i =
            transcript->template receive_from_prover<FF>(domain_separator + "_public_input_" + std::to_string(i));
        inst->public_inputs.emplace_back(public_input_i);
    }

    inst->pub_inputs_offset =
        transcript->template receive_from_prover<uint32_t>(domain_separator + "_pub_inputs_offset");

    // Get commitments to first three wire polynomials
    auto labels = inst->commitment_labels;
    auto& witness_commitments = inst->witness_commitments;
    witness_commitments.w_l = transcript->template receive_from_prover<Commitment>(domain_separator + "_" + labels.w_l);
    witness_commitments.w_r = transcript->template receive_from_prover<Commitment>(domain_separator + "_" + labels.w_r);
    witness_commitments.w_o = transcript->template receive_from_prover<Commitment>(domain_separator + "_" + labels.w_o);

    if constexpr (IsGoblinFlavor<Flavor>) {
        // Get  commitments to the ECC wire polynomials and databus polynomials
        witness_commitments.ecc_op_wire_1 =
            transcript->template receive_from_prover<Commitment>(domain_separator + "_" + labels.ecc_op_wire_1);
        witness_commitments.ecc_op_wire_2 =
            transcript->template receive_from_prover<Commitment>(domain_separator + "_" + labels.ecc_op_wire_2);
        witness_commitments.ecc_op_wire_3 =
            transcript->template receive_from_prover<Commitment>(domain_separator + "_" + labels.ecc_op_wire_3);
        witness_commitments.ecc_op_wire_4 =
            transcript->template receive_from_prover<Commitment>(domain_separator + "_" + labels.ecc_op_wire_4);
        witness_commitments.calldata =
            transcript->template receive_from_prover<Commitment>(domain_separator + "_" + labels.calldata);
        witness_commitments.calldata_read_counts =
            transcript->template receive_from_prover<Commitment>(domain_separator + "_" + labels.calldata_read_counts);
    }

    // Get challenge for sorted list batching and wire four memory records commitment
    auto eta = transcript->template get_challenge<FF>(domain_separator + "_eta");
    witness_commitments.sorted_accum =
        transcript->template receive_from_prover<Commitment>(domain_separator + "_" + labels.sorted_accum);
    witness_commitments.w_4 = transcript->template receive_from_prover<Commitment>(domain_separator + "_" + labels.w_4);

    // Get permutation challenges and commitment to permutation and lookup grand products
    auto [beta, gamma] =
        transcript->template get_challenges<FF>(domain_separator + "_beta", domain_separator + "_gamma");

    if constexpr (IsGoblinFlavor<Flavor>) {
        // If Goblin (i.e. using DataBus) receive commitments to log-deriv inverses polynomial
        witness_commitments.lookup_inverses = transcript->template receive_from_prover<Commitment>(
            domain_separator + "_" + commitment_labels.lookup_inverses);
    }

    witness_commitments.z_perm =
        transcript->template receive_from_prover<Commitment>(domain_separator + "_" + labels.z_perm);
    witness_commitments.z_lookup =
        transcript->template receive_from_prover<Commitment>(domain_separator + "_" + labels.z_lookup);

    // Compute correction terms for grand products
    const FF public_input_delta = compute_public_input_delta<Flavor>(
        inst->public_inputs, beta, gamma, inst->instance_size, inst->pub_inputs_offset);
    const FF lookup_grand_product_delta = compute_lookup_grand_product_delta<FF>(beta, gamma, inst->instance_size);
    inst->relation_parameters =
        RelationParameters<FF>{ eta, beta, gamma, public_input_delta, lookup_grand_product_delta };

    // Get the relation separation challenges
    for (size_t idx = 0; idx < NUM_SUBRELATIONS - 1; idx++) {
        inst->alphas[idx] = transcript->template get_challenge<FF>(domain_separator + "_alpha_" + std::to_string(idx));
    }
}

// TODO(https://github.com/AztecProtocol/barretenberg/issues/795): The rounds prior to actual verifying are common
// between decider and folding verifier and could be somehow shared so we do not duplicate code so much.
template <class VerifierInstances>
void ProtoGalaxyVerifier_<VerifierInstances>::prepare_for_folding(const std::vector<FF>& fold_data)
{
    transcript = std::make_shared<Transcript>(fold_data);
    auto index = 0;
    auto inst = instances[0];
    auto domain_separator = std::to_string(index);
    if (!inst->is_accumulator) {
        receive_and_finalise_instance(inst, domain_separator);
        inst->target_sum = 0;
        inst->gate_challenges = std::vector<FF>(inst->log_instance_size, 0);
    }
    index++;

    for (auto it = instances.begin() + 1; it != instances.end(); it++, index++) {
        auto inst = *it;
        auto domain_separator = std::to_string(index);
        receive_and_finalise_instance(inst, domain_separator);
    }
}

template <class VerifierInstances>
std::shared_ptr<typename VerifierInstances::Instance> ProtoGalaxyVerifier_<VerifierInstances>::verify_folding_proof(
    const std::vector<FF>& fold_data)
{
    prepare_for_folding(fold_data);

    auto delta = transcript->template get_challenge<FF>("delta");
    auto accumulator = get_accumulator();
    auto deltas = compute_round_challenge_pows(accumulator->log_instance_size, delta);

    std::vector<FF> perturbator_coeffs(accumulator->log_instance_size + 1, 0);
    if (accumulator->is_accumulator) {
        for (size_t idx = 1; idx <= accumulator->log_instance_size; idx++) {
            perturbator_coeffs[idx] =
                transcript->template receive_from_prover<FF>("perturbator_" + std::to_string(idx));
        }
    }

    perturbator_coeffs[0] = accumulator->target_sum;
    auto perturbator = Polynomial<FF>(perturbator_coeffs);
    FF perturbator_challenge = transcript->template get_challenge<FF>("perturbator_challenge");
    auto perturbator_at_challenge = perturbator.evaluate(perturbator_challenge);

    // The degree of K(X) is dk - k - 1 = k(d - 1) - 1. Hence we need  k(d - 1) evaluations to represent it.
    std::array<FF, VerifierInstances::BATCHED_EXTENDED_LENGTH - VerifierInstances::NUM> combiner_quotient_evals;
    for (size_t idx = 0; idx < VerifierInstances::BATCHED_EXTENDED_LENGTH - VerifierInstances::NUM; idx++) {
        combiner_quotient_evals[idx] = transcript->template receive_from_prover<FF>(
            "combiner_quotient_" + std::to_string(idx + VerifierInstances::NUM));
    }
    Univariate<FF, VerifierInstances::BATCHED_EXTENDED_LENGTH, VerifierInstances::NUM> combiner_quotient(
        combiner_quotient_evals);
    FF combiner_challenge = transcript->template get_challenge<FF>("combiner_quotient_challenge");
    auto combiner_quotient_at_challenge = combiner_quotient.evaluate(combiner_challenge);

    auto vanishing_polynomial_at_challenge = combiner_challenge * (combiner_challenge - FF(1));
    auto lagranges = std::vector<FF>{ FF(1) - combiner_challenge, combiner_challenge };

    auto next_accumulator = std::make_shared<Instance>();
    next_accumulator->instance_size = accumulator->instance_size;
    next_accumulator->log_instance_size = accumulator->log_instance_size;
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

    next_accumulator->public_input_size = instances[0]->public_input_size;
    next_accumulator->public_inputs = std::vector<FF>(next_accumulator->public_input_size, 0);
    size_t public_input_idx = 0;
    for (auto& public_input : next_accumulator->public_inputs) {
        size_t inst = 0;
        for (auto& instance : instances) {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/830)
            if (instance->public_inputs.size() >= next_accumulator->public_input_size) {
                public_input += instance->public_inputs[public_input_idx] * lagranges[inst];
                inst++;
            }
        }
        public_input_idx++;
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
    for (size_t inst_idx = 0; inst_idx < VerifierInstances::NUM; inst_idx++) {
        auto instance = instances[inst_idx];
        expected_parameters.eta += instance->relation_parameters.eta * lagranges[inst_idx];
        expected_parameters.beta += instance->relation_parameters.beta * lagranges[inst_idx];
        expected_parameters.gamma += instance->relation_parameters.gamma * lagranges[inst_idx];
        expected_parameters.public_input_delta +=
            instance->relation_parameters.public_input_delta * lagranges[inst_idx];
        expected_parameters.lookup_grand_product_delta +=
            instance->relation_parameters.lookup_grand_product_delta * lagranges[inst_idx];
    }

    next_accumulator->verification_key =
        std::make_shared<VerificationKey>(instances[0]->instance_size, instances[0]->public_input_size);
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

    return next_accumulator;
}

template class ProtoGalaxyVerifier_<VerifierInstances_<UltraFlavor, 2>>;
template class ProtoGalaxyVerifier_<VerifierInstances_<GoblinUltraFlavor, 2>>;
} // namespace bb