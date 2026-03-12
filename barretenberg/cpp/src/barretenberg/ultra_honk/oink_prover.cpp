// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/flavor/mega_avm_flavor.hpp"
#include "barretenberg/flavor/multi_mega_flavor.hpp"
#include "barretenberg/flavor/multi_mega_zk_flavor.hpp"
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
template <typename Flavor> void OinkProver<Flavor>::prove()
{
    BB_BENCH_NAME("OinkProver::prove");
    if (!commitment_key.initialized()) {
        commitment_key = CommitmentKey(prover_instance->dyadic_size() * BATCH_SIZE);
    }
    send_vk_hash_and_public_inputs();
    commit_to_masking_poly();
    commit_to_wires();
    commit_to_lookup_counts_and_w4();
    commit_to_logderiv_inverses();
    commit_to_z_perm();
    prover_instance->alpha = transcript->template get_challenge<FF>("alpha");

    if constexpr (BATCH_SIZE > 1) {
        // Free the commitment key (PCS will create its own)
        commitment_key = CommitmentKey();
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
 *
 * For interleaved flavors (BATCH_SIZE > 1), polynomials are committed in groups using interleaved MSM.
 */
template <typename Flavor> void OinkProver<Flavor>::commit_to_wires()
{
    BB_BENCH_NAME("OinkProver::commit_to_wires");

    if constexpr (BATCH_SIZE > 1) {
        auto& polys = prover_instance->polynomials;

        // W₁: [w_l, w_r, w_o, ZERO] - shiftable
        {
            std::array<PolynomialSpan<const FF>, 3> batch = { PolynomialSpan<const FF>(polys.w_l),
                                                              PolynomialSpan<const FF>(polys.w_r),
                                                              PolynomialSpan<const FF>(polys.w_o) };
            interleaved_commitments.interleaved_wires =
                commit_interleaved_and_send<3>(batch, interleaved_labels.interleaved_wires);
        }

        // W₂: [ecc_op_wire_1..4] - unshiftable
        {
            std::array<PolynomialSpan<const FF>, 4> batch = { PolynomialSpan<const FF>(polys.ecc_op_wire_1),
                                                              PolynomialSpan<const FF>(polys.ecc_op_wire_2),
                                                              PolynomialSpan<const FF>(polys.ecc_op_wire_3),
                                                              PolynomialSpan<const FF>(polys.ecc_op_wire_4) };
            interleaved_commitments.interleaved_ecc_op_wires =
                commit_interleaved_and_send<4>(batch, interleaved_labels.interleaved_ecc_op_wires);
        }

        // Individual ecc_op_wire commits for merge protocol compatibility
        {
            auto& comms = prover_instance->commitments;
            comms.ecc_op_wire_1 = commitment_key.commit(polys.ecc_op_wire_1);
            comms.ecc_op_wire_2 = commitment_key.commit(polys.ecc_op_wire_2);
            comms.ecc_op_wire_3 = commitment_key.commit(polys.ecc_op_wire_3);
            comms.ecc_op_wire_4 = commitment_key.commit(polys.ecc_op_wire_4);
            transcript->send_to_verifier(commitment_labels.ecc_op_wire_1, comms.ecc_op_wire_1);
            transcript->send_to_verifier(commitment_labels.ecc_op_wire_2, comms.ecc_op_wire_2);
            transcript->send_to_verifier(commitment_labels.ecc_op_wire_3, comms.ecc_op_wire_3);
            transcript->send_to_verifier(commitment_labels.ecc_op_wire_4, comms.ecc_op_wire_4);
        }

        // W₃: [calldata, ZERO, ZERO, ZERO]
        {
            std::array<PolynomialSpan<const FF>, 1> batch = { PolynomialSpan<const FF>(polys.calldata) };
            interleaved_commitments.interleaved_calldata =
                commit_interleaved_and_send<1>(batch, interleaved_labels.interleaved_calldata);
        }

        // W₄: [secondary_calldata, ZERO, ZERO, ZERO]
        {
            std::array<PolynomialSpan<const FF>, 1> batch = { PolynomialSpan<const FF>(polys.secondary_calldata) };
            interleaved_commitments.interleaved_secondary_calldata =
                commit_interleaved_and_send<1>(batch, interleaved_labels.interleaved_secondary_calldata);
        }

        // W₅: [calldata_read_counts, calldata_read_tags, secondary_calldata_read_counts,
        // secondary_calldata_read_tags]
        {
            std::array<PolynomialSpan<const FF>, 4> batch = {
                PolynomialSpan<const FF>(polys.calldata_read_counts),
                PolynomialSpan<const FF>(polys.calldata_read_tags),
                PolynomialSpan<const FF>(polys.secondary_calldata_read_counts),
                PolynomialSpan<const FF>(polys.secondary_calldata_read_tags)
            };
            interleaved_commitments.interleaved_databus_tags =
                commit_interleaved_and_send<4>(batch, interleaved_labels.interleaved_databus_tags);
        }

        // W₆: [return_data_read_tags, return_data_read_counts, ZERO, ZERO]
        {
            std::array<PolynomialSpan<const FF>, 2> batch = { PolynomialSpan<const FF>(polys.return_data_read_tags),
                                                              PolynomialSpan<const FF>(polys.return_data_read_counts) };
            interleaved_commitments.interleaved_return_data_tags =
                commit_interleaved_and_send<2>(batch, interleaved_labels.interleaved_return_data_tags);
        }

        // W₇: [return_data, ZERO, ZERO, ZERO]
        {
            std::array<PolynomialSpan<const FF>, 1> batch = { PolynomialSpan<const FF>(polys.return_data) };
            interleaved_commitments.interleaved_return_data =
                commit_interleaved_and_send<1>(batch, interleaved_labels.interleaved_return_data);
        }
    } else {
        // Standard individual commitment path (BATCH_SIZE == 1)
        auto batch = commitment_key.start_batch();

        // Commit to the first three wire polynomials; w_4 is deferred until after memory records are added
        batch.add_to_batch(prover_instance->polynomials.w_l, commitment_labels.w_l, /*mask?*/ Flavor::HasZK);
        batch.add_to_batch(prover_instance->polynomials.w_r, commitment_labels.w_r, /*mask?*/ Flavor::HasZK);
        batch.add_to_batch(prover_instance->polynomials.w_o, commitment_labels.w_o, /*mask?*/ Flavor::HasZK);

        if constexpr (IsMegaFlavor<Flavor>) {
            // ECC op wires are not masked here: masking is achieved by adding random ops to the op_queue instead.
            for (auto [polynomial, label] :
                 zip_view(prover_instance->polynomials.get_ecc_op_wires(), commitment_labels.get_ecc_op_wires())) {
                batch.add_to_batch(polynomial, label, /*mask?*/ false);
            }

            // DataBus polynomials: calldata is left unmasked, everything else is masked in ZK mode
            for (auto [polynomial, label] : zip_view(prover_instance->polynomials.get_databus_entities(),
                                                     commitment_labels.get_databus_entities())) {
                bool mask = Flavor::HasZK && (label != commitment_labels.calldata);
                batch.add_to_batch(polynomial, label, mask);
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
}

/**
 * @brief Compute sorted witness-table accumulator and commit to the resulting polynomials.
 */
template <typename Flavor> void OinkProver<Flavor>::commit_to_lookup_counts_and_w4()
{
    BB_BENCH_NAME("OinkProver::commit_to_lookup_counts_and_w4");
    // Get eta challenge and compute powers (eta, eta², eta³)
    prover_instance->relation_parameters.compute_eta_powers(transcript->template get_challenge<FF>("eta"));

    add_ram_rom_memory_records_to_wire_4(*prover_instance);

    if constexpr (BATCH_SIZE > 1) {
        auto& polys = prover_instance->polynomials;

        // W₈: [w_4, ZERO, ZERO, ZERO] - shiftable
        {
            std::array<PolynomialSpan<const FF>, 1> batch = { PolynomialSpan<const FF>(polys.w_4) };
            interleaved_commitments.interleaved_w_4 =
                commit_interleaved_and_send<1>(batch, interleaved_labels.interleaved_w_4);
        }

        // W₉: [lookup_read_counts, lookup_read_tags, ZERO, ZERO]
        {
            std::array<PolynomialSpan<const FF>, 2> batch = { PolynomialSpan<const FF>(polys.lookup_read_counts),
                                                              PolynomialSpan<const FF>(polys.lookup_read_tags) };
            interleaved_commitments.interleaved_lookup =
                commit_interleaved_and_send<2>(batch, interleaved_labels.interleaved_lookup);
        }
    } else {
        // Commit to lookup argument polynomials and the finalized fourth wire polynomial
        auto batch = commitment_key.start_batch();
        batch.add_to_batch(prover_instance->polynomials.lookup_read_counts,
                           commitment_labels.lookup_read_counts,
                           /*mask?*/ Flavor::HasZK);
        batch.add_to_batch(prover_instance->polynomials.lookup_read_tags,
                           commitment_labels.lookup_read_tags,
                           /*mask?*/ Flavor::HasZK);
        batch.add_to_batch(prover_instance->polynomials.w_4, commitment_labels.w_4, /*mask?*/ Flavor::HasZK);
        auto computed_commitments = batch.commit_and_send_to_verifier(transcript);

        prover_instance->commitments.lookup_read_counts = computed_commitments[0];
        prover_instance->commitments.lookup_read_tags = computed_commitments[1];
        prover_instance->commitments.w_4 = computed_commitments[2];
    }
}

/**
 * @brief Compute log derivative inverse polynomial and its commitment, if required
 */
template <typename Flavor> void OinkProver<Flavor>::commit_to_logderiv_inverses()
{
    BB_BENCH_NAME("OinkProver::commit_to_logderiv_inverses");
    auto [beta, gamma] = transcript->template get_challenges<FF>(std::array<std::string, 2>{ "beta", "gamma" });
    prover_instance->relation_parameters.compute_beta_powers(beta);
    prover_instance->relation_parameters.gamma = gamma;

    // Compute the inverses used in log-derivative lookup relations
    compute_logderivative_inverses(*prover_instance);

    if constexpr (BATCH_SIZE > 1) {
        auto& polys = prover_instance->polynomials;

        // W₁₀: [lookup_inverses, calldata_inverses, secondary_calldata_inverses, return_data_inverses]
        {
            std::array<PolynomialSpan<const FF>, 4> batch = { PolynomialSpan<const FF>(polys.lookup_inverses),
                                                              PolynomialSpan<const FF>(polys.calldata_inverses),
                                                              PolynomialSpan<const FF>(
                                                                  polys.secondary_calldata_inverses),
                                                              PolynomialSpan<const FF>(polys.return_data_inverses) };
            interleaved_commitments.interleaved_inverses =
                commit_interleaved_and_send<4>(batch, interleaved_labels.interleaved_inverses);
        }
    } else {
        auto batch = commitment_key.start_batch();
        batch.add_to_batch(prover_instance->polynomials.lookup_inverses,
                           commitment_labels.lookup_inverses,
                           /*mask?*/ Flavor::HasZK);

        // If Mega, commit to the databus inverse polynomials and send
        if constexpr (IsMegaFlavor<Flavor>) {
            for (auto [polynomial, label] : zip_view(prover_instance->polynomials.get_databus_inverses(),
                                                     commitment_labels.get_databus_inverses())) {
                batch.add_to_batch(polynomial, label, /*mask?*/ Flavor::HasZK);
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
}

/**
 * @brief Compute the permutation grand product polynomial and commit to it.
 */
template <typename Flavor> void OinkProver<Flavor>::commit_to_z_perm()
{
    BB_BENCH_NAME("OinkProver::commit_to_z_perm");

    compute_grand_product_polynomial(*prover_instance);

    if constexpr (BATCH_SIZE > 1) {
        auto& polys = prover_instance->polynomials;

        // W₁₁: [z_perm, ZERO, ZERO, ZERO] - shiftable
        {
            std::array<PolynomialSpan<const FF>, 1> batch = { PolynomialSpan<const FF>(polys.z_perm) };
            interleaved_commitments.interleaved_z_perm =
                commit_interleaved_and_send<1>(batch, interleaved_labels.interleaved_z_perm);
        }
    } else {
        auto& z_perm = prover_instance->polynomials.z_perm;
        if constexpr (Flavor::HasZK) {
            z_perm.mask();
        }
        {
            BB_BENCH_NAME("COMMIT::z_perm");
            prover_instance->commitments.z_perm = commitment_key.commit(z_perm);
        }
        transcript->send_to_verifier(commitment_labels.z_perm, prover_instance->commitments.z_perm);
    }
}

template <typename Flavor> void OinkProver<Flavor>::commit_to_masking_poly()
{
    if constexpr (Flavor::HasZK) {
        if constexpr (BATCH_SIZE > 1) {
            auto& polys = prover_instance->polynomials;
            const size_t n = prover_instance->dyadic_size();

            // Generate BATCH_SIZE random masking chunks (one per interleaving slot)
            polys.masking_chunk_0 = Polynomial::random(n);
            polys.masking_chunk_1 = Polynomial::random(n);
            polys.masking_chunk_2 = Polynomial::random(n);
            polys.masking_chunk_3 = Polynomial::random(n);

            // Commit as interleaved group
            std::array<PolynomialSpan<const FF>, 4> masking_batch = { PolynomialSpan<const FF>(polys.masking_chunk_0),
                                                                      PolynomialSpan<const FF>(polys.masking_chunk_1),
                                                                      PolynomialSpan<const FF>(polys.masking_chunk_2),
                                                                      PolynomialSpan<const FF>(polys.masking_chunk_3) };
            interleaved_commitments.interleaved_masking =
                commit_interleaved_and_send<4>(masking_batch, interleaved_labels.interleaved_masking);
        } else {
            // Create a random masking polynomial for Gemini
            const size_t polynomial_size = prover_instance->dyadic_size();
            prover_instance->polynomials.gemini_masking_poly = Polynomial::random(polynomial_size);

            // Commit to the masking polynomial and send to transcript
            auto masking_commitment = commitment_key.commit(prover_instance->polynomials.gemini_masking_poly);
            transcript->send_to_verifier("Gemini:masking_poly_comm", masking_commitment);
        }
    }
};

/**
 * @brief Commit to an interleaved group of polynomials and send to verifier.
 */
template <typename Flavor>
template <size_t NUM_POLYS>
typename OinkProver<Flavor>::Commitment OinkProver<Flavor>::commit_interleaved_and_send(
    std::array<PolynomialSpan<const FF>, NUM_POLYS> polynomials, const std::string& label)
{
    static_assert(NUM_POLYS <= BATCH_SIZE, "Cannot batch more than BATCH_SIZE polynomials");

    std::span<const PolynomialSpan<const FF>> span_view(polynomials.data(), NUM_POLYS);
    Commitment commitment = commitment_key.template commit_interleaved<BATCH_SIZE>(span_view);

    transcript->send_to_verifier(label, commitment);

    return commitment;
}

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
        // Compute inverses for calldata reads
        DatabusLookupRelation<FF>::template compute_logderivative_inverse</*bus_idx=*/0>(
            polynomials, relation_parameters, circuit_size);

        // Compute inverses for secondary_calldata reads
        DatabusLookupRelation<FF>::template compute_logderivative_inverse</*bus_idx=*/1>(
            polynomials, relation_parameters, circuit_size);

        // Compute inverses for return data reads
        DatabusLookupRelation<FF>::template compute_logderivative_inverse</*bus_idx=*/2>(
            polynomials, relation_parameters, circuit_size);
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
template class OinkProver<MultiMegaFlavor>;
template class OinkProver<MultiMegaZKFlavor>;

} // namespace bb
