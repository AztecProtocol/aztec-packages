#include "protogalaxy_verifier.hpp"
#include "barretenberg/honk/utils/grand_product_delta.hpp"
namespace proof_system::honk {
template <class VerifierInstances>
VerifierFoldingResult<typename VerifierInstances::Flavor> ProtoGalaxyVerifier_<
    VerifierInstances>::fold_public_parameters(std::vector<uint8_t> fold_data)
{
    using Flavor = typename VerifierInstances::Flavor;
    using VerificationKey = typename Flavor::VerificationKey;

    transcript = VerifierTranscript<FF>{ fold_data };
    auto index = 0;
    for (auto it = verifier_instances.begin(); it != verifier_instances.end(); it++, index++) {
        auto inst = *it;
        auto domain_separator = std::to_string(index);
        inst->instance_size = transcript.template receive_from_prover<uint32_t>(domain_separator + "_circuit_size");
        inst->public_input_size =
            transcript.template receive_from_prover<uint32_t>(domain_separator + "_public_input_size");
        inst->pub_inputs_offset =
            transcript.template receive_from_prover<uint32_t>(domain_separator + "_pub_inputs_offset");

        for (size_t i = 0; i < inst->public_input_size; ++i) {
            auto public_input_i =
                transcript.template receive_from_prover<FF>(domain_separator + "_public_input_" + std::to_string(i));
            inst->public_inputs.emplace_back(public_input_i);
        }
        auto [eta, beta, gamma] = transcript.get_challenges(
            domain_separator + "_eta", domain_separator + "_beta", domain_separator + "_gamma");
        const FF public_input_delta = compute_public_input_delta<Flavor>(
            inst->public_inputs, beta, gamma, inst->instance_size, inst->pub_inputs_offset);
        const FF lookup_grand_product_delta = compute_lookup_grand_product_delta<FF>(beta, gamma, inst->instance_size);
        inst->relation_parameters =
            RelationParameters<FF>{ eta, beta, gamma, public_input_delta, lookup_grand_product_delta };
    }

    auto [alpha, delta] =
        transcript.get_challenges("alpha", "delta"); // what does verifier do with this alpha which is from plonk paper?
    auto accumulator = get_accumulator();
    auto log_instance_size = static_cast<size_t>(numeric::get_msb(accumulator->instance_size));
    auto deltas = compute_round_challenge_pows(log_instance_size, delta);
    std::vector<FF> perturbator_coeffs(log_instance_size + 1);
    for (size_t idx = 0; idx <= log_instance_size; idx++) {
        perturbator_coeffs[idx] = transcript.template receive_from_prover<FF>("perturbator_" + std::to_string(idx));
    }
    assert(perturbator_coeffs[0] == accumulator->folding_parameters->target_sum);
    auto perturbator = Polynomial<FF>(perturbator_coeffs);
    auto perturbator_challenge = transcript.get_challenge("perturbator_challenge");
    auto perturbator_at_challenge = perturbator.evaluate(perturbator_challenge); // horner
    static_cast<void>(perturbator_at_challenge);
    // get the coefficient of combiner quotient (K(X) polynomial in the paper)
    // + 2 because we need one extra eval to rep a poly of certain degree
    auto combiner_quotient_size = Flavor::MAX_RANDOM_RELATION_LENGTH * (VerifierInstances::NUM - 1) + 2;
    std::vector<FF> combiner_quotient_coeffs(combiner_quotient_size);
    for (size_t idx = 0; idx < combiner_quotient_size; idx++) {
        combiner_quotient_coeffs[idx] =
            transcript.template receive_from_prover<FF>("combiner_quotient_" + std::to_string(idx));
    }
    auto combiner_quotient = Polynomial<FF>(combiner_quotient_coeffs);
    auto combiner_challenge = transcript.get_challenge("combiner_quotient_challenge");
    static_cast<void>(combiner_challenge);

    // fix k = 1 which means k+1 = 2 is a power of two
    auto combiner_quotient_at_challenge = combiner_quotient.evaluate(combiner_challenge); // K(\gamma)
    auto vanishing_polynomial_at_challenge = combiner_challenge * (combiner_challenge - FF(1));
    auto lagrange_0_at_challenge = FF(1) - combiner_challenge;
    auto lagrange_1_at_challenge = combiner_challenge;
    auto updated_target_sum = perturbator_at_challenge * lagrange_0_at_challenge +
                              vanishing_polynomial_at_challenge * combiner_quotient_at_challenge;

    // do public input stuff with goblin (well I guess first without)
    // fold public inputs (field elements) and the commitment in verification key to obtain a new verification key!
    // TODO: extend for more instances;
    auto accumulator_public_inputs = accumulator->public_inputs;
    auto other_public_inputs = verifier_instances[1]->public_inputs;
    std::vector<FF> folded_public_inputs(accumulator->public_input_size);
    // extend either with 0s if the sizes are different
    for (size_t idx = 0; idx < folded_public_inputs.size(); idx++) {
        folded_public_inputs[idx] = lagrange_0_at_challenge * accumulator->public_inputs[idx] +
                                    lagrange_1_at_challenge * other_public_inputs[idx];
    }
    // all verification keys have the same size
    auto folded_verification_key = VerificationKey(accumulator->instance_size, accumulator->public_input_size);

    for (size_t idx = 0; idx < folded_verification_key.size(); idx++) {
        folded_verification_key[idx] = (*accumulator->verification_key)[idx] * lagrange_0_at_challenge +
                                       (*verifier_instances[1]->verification_key)[idx] * lagrange_1_at_challenge;
    }
    VerifierFoldingResult<Flavor> res;
    res.parameters.target_sum = updated_target_sum;
    return res;
}

template class ProtoGalaxyVerifier_<VerifierInstances_<honk::flavor::Ultra, 2>>;
template class ProtoGalaxyVerifier_<VerifierInstances_<honk::flavor::GoblinUltra, 2>>;
} // namespace proof_system::honk