// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/ultra_honk/oink_verifier.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/ext/starknet/flavor/ultra_starknet_flavor.hpp"
#include "barretenberg/ext/starknet/flavor/ultra_starknet_zk_flavor.hpp"
#include "barretenberg/flavor/mega_avm_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/flavor/multi_mega_recursive_flavor.hpp"
#include "barretenberg/flavor/multi_mega_zk_flavor.hpp"
#include "barretenberg/flavor/multi_mega_zk_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_recursive_flavor.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"

namespace bb {

/**
 * @brief Receive witness commitments, compute relation parameters, and prepare for Sumcheck.
 */
template <typename Flavor> void OinkVerifier<Flavor>::verify()
{
    receive_vk_hash_and_public_inputs();

    if constexpr (Flavor::HasZK) {
        if constexpr (BATCH_SIZE > 1) {
            // Receive interleaved masking commitment
            interleaved_comms.interleaved_masking =
                transcript->template receive_from_prover<Commitment>(interleaved_labels.interleaved_masking);
        } else {
            // Receive single Gemini masking polynomial commitment
            verifier_instance->gemini_masking_commitment =
                transcript->template receive_from_prover<Commitment>("Gemini:masking_poly_comm");
        }
    }

    receive_wire_commitments();
    receive_lookup_counts_and_w4_commitments();
    receive_logderiv_commitments();
    complete_grand_product_round();

    if constexpr (BATCH_SIZE > 1) {
        // Store interleaved commitments and relation parameters on the verifier instance
        verifier_instance->interleaved_commitments = interleaved_comms;
    }

    verifier_instance->alpha = transcript->template get_challenge<FF>("alpha");
}

/**
 * @brief Hash the verification key, assert consistency, and receive public inputs from the transcript.
 */
template <typename Flavor> void OinkVerifier<Flavor>::receive_vk_hash_and_public_inputs()
{
    auto vk = verifier_instance->get_vk();

    FF vk_hash = vk->hash_with_origin_tagging(*transcript);
    transcript->add_to_hash_buffer("vk_hash", vk_hash);
    vinfo("vk hash in Oink verifier: ", vk_hash);

    // For recursive flavors, assert that the VK hash matches the expected hash provided in the VK
    if constexpr (IsRecursiveFlavor<Flavor>) {
        const bool is_write_vk_mode = vk_hash.get_context()->is_write_vk_mode();
        const bool vk_hash_consistency = verifier_instance->vk_and_hash->hash.get_value() == vk_hash.get_value();
        if (!vk_hash_consistency && !is_write_vk_mode) {
            info("Recursive Ultra Verifier: VK Hash Mismatch");
        }
        verifier_instance->vk_and_hash->hash.assert_equal(vk_hash);

        // Assert that the provided num_public_inputs matches VK's value (in-circuit constraint)
        vk->num_public_inputs.assert_equal(FF(num_public_inputs), "OinkVerifier: num_public_inputs mismatch with VK");
    } else {
        BB_ASSERT_EQ(verifier_instance->vk_and_hash->hash, vk_hash, "Native Ultra Verifier: VK Hash Mismatch");
        // Assert that the provided num_public_inputs matches VK's value
        BB_ASSERT_EQ(num_public_inputs,
                     static_cast<size_t>(vk->num_public_inputs),
                     "OinkVerifier: num_public_inputs mismatch with VK");
    };

    std::vector<FF> public_inputs;
    for (size_t i = 0; i < num_public_inputs; ++i) {
        auto public_input_i = transcript->template receive_from_prover<FF>("public_input_" + std::to_string(i));
        public_inputs.emplace_back(public_input_i);
    }
    verifier_instance->public_inputs = std::move(public_inputs);
}

/**
 * @brief Receive wire commitments (w_l, w_r, w_o). For Mega, also receive ECC op wire and DataBus commitments.
 * For interleaved flavors, receive interleaved commitments instead.
 */
template <typename Flavor> void OinkVerifier<Flavor>::receive_wire_commitments()
{
    if constexpr (BATCH_SIZE > 1) {
        // Receive W₁: [w_l, w_r, w_o, ZERO]
        interleaved_comms.interleaved_wires =
            transcript->template receive_from_prover<Commitment>(interleaved_labels.interleaved_wires);

        // Receive W₂: [ecc_op_wire_1..4]
        interleaved_comms.interleaved_ecc_op_wires =
            transcript->template receive_from_prover<Commitment>(interleaved_labels.interleaved_ecc_op_wires);

        // Receive individual ecc_op_wire commits (for merge protocol compatibility).
        // In the recursive case, these commitments are not used but must be consumed from transcript.
        {
            typename Flavor::CommitmentLabels labels;
            if constexpr (!IsRecursiveFlavor<Flavor>) {
                auto& wc = verifier_instance->witness_commitments;
                wc.ecc_op_wire_1 = transcript->template receive_from_prover<Commitment>(labels.ecc_op_wire_1);
                wc.ecc_op_wire_2 = transcript->template receive_from_prover<Commitment>(labels.ecc_op_wire_2);
                wc.ecc_op_wire_3 = transcript->template receive_from_prover<Commitment>(labels.ecc_op_wire_3);
                wc.ecc_op_wire_4 = transcript->template receive_from_prover<Commitment>(labels.ecc_op_wire_4);
            } else {
                // Receive but discard - must consume to advance transcript state
                transcript->template receive_from_prover<Commitment>(labels.ecc_op_wire_1);
                transcript->template receive_from_prover<Commitment>(labels.ecc_op_wire_2);
                transcript->template receive_from_prover<Commitment>(labels.ecc_op_wire_3);
                transcript->template receive_from_prover<Commitment>(labels.ecc_op_wire_4);
            }
        }

        // Receive W₃: [calldata, ZERO, ZERO, ZERO]
        interleaved_comms.interleaved_calldata =
            transcript->template receive_from_prover<Commitment>(interleaved_labels.interleaved_calldata);

        // Receive W₄: [secondary_calldata, ZERO, ZERO, ZERO]
        interleaved_comms.interleaved_secondary_calldata =
            transcript->template receive_from_prover<Commitment>(interleaved_labels.interleaved_secondary_calldata);

        // Receive W₅: [cd_read_counts, cd_read_tags, scd_read_counts, scd_read_tags]
        interleaved_comms.interleaved_databus_tags =
            transcript->template receive_from_prover<Commitment>(interleaved_labels.interleaved_databus_tags);

        // Receive W₆: [return_data_read_tags, return_data_read_counts, ZERO, ZERO]
        interleaved_comms.interleaved_return_data_tags =
            transcript->template receive_from_prover<Commitment>(interleaved_labels.interleaved_return_data_tags);

        // Receive W₇: [return_data, ZERO, ZERO, ZERO]
        interleaved_comms.interleaved_return_data =
            transcript->template receive_from_prover<Commitment>(interleaved_labels.interleaved_return_data);
    } else {
        // Standard individual commitment path
        verifier_instance->witness_commitments.w_l =
            transcript->template receive_from_prover<Commitment>(comm_labels.w_l);
        verifier_instance->witness_commitments.w_r =
            transcript->template receive_from_prover<Commitment>(comm_labels.w_r);
        verifier_instance->witness_commitments.w_o =
            transcript->template receive_from_prover<Commitment>(comm_labels.w_o);

        if constexpr (IsMegaFlavor<Flavor>) {
            // Receive ECC op wire commitments
            for (auto [commitment, label] :
                 zip_view(verifier_instance->witness_commitments.get_ecc_op_wires(), comm_labels.get_ecc_op_wires())) {
                commitment = transcript->template receive_from_prover<Commitment>(label);
            }

            // Receive DataBus related polynomial commitments
            for (auto [commitment, label] : zip_view(verifier_instance->witness_commitments.get_databus_entities(),
                                                     comm_labels.get_databus_entities())) {
                commitment = transcript->template receive_from_prover<Commitment>(label);
            }
        }
    }
}

/**
 * @brief Get sorted witness-table accumulator and fourth wire commitments
 */
template <typename Flavor> void OinkVerifier<Flavor>::receive_lookup_counts_and_w4_commitments()
{
    // Get eta challenge and compute powers (eta, eta², eta³)
    verifier_instance->relation_parameters.compute_eta_powers(transcript->template get_challenge<FF>("eta"));

    if constexpr (BATCH_SIZE > 1) {
        // Receive W₈: [w_4, ZERO, ZERO, ZERO]
        interleaved_comms.interleaved_w_4 =
            transcript->template receive_from_prover<Commitment>(interleaved_labels.interleaved_w_4);

        // Receive W₉: [lookup_read_counts, lookup_read_tags, ZERO, ZERO]
        interleaved_comms.interleaved_lookup =
            transcript->template receive_from_prover<Commitment>(interleaved_labels.interleaved_lookup);
    } else {
        // Get commitments to lookup argument polynomials and fourth wire
        verifier_instance->witness_commitments.lookup_read_counts =
            transcript->template receive_from_prover<Commitment>(comm_labels.lookup_read_counts);
        verifier_instance->witness_commitments.lookup_read_tags =
            transcript->template receive_from_prover<Commitment>(comm_labels.lookup_read_tags);
        verifier_instance->witness_commitments.w_4 =
            transcript->template receive_from_prover<Commitment>(comm_labels.w_4);
    }
}

/**
 * @brief Receive beta/gamma challenges and log-derivative inverse commitments.
 */
template <typename Flavor> void OinkVerifier<Flavor>::receive_logderiv_commitments()
{
    auto [beta, gamma] = transcript->template get_challenges<FF>(std::array<std::string, 2>{ "beta", "gamma" });
    verifier_instance->relation_parameters.compute_beta_powers(beta);
    verifier_instance->relation_parameters.gamma = gamma;

    if constexpr (BATCH_SIZE > 1) {
        // Receive W₁₀: [lookup_inverses, calldata_inverses, secondary_calldata_inverses, return_data_inverses]
        interleaved_comms.interleaved_inverses =
            transcript->template receive_from_prover<Commitment>(interleaved_labels.interleaved_inverses);
    } else {
        verifier_instance->witness_commitments.lookup_inverses =
            transcript->template receive_from_prover<Commitment>(comm_labels.lookup_inverses);

        if constexpr (IsMegaFlavor<Flavor>) {
            for (auto [commitment, label] : zip_view(verifier_instance->witness_commitments.get_databus_inverses(),
                                                     comm_labels.get_databus_inverses())) {
                commitment = transcript->template receive_from_prover<Commitment>(label);
            }
        }
    }
}

/**
 * @brief Compute public_input_delta for the permutation argument and receive z_perm commitment.
 */
template <typename Flavor> void OinkVerifier<Flavor>::complete_grand_product_round()
{
    auto vk = verifier_instance->get_vk();

    verifier_instance->relation_parameters.public_input_delta =
        compute_public_input_delta<Flavor>(verifier_instance->public_inputs,
                                           verifier_instance->relation_parameters.beta,
                                           verifier_instance->relation_parameters.gamma,
                                           vk->pub_inputs_offset);

    if constexpr (BATCH_SIZE > 1) {
        // Receive W₁₁: [z_perm, ZERO, ZERO, ZERO]
        interleaved_comms.interleaved_z_perm =
            transcript->template receive_from_prover<Commitment>(interleaved_labels.interleaved_z_perm);
    } else {
        verifier_instance->witness_commitments.z_perm =
            transcript->template receive_from_prover<Commitment>(comm_labels.z_perm);
    }
}

// Native flavor instantiations
template class OinkVerifier<UltraFlavor>;
template class OinkVerifier<UltraZKFlavor>;
template class OinkVerifier<UltraKeccakFlavor>;
#ifdef STARKNET_GARAGA_FLAVORS
template class OinkVerifier<UltraStarknetFlavor>;
template class OinkVerifier<UltraStarknetZKFlavor>;
#endif
template class OinkVerifier<UltraKeccakZKFlavor>;
template class OinkVerifier<MegaFlavor>;
template class OinkVerifier<MegaZKFlavor>;
template class OinkVerifier<MultiMegaFlavor>;
template class OinkVerifier<MultiMegaZKFlavor>;

// Recursive flavor instantiations
template class OinkVerifier<UltraRecursiveFlavor_<UltraCircuitBuilder>>;
template class OinkVerifier<UltraRecursiveFlavor_<MegaCircuitBuilder>>;
template class OinkVerifier<MegaRecursiveFlavor_<UltraCircuitBuilder>>;
template class OinkVerifier<MegaRecursiveFlavor_<MegaCircuitBuilder>>;
template class OinkVerifier<MegaZKRecursiveFlavor_<MegaCircuitBuilder>>;
template class OinkVerifier<MegaZKRecursiveFlavor_<UltraCircuitBuilder>>;
template class OinkVerifier<MegaAvmRecursiveFlavor_<UltraCircuitBuilder>>;
template class OinkVerifier<UltraZKRecursiveFlavor_<UltraCircuitBuilder>>;
template class OinkVerifier<UltraZKRecursiveFlavor_<MegaCircuitBuilder>>;
template class OinkVerifier<MultiMegaRecursiveFlavor_<UltraCircuitBuilder>>;
template class OinkVerifier<MultiMegaRecursiveFlavor_<MegaCircuitBuilder>>;
template class OinkVerifier<MultiMegaZKRecursiveFlavor_<UltraCircuitBuilder>>;
template class OinkVerifier<MultiMegaZKRecursiveFlavor_<MegaCircuitBuilder>>;

} // namespace bb
