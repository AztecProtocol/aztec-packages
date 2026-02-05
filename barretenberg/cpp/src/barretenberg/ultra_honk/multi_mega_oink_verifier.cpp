// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/ultra_honk/multi_mega_oink_verifier.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"

namespace bb {

void MultiMegaOinkVerifier::verify()
{
    // Execute the Verifier rounds
    execute_preamble_round();
    // Receive Round 1 interleaved commitments (W₁ - W₅)
    execute_wire_commitments_round();
    // Receive Round 2 interleaved commitments (W₆, W₇)
    execute_sorted_list_accumulator_round();
    // Receive Round 3 interleaved commitment (W₈)
    execute_log_derivative_inverse_round();
    // Receive Round 4 interleaved commitment (W₉)
    execute_grand_product_computation_round();

    verifier_instance->interleaved_commitments = interleaved_comms;
    verifier_instance->relation_parameters = relation_parameters;
    verifier_instance->alpha = generate_alpha_round();
}

void MultiMegaOinkVerifier::execute_preamble_round()
{
    auto vk = verifier_instance->get_vk();

    FF vk_hash = vk->hash_with_origin_tagging(*transcript);
    transcript->add_to_hash_buffer(domain_separator + "vk_hash", vk_hash);
    vinfo("vk hash in MultiMegaOink verifier: ", vk_hash);

    BB_ASSERT_EQ(verifier_instance->vk_and_hash->hash, vk_hash, "Native MultiMega Verifier: VK Hash Mismatch");
    BB_ASSERT_EQ(num_public_inputs,
                 static_cast<size_t>(vk->num_public_inputs),
                 "MultiMegaOinkVerifier: num_public_inputs mismatch with VK");

    std::vector<FF> public_inputs;
    for (size_t i = 0; i < num_public_inputs; ++i) {
        auto public_input_i =
            transcript->template receive_from_prover<FF>(domain_separator + "public_input_" + std::to_string(i));
        public_inputs.emplace_back(public_input_i);
    }
    verifier_instance->public_inputs = std::move(public_inputs);
}

/**
 * @brief Receive Round 1 interleaved commitments.
 *
 * Round 1 (before eta) - 5 interleaved commits:
 *   W₁ (shiftable):   [w_l, w_r, w_o, ZERO]
 *   W₂ (unshiftable): [ecc_op_wire_1, ecc_op_wire_2, ecc_op_wire_3, ecc_op_wire_4]
 *   W₃ (unshiftable): [calldata, calldata_read_counts, calldata_read_tags, secondary_calldata]
 *   W₄ (unshiftable): [secondary_calldata_read_counts, secondary_calldata_read_tags, return_data,
 * return_data_read_counts] W₅ (unshiftable): [return_data_read_tags, ZERO, ZERO, ZERO]
 */
void MultiMegaOinkVerifier::execute_wire_commitments_round()
{
    // Receive W₁: [w_l, w_r, w_o, ZERO]
    interleaved_comms.interleaved_wires =
        transcript->template receive_from_prover<Commitment>(domain_separator + interleaved_labels.interleaved_wires);

    // Receive W₂: [ecc_op_wire_1, ecc_op_wire_2, ecc_op_wire_3, ecc_op_wire_4]
    interleaved_comms.interleaved_ecc_op_wires = transcript->template receive_from_prover<Commitment>(
        domain_separator + interleaved_labels.interleaved_ecc_op_wires);

    // Receive W₃: [calldata, calldata_read_counts, calldata_read_tags, secondary_calldata]
    interleaved_comms.interleaved_databus_1 = transcript->template receive_from_prover<Commitment>(
        domain_separator + interleaved_labels.interleaved_databus_1);

    // Receive W₄: [secondary_calldata_read_counts, secondary_calldata_read_tags, return_data, return_data_read_counts]
    interleaved_comms.interleaved_databus_2 = transcript->template receive_from_prover<Commitment>(
        domain_separator + interleaved_labels.interleaved_databus_2);

    // Receive W₅: [return_data_read_tags, ZERO, ZERO, ZERO]
    interleaved_comms.interleaved_databus_3 = transcript->template receive_from_prover<Commitment>(
        domain_separator + interleaved_labels.interleaved_databus_3);
}

/**
 * @brief Receive Round 2 interleaved commitments.
 *
 * Round 2 (after eta) - 2 interleaved commits:
 *   W₆ (shiftable):   [w_4, ZERO, ZERO, ZERO]
 *   W₇ (unshiftable): [lookup_read_counts, lookup_read_tags, ZERO, ZERO]
 */
void MultiMegaOinkVerifier::execute_sorted_list_accumulator_round()
{
    // Get eta challenge and compute powers (eta, eta², eta³)
    relation_parameters.compute_eta_powers(transcript->template get_challenge<FF>("eta"));

    // Receive W₆: [w_4, ZERO, ZERO, ZERO]
    interleaved_comms.interleaved_w_4 =
        transcript->template receive_from_prover<Commitment>(domain_separator + interleaved_labels.interleaved_w_4);

    // Receive W₇: [lookup_read_counts, lookup_read_tags, ZERO, ZERO]
    interleaved_comms.interleaved_lookup =
        transcript->template receive_from_prover<Commitment>(domain_separator + interleaved_labels.interleaved_lookup);
}

/**
 * @brief Receive Round 3 interleaved commitment.
 *
 * Round 3 (after beta/gamma) - 1 interleaved commit:
 *   W₈ (unshiftable): [lookup_inverses, calldata_inverses, secondary_calldata_inverses, return_data_inverses]
 */
void MultiMegaOinkVerifier::execute_log_derivative_inverse_round()
{
    auto [beta, gamma] = transcript->template get_challenges<FF>(
        std::array<std::string, 2>{ domain_separator + "beta", domain_separator + "gamma" });
    relation_parameters.compute_beta_powers(beta);
    relation_parameters.gamma = gamma;

    // Receive W₈: [lookup_inverses, calldata_inverses, secondary_calldata_inverses, return_data_inverses]
    interleaved_comms.interleaved_inverses = transcript->template receive_from_prover<Commitment>(
        domain_separator + interleaved_labels.interleaved_inverses);
}

/**
 * @brief Receive Round 4 interleaved commitment.
 *
 * Round 4 - 1 interleaved commit:
 *   W₉ (shiftable): [z_perm, ZERO, ZERO, ZERO]
 */
void MultiMegaOinkVerifier::execute_grand_product_computation_round()
{
    auto vk = verifier_instance->get_vk();

    const FF public_input_delta = compute_public_input_delta<Flavor>(
        verifier_instance->public_inputs, relation_parameters.beta, relation_parameters.gamma, vk->pub_inputs_offset);

    relation_parameters.public_input_delta = public_input_delta;

    // Receive W₉: [z_perm, ZERO, ZERO, ZERO]
    interleaved_comms.interleaved_z_perm =
        transcript->template receive_from_prover<Commitment>(domain_separator + interleaved_labels.interleaved_z_perm);
}

MultiMegaOinkVerifier::SubrelationSeparator MultiMegaOinkVerifier::generate_alpha_round()
{
    // Get the single alpha challenge for sumcheck computation
    // Powers of this challenge will be used to batch subrelations
    return transcript->template get_challenge<FF>(domain_separator + "alpha");
}

} // namespace bb
