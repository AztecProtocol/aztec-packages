// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/flavor/mega_avm_flavor.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/honk/prover_instance_inspector.hpp"
#include "barretenberg/relations/databus_lookup_relation.hpp"
#include "barretenberg/relations/logderiv_lookup_relation.hpp"
#include "barretenberg/relations/permutation_relation.hpp"

namespace bb {

/**
 * @brief Commit to witnesses, compute relation parameters, and prepare for Sumcheck.
 */
template <typename Flavor> void OinkProver<Flavor>::prove(bool emit_alpha)
{
    BB_BENCH_NAME("OinkProver::prove");
    // For ZK, we need SRS points up to dyadic_size for tail masking commitments
    const size_t ck_size =
        Flavor::HasZK ? prover_instance->dyadic_size() : prover_instance->polynomials.max_end_index();
    commitment_key = CommitmentKey(ck_size);

    // Register all masked polys upfront (generates random tail values)
    if constexpr (Flavor::HasZK) {
        prover_instance->masking_tail_data.register_all_masked_polys();
    }

    send_vk_hash_and_public_inputs();
    commit_to_masking_poly();
    commit_to_wires();
    commit_to_lookup_counts_and_w4();
    commit_to_logderiv_inverses();
    commit_to_z_perm();
    if (emit_alpha) {
        prover_instance->alpha = transcript->template get_challenge<FF>("alpha");
    }
}

/**
 * @brief Export the Oink proof
 */

template <typename Flavor> typename OinkProver<Flavor>::Proof OinkProver<Flavor>::export_proof()
{
    return transcript->export_proof();
}

/**
 * @brief Hash the verification key and send public inputs to the transcript.
 */
template <typename Flavor> void OinkProver<Flavor>::send_vk_hash_and_public_inputs()
{
    BB_BENCH_NAME("OinkProver::send_vk_hash_and_public_inputs");
    fr vk_hash = honk_vk->hash_with_origin_tagging(*transcript);
    transcript->add_to_hash_buffer("vk_hash", vk_hash);
    vinfo("vk hash in Oink prover: ", vk_hash);

    for (size_t i = 0; i < prover_instance->num_public_inputs(); ++i) {
        auto public_input_i = prover_instance->public_inputs[i];
        transcript->send_to_verifier("public_input_" + std::to_string(i), public_input_i);
    }
}

/**
 * @brief Commit to the wire polynomials (part of the witness), with the exception of the fourth wire, which is
 * only committed to after adding memory records. For Mega, we also commit to the ECC op wires and DataBus columns.
 */
template <typename Flavor> void OinkProver<Flavor>::commit_to_wires()
{
    BB_BENCH_NAME("OinkProver::commit_to_wires");
    auto batch = commitment_key.start_batch();
    auto& tails = prover_instance->masking_tail_data.tails;

    // Commit to the first three wire polynomials; w_4 is deferred until after memory records are added
    batch.add_to_batch(prover_instance->polynomials.w_l, commitment_labels.w_l, &tails.w_l);
    batch.add_to_batch(prover_instance->polynomials.w_r, commitment_labels.w_r, &tails.w_r);
    batch.add_to_batch(prover_instance->polynomials.w_o, commitment_labels.w_o, &tails.w_o);

    if constexpr (IsMegaFlavor<Flavor>) {
        for (auto [polynomial, tail, label] : zip_view(prover_instance->polynomials.get_ecc_op_wires(),
                                                       tails.get_ecc_op_wires(),
                                                       commitment_labels.get_ecc_op_wires())) {
            batch.add_to_batch(polynomial, label, &tail);
        }
        for (auto [polynomial, tail, label] : zip_view(prover_instance->polynomials.get_databus_entities(),
                                                       tails.get_databus_entities(),
                                                       commitment_labels.get_databus_entities())) {
            batch.add_to_batch(polynomial, label, &tail);
        }
    }

    auto computed_commitments = batch.commit_and_send_to_verifier(transcript);
    prover_instance->commitments.w_l = computed_commitments[0];
    prover_instance->commitments.w_r = computed_commitments[1];
    prover_instance->commitments.w_o = computed_commitments[2];

    if constexpr (IsMegaFlavor<Flavor>) {
        size_t commitment_idx = 3;
        for (auto& commitment : prover_instance->commitments.get_ecc_op_wires()) {
            commitment = computed_commitments[commitment_idx++];
        }
        for (auto& commitment : prover_instance->commitments.get_databus_entities()) {
            commitment = computed_commitments[commitment_idx++];
        }
    }
}

/**
 * @brief Compute sorted witness-table accumulator and commit to the resulting polynomials.
 *
 */
template <typename Flavor> void OinkProver<Flavor>::commit_to_lookup_counts_and_w4()
{
    BB_BENCH_NAME("OinkProver::commit_to_lookup_counts_and_w4");
    // Get eta challenge and compute powers (eta, eta², eta³)
    prover_instance->relation_parameters.compute_eta_powers(transcript->template get_challenge<FF>("eta"));

    add_ram_rom_memory_records_to_wire_4(*prover_instance);

    // Commit to lookup argument polynomials and the finalized (i.e. with memory records) fourth wire polynomial
    auto batch = commitment_key.start_batch();
    auto& tails = prover_instance->masking_tail_data.tails;
    batch.add_to_batch(prover_instance->polynomials.lookup_read_counts,
                       commitment_labels.lookup_read_counts,
                       &tails.lookup_read_counts);
    batch.add_to_batch(
        prover_instance->polynomials.lookup_read_tags, commitment_labels.lookup_read_tags, &tails.lookup_read_tags);
    batch.add_to_batch(prover_instance->polynomials.w_4, commitment_labels.w_4, &tails.w_4);
    auto computed_commitments = batch.commit_and_send_to_verifier(transcript);

    prover_instance->commitments.lookup_read_counts = computed_commitments[0];
    prover_instance->commitments.lookup_read_tags = computed_commitments[1];
    prover_instance->commitments.w_4 = computed_commitments[2];
}

/**
 * @brief Compute log derivative inverse polynomial and its commitment, if required
 *
 */
template <typename Flavor> void OinkProver<Flavor>::commit_to_logderiv_inverses()
{
    BB_BENCH_NAME("OinkProver::commit_to_logderiv_inverses");
    auto [beta, gamma] = transcript->template get_challenges<FF>(std::array<std::string, 2>{ "beta", "gamma" });
    prover_instance->relation_parameters.compute_beta_powers(beta);
    prover_instance->relation_parameters.gamma = gamma;

    // Compute the inverses used in log-derivative lookup relations
    compute_logderivative_inverses(*prover_instance);

    auto batch = commitment_key.start_batch();
    auto& tails = prover_instance->masking_tail_data.tails;
    batch.add_to_batch(
        prover_instance->polynomials.lookup_inverses, commitment_labels.lookup_inverses, &tails.lookup_inverses);

    // If Mega, commit to the databus inverse polynomials and send
    if constexpr (IsMegaFlavor<Flavor>) {
        for (auto [polynomial, tail, label] : zip_view(prover_instance->polynomials.get_databus_inverses(),
                                                       tails.get_databus_inverses(),
                                                       commitment_labels.get_databus_inverses())) {
            batch.add_to_batch(polynomial, label, &tail);
        };
    }
    auto computed_commitments = batch.commit_and_send_to_verifier(transcript);

    prover_instance->commitments.lookup_inverses = computed_commitments[0];
    if constexpr (IsMegaFlavor<Flavor>) {
        size_t commitment_idx = 1;
        for (auto& commitment : prover_instance->commitments.get_databus_inverses()) {
            commitment = computed_commitments[commitment_idx];
            commitment_idx++;
        };
    }
}

/**
 * @brief Compute the permutation grand product polynomial and commit to it.
 */
template <typename Flavor> void OinkProver<Flavor>::commit_to_z_perm()
{
    BB_BENCH_NAME("OinkProver::commit_to_z_perm");

    compute_grand_product_polynomial(*prover_instance);

    auto& z_perm = prover_instance->polynomials.z_perm;
    auto batch = commitment_key.start_batch();
    batch.add_to_batch(z_perm, commitment_labels.z_perm, &prover_instance->masking_tail_data.tails.z_perm);
    auto commitments = batch.commit_and_send_to_verifier(transcript);
    prover_instance->commitments.z_perm = commitments[0];
}

template <typename Flavor> void OinkProver<Flavor>::commit_to_masking_poly()
{
    if constexpr (flavor_has_gemini_masking<Flavor>()) {
        // Create a random masking polynomial for Gemini
        const size_t polynomial_size = prover_instance->dyadic_size();
        prover_instance->polynomials.gemini_masking_poly = Polynomial<FF>::random(polynomial_size);

        // Commit to the masking polynomial and send to transcript
        auto masking_commitment = commitment_key.commit(prover_instance->polynomials.gemini_masking_poly);
        transcript->send_to_verifier("Gemini:masking_poly_comm", masking_commitment);
    }
};

/**
 * @brief Add RAM/ROM memory records to the fourth wire polynomial
 *
 * @details This operation must be performed after the first three wires have been
 * committed to, hence the dependence on the `eta` challenge.
 *
 * @tparam Flavor
 * @param instance prover instance whose polynomials, memory records, and eta powers are used
 */
template <typename Flavor> void OinkProver<Flavor>::add_ram_rom_memory_records_to_wire_4(ProverInstance& instance)
{
    // The memory record values are computed at the indicated indices as
    // w4 = w3 * eta^3 + w2 * eta^2 + w1 * eta + read_write_flag;
    // (See the Memory relation for details)
    auto wires = instance.polynomials.get_wires();
    const auto& eta = instance.relation_parameters.eta;
    const auto& eta_two = instance.relation_parameters.eta_two;
    const auto& eta_three = instance.relation_parameters.eta_three;

    // Compute read record values
    for (const auto& gate_idx : instance.memory_read_records) {
        wires[3].at(gate_idx) = wires[2][gate_idx] * eta_three;
        wires[3].at(gate_idx) += wires[1][gate_idx] * eta_two;
        wires[3].at(gate_idx) += wires[0][gate_idx] * eta;
    }

    // Compute write record values
    for (const auto& gate_idx : instance.memory_write_records) {
        wires[3].at(gate_idx) = wires[2][gate_idx] * eta_three;
        wires[3].at(gate_idx) += wires[1][gate_idx] * eta_two;
        wires[3].at(gate_idx) += wires[0][gate_idx] * eta;
        wires[3].at(gate_idx) += 1;
    }
}

/**
 * @brief Compute the inverse polynomials used in the log derivative lookup relations
 *
 * @tparam Flavor
 * @param instance prover instance whose polynomials and relation parameters are used
 */
template <typename Flavor> void OinkProver<Flavor>::compute_logderivative_inverses(ProverInstance& instance)
{
    BB_BENCH_NAME("compute_logderivative_inverses");

    auto& polynomials = instance.polynomials;
    auto& relation_parameters = instance.relation_parameters;
    const size_t circuit_size = instance.dyadic_size();

    // Compute inverses for conventional lookups
    LogDerivLookupRelation<FF>::compute_logderivative_inverse(polynomials, relation_parameters, circuit_size);

    if constexpr (HasDataBus<Flavor>) {
        // Compute inverses for each bus column's log-derivative lookup argument.
        bb::constexpr_for<0, NUM_BUS_COLUMNS, 1>([&]<size_t bus_idx>() {
            DatabusLookupRelation<FF>::template compute_logderivative_inverse<bus_idx>(
                polynomials, relation_parameters, circuit_size);
        });
    }
}

/**
 * @brief Computes public_input_delta and the permutation grand product polynomial
 *
 * @param instance prover instance whose polynomials, public inputs, and relation parameters are used
 */
template <typename Flavor> void OinkProver<Flavor>::compute_grand_product_polynomial(ProverInstance& instance)
{
    auto& relation_parameters = instance.relation_parameters;
    relation_parameters.public_input_delta = compute_public_input_delta<Flavor>(
        instance.public_inputs, relation_parameters.beta, relation_parameters.gamma, instance.pub_inputs_offset());

    // Compute permutation grand product polynomial
    compute_grand_product<Flavor, UltraPermutationRelation<FF>>(
        instance.polynomials, relation_parameters, instance.get_final_active_wire_idx() + 1);
}

template class OinkProver<UltraFlavor>;
template class OinkProver<UltraZKFlavor>;
template class OinkProver<UltraKeccakFlavor>;
#ifdef STARKNET_GARAGA_FLAVORS
template class OinkProver<UltraStarknetFlavor>;
template class OinkProver<UltraStarknetZKFlavor>;
#endif
template class OinkProver<UltraKeccakZKFlavor>;
template class OinkProver<MegaFlavor>;
template class OinkProver<MegaZKFlavor>;
template class OinkProver<MegaAvmFlavor>;

} // namespace bb
