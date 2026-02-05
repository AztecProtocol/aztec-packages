// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/ultra_honk/multi_mega_oink_prover.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/ultra_honk/witness_computation.hpp"

namespace bb {

void MultiMegaOinkProver::prove()
{
    BB_BENCH_NAME("MultiMegaOinkProver::prove");
    if (!prover_instance->commitment_key.initialized()) {
        prover_instance->commitment_key = CommitmentKey(prover_instance->dyadic_size() * BATCH_SIZE);
    }
    // Add circuit size public input size and public inputs to transcript
    execute_preamble_round();
    // Compute interleaved wire commitments (Round 1: W₁ - W₅)
    execute_wire_commitments_round();
    // Compute sorted list accumulator and interleaved commitments (Round 2: W₆, W₇)
    execute_sorted_list_accumulator_round();
    // Fiat-Shamir: beta & gamma
    // Compute log derivative inverses and interleaved commitment (Round 3: W₈)
    execute_log_derivative_inverse_round();
    // Compute grand product and interleaved commitment (Round 4: W₉)
    execute_grand_product_computation_round();

    // Generate relation separator alpha for sumcheck computation
    prover_instance->alpha = generate_alpha_round();

    // Free the commitment key
    prover_instance->commitment_key = CommitmentKey();
}

typename MultiMegaOinkProver::Proof MultiMegaOinkProver::export_proof()
{
    return transcript->export_proof();
}

void MultiMegaOinkProver::execute_preamble_round()
{
    BB_BENCH_NAME("MultiMegaOinkProver::execute_preamble_round");
    FF vk_hash = honk_vk->hash_with_origin_tagging(*transcript);
    transcript->add_to_hash_buffer(domain_separator + "vk_hash", vk_hash);
    vinfo("vk hash in MultiMegaOink prover: ", vk_hash);

    for (size_t i = 0; i < prover_instance->num_public_inputs(); ++i) {
        auto public_input_i = prover_instance->public_inputs[i];
        transcript->send_to_verifier(domain_separator + "public_input_" + std::to_string(i), public_input_i);
    }
}

template <size_t NUM_POLYS>
MultiMegaOinkProver::Commitment MultiMegaOinkProver::commit_interleaved_and_send(
    std::array<PolynomialSpan<const FF>, NUM_POLYS> polynomials, const std::string& label)
{
    static_assert(NUM_POLYS <= BATCH_SIZE, "Cannot batch more than BATCH_SIZE polynomials");

    // Commit using interleaved MSM (pippenger_interleaved handles zero padding for missing slots)
    std::span<const PolynomialSpan<const FF>> span_view(polynomials.data(), NUM_POLYS);
    Commitment commitment = prover_instance->commitment_key.template commit_interleaved<BATCH_SIZE>(span_view);

    // Send to verifier
    transcript->send_to_verifier(domain_separator + label, commitment);

    return commitment;
}

/**
 * @brief Commit to Round 1 polynomials using interleaved commitments.
 *
 * Round 1 (before eta) - 5 interleaved commits:
 *   W₁ (shiftable):   [w_l, w_r, w_o, ZERO]
 *   W₂ (unshiftable): [ecc_op_wire_1, ecc_op_wire_2, ecc_op_wire_3, ecc_op_wire_4]
 *   W₃ (unshiftable): [calldata, calldata_read_counts, calldata_read_tags, secondary_calldata]
 *   W₄ (unshiftable): [secondary_calldata_read_counts, secondary_calldata_read_tags, return_data,
 * return_data_read_counts] W₅ (unshiftable): [return_data_read_tags, ZERO, ZERO, ZERO]
 */
void MultiMegaOinkProver::execute_wire_commitments_round()
{
    BB_BENCH_NAME("MultiMegaOinkProver::execute_wire_commitments_round");

    auto& polys = prover_instance->polynomials;

    // W₁: [w_l, w_r, w_o, ZERO] - shiftable
    {
        std::array<PolynomialSpan<const FF>, 3> wires_batch = { PolynomialSpan<const FF>(polys.w_l),
                                                                PolynomialSpan<const FF>(polys.w_r),
                                                                PolynomialSpan<const FF>(polys.w_o) };
        interleaved_commitments.interleaved_wires =
            commit_interleaved_and_send<3>(wires_batch, interleaved_labels.interleaved_wires);
    }

    // W₂: [ecc_op_wire_1, ecc_op_wire_2, ecc_op_wire_3, ecc_op_wire_4] - unshiftable
    {
        std::array<PolynomialSpan<const FF>, 4> ecc_op_batch = { PolynomialSpan<const FF>(polys.ecc_op_wire_1),
                                                                 PolynomialSpan<const FF>(polys.ecc_op_wire_2),
                                                                 PolynomialSpan<const FF>(polys.ecc_op_wire_3),
                                                                 PolynomialSpan<const FF>(polys.ecc_op_wire_4) };
        interleaved_commitments.interleaved_ecc_op_wires =
            commit_interleaved_and_send<4>(ecc_op_batch, interleaved_labels.interleaved_ecc_op_wires);
    }

    // W₃: [calldata, calldata_read_counts, calldata_read_tags, secondary_calldata] - unshiftable
    {
        std::array<PolynomialSpan<const FF>, 4> databus_1_batch = {
            PolynomialSpan<const FF>(polys.calldata),
            PolynomialSpan<const FF>(polys.calldata_read_counts),
            PolynomialSpan<const FF>(polys.calldata_read_tags),
            PolynomialSpan<const FF>(polys.secondary_calldata)
        };
        interleaved_commitments.interleaved_databus_1 =
            commit_interleaved_and_send<4>(databus_1_batch, interleaved_labels.interleaved_databus_1);
    }

    // W₄: [secondary_calldata_read_counts, secondary_calldata_read_tags, return_data, return_data_read_counts]
    {
        std::array<PolynomialSpan<const FF>, 4> databus_2_batch = {
            PolynomialSpan<const FF>(polys.secondary_calldata_read_counts),
            PolynomialSpan<const FF>(polys.secondary_calldata_read_tags),
            PolynomialSpan<const FF>(polys.return_data),
            PolynomialSpan<const FF>(polys.return_data_read_counts)
        };
        interleaved_commitments.interleaved_databus_2 =
            commit_interleaved_and_send<4>(databus_2_batch, interleaved_labels.interleaved_databus_2);
    }

    // W₅: [return_data_read_tags, ZERO, ZERO, ZERO] - unshiftable
    {
        std::array<PolynomialSpan<const FF>, 1> databus_3_batch = { PolynomialSpan<const FF>(
            polys.return_data_read_tags) };
        interleaved_commitments.interleaved_databus_3 =
            commit_interleaved_and_send<1>(databus_3_batch, interleaved_labels.interleaved_databus_3);
    }

    // Also store individual commitments for compatibility with existing code that expects them
    // (These will be reconstructed from interleaved commitments in the verifier)
}

/**
 * @brief Compute sorted list accumulator and commit to Round 2 polynomials.
 *
 * Round 2 (after eta) - 2 interleaved commits:
 *   W₆ (shiftable):   [w_4, ZERO, ZERO, ZERO]
 *   W₇ (unshiftable): [lookup_read_counts, lookup_read_tags, ZERO, ZERO]
 */
void MultiMegaOinkProver::execute_sorted_list_accumulator_round()
{
    BB_BENCH_NAME("MultiMegaOinkProver::execute_sorted_list_accumulator_round");

    // Get eta challenge and compute powers (eta, eta², eta³)
    prover_instance->relation_parameters.compute_eta_powers(transcript->template get_challenge<FF>("eta"));

    WitnessComputation<Flavor>::add_ram_rom_memory_records_to_wire_4(prover_instance->polynomials,
                                                                     prover_instance->memory_read_records,
                                                                     prover_instance->memory_write_records,
                                                                     prover_instance->relation_parameters.eta,
                                                                     prover_instance->relation_parameters.eta_two,
                                                                     prover_instance->relation_parameters.eta_three);

    auto& polys = prover_instance->polynomials;

    // W₆: [w_4, ZERO, ZERO, ZERO] - shiftable
    {
        std::array<PolynomialSpan<const FF>, 1> w4_batch = { PolynomialSpan<const FF>(polys.w_4) };
        interleaved_commitments.interleaved_w_4 =
            commit_interleaved_and_send<1>(w4_batch, interleaved_labels.interleaved_w_4);
    }

    // W₇: [lookup_read_counts, lookup_read_tags, ZERO, ZERO] - unshiftable
    {
        std::array<PolynomialSpan<const FF>, 2> lookup_batch = { PolynomialSpan<const FF>(polys.lookup_read_counts),
                                                                 PolynomialSpan<const FF>(polys.lookup_read_tags) };
        interleaved_commitments.interleaved_lookup =
            commit_interleaved_and_send<2>(lookup_batch, interleaved_labels.interleaved_lookup);
    }
}

/**
 * @brief Compute log derivative inverse polynomials and commit to Round 3.
 *
 * Round 3 (after beta/gamma) - 1 interleaved commit:
 *   W₈ (unshiftable): [lookup_inverses, calldata_inverses, secondary_calldata_inverses, return_data_inverses]
 */
void MultiMegaOinkProver::execute_log_derivative_inverse_round()
{
    BB_BENCH_NAME("MultiMegaOinkProver::execute_log_derivative_inverse_round");

    auto [beta, gamma] = transcript->template get_challenges<FF>(
        std::array<std::string, 2>{ domain_separator + "beta", domain_separator + "gamma" });
    prover_instance->relation_parameters.compute_beta_powers(beta);
    prover_instance->relation_parameters.gamma = gamma;

    // Compute the inverses used in log-derivative lookup relations
    WitnessComputation<Flavor>::compute_logderivative_inverses(
        prover_instance->polynomials, prover_instance->dyadic_size(), prover_instance->relation_parameters);

    auto& polys = prover_instance->polynomials;

    // W₈: [lookup_inverses, calldata_inverses, secondary_calldata_inverses, return_data_inverses] - unshiftable
    {
        std::array<PolynomialSpan<const FF>, 4> inverses_batch = {
            PolynomialSpan<const FF>(polys.lookup_inverses),
            PolynomialSpan<const FF>(polys.calldata_inverses),
            PolynomialSpan<const FF>(polys.secondary_calldata_inverses),
            PolynomialSpan<const FF>(polys.return_data_inverses)
        };
        interleaved_commitments.interleaved_inverses =
            commit_interleaved_and_send<4>(inverses_batch, interleaved_labels.interleaved_inverses);
    }
}

/**
 * @brief Compute permutation grand product polynomial and commit to Round 4.
 *
 * Round 4 - 1 interleaved commit:
 *   W₉ (shiftable): [z_perm, ZERO, ZERO, ZERO]
 */
void MultiMegaOinkProver::execute_grand_product_computation_round()
{
    BB_BENCH_NAME("MultiMegaOinkProver::execute_grand_product_computation_round");

    // Compute the permutation grand product polynomial
    WitnessComputation<Flavor>::compute_grand_product_polynomial(prover_instance->polynomials,
                                                                 prover_instance->public_inputs,
                                                                 prover_instance->pub_inputs_offset(),
                                                                 prover_instance->relation_parameters,
                                                                 prover_instance->get_final_active_wire_idx() + 1);

    auto& polys = prover_instance->polynomials;

    // W₉: [z_perm, ZERO, ZERO, ZERO] - shiftable
    {
        std::array<PolynomialSpan<const FF>, 1> z_perm_batch = { PolynomialSpan<const FF>(polys.z_perm) };
        interleaved_commitments.interleaved_z_perm =
            commit_interleaved_and_send<1>(z_perm_batch, interleaved_labels.interleaved_z_perm);
    }
}

typename MultiMegaOinkProver::SubrelationSeparator MultiMegaOinkProver::generate_alpha_round()
{
    BB_BENCH_NAME("MultiMegaOinkProver::generate_alpha_round");

    // Get the single alpha challenge for sumcheck computation
    // Powers of this challenge will be used to batch subrelations
    return transcript->template get_challenge<FF>(domain_separator + "alpha");
}

// Explicit template instantiations
template MultiMegaOinkProver::Commitment MultiMegaOinkProver::commit_interleaved_and_send<1>(
    std::array<PolynomialSpan<const FF>, 1>, const std::string&);
template MultiMegaOinkProver::Commitment MultiMegaOinkProver::commit_interleaved_and_send<2>(
    std::array<PolynomialSpan<const FF>, 2>, const std::string&);
template MultiMegaOinkProver::Commitment MultiMegaOinkProver::commit_interleaved_and_send<3>(
    std::array<PolynomialSpan<const FF>, 3>, const std::string&);
template MultiMegaOinkProver::Commitment MultiMegaOinkProver::commit_interleaved_and_send<4>(
    std::array<PolynomialSpan<const FF>, 4>, const std::string&);

} // namespace bb
