// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/ultra_honk/oink_verifier.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/ext/starknet/flavor/ultra_starknet_flavor.hpp"
#include "barretenberg/ext/starknet/flavor/ultra_starknet_zk_flavor.hpp"
#include "barretenberg/flavor/mega_app_flavor.hpp"
#include "barretenberg/flavor/mega_app_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_avm_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_recursive_flavor.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"

namespace bb {

/**
 * @brief Receive witness commitments, compute relation parameters, and prepare for Sumcheck.
 */
template <typename Flavor> void OinkVerifier<Flavor>::verify(bool emit_alpha)
{
    receive_vk_hash_and_public_inputs();
    if constexpr (flavor_has_gemini_masking<Flavor>()) {
        verifier_instance->gemini_masking_commitment =
            transcript->template receive_from_prover<Commitment>("Gemini:masking_poly_comm");
    }
    receive_wire_commitments();
    if (stage_callback) {
        stage_callback("wire_commitments");
    }
    receive_lookup_counts_and_w4_commitments();
    if (stage_callback) {
        stage_callback("lookup_counts_and_w4");
    }
    receive_logderiv_commitments();
    if (stage_callback) {
        stage_callback("logderiv_commitments");
    }
    complete_grand_product_round();
    if (stage_callback) {
        stage_callback("grand_product");
    }

    if (emit_alpha) {
        verifier_instance->alpha = transcript->template get_challenge<FF>("alpha");
        if (stage_callback) {
            stage_callback("alpha");
        }
    }
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
    if (stage_callback) {
        stage_callback("vk_hash");
    }

    std::vector<FF> public_inputs;
    for (size_t i = 0; i < num_public_inputs; ++i) {
        auto public_input_i = transcript->template receive_from_prover<FF>("public_input_" + std::to_string(i));
        public_inputs.emplace_back(public_input_i);
    }
    verifier_instance->public_inputs = std::move(public_inputs);
    if (stage_callback) {
        stage_callback("public_inputs");
    }
}

/**
 * @brief Receive wire commitments (w_l, w_r, w_o). For Mega, also receive ECC op wire and DataBus commitments.
 * The fourth wire (w_4) is received later, after memory records are incorporated.
 */
template <typename Flavor> void OinkVerifier<Flavor>::receive_wire_commitments()
{
    // Get commitments to first three wire polynomials
    verifier_instance->witness_commitments.w_l() =
        transcript->template receive_from_prover<Commitment>(comm_labels.w_l());
    verifier_instance->witness_commitments.w_r() =
        transcript->template receive_from_prover<Commitment>(comm_labels.w_r());
    verifier_instance->witness_commitments.w_o() =
        transcript->template receive_from_prover<Commitment>(comm_labels.w_o());

    if constexpr (Flavor::HasEccOpQueue) {
        for (auto [commitment, label] :
             zip_view(verifier_instance->witness_commitments.get_ecc_op_wires(), comm_labels.get_ecc_op_wires())) {
            commitment = transcript->template receive_from_prover<Commitment>(label);
        }
    }
    if constexpr (Flavor::HasDataBus) {
        for (auto [commitment, label] : zip_view(verifier_instance->witness_commitments.get_databus_entities(),
                                                 comm_labels.get_databus_entities())) {
            commitment = transcript->template receive_from_prover<Commitment>(label);
        }
    }
}

/**
 * @brief Get sorted witness-table accumulator and fourth wire commitments
 *
 */
template <typename Flavor> void OinkVerifier<Flavor>::receive_lookup_counts_and_w4_commitments()
{
    // The memory relation is the sole consumer of the eta powers and the ROM-LogUp offset
    // `rom_logup_gamma`, so `Flavor::HasMemory` gates their FS samples and the power computation.
    // When false, skip them — prover and verifier stay in lockstep on the FS state, and the
    // in-circuit recursive verifier avoids dangling witnesses (eta_two/eta_three/rom_logup_gamma)
    // that the static analyzer would flag.
    if constexpr (Flavor::HasMemory) {
        auto [eta, rom_logup_gamma] =
            transcript->template get_challenges<FF>(std::array<std::string, 2>{ "eta", "rom_logup_gamma" });
        verifier_instance->relation_parameters.eta = eta;
        verifier_instance->relation_parameters.eta_two = eta * eta;
        verifier_instance->relation_parameters.eta_three = verifier_instance->relation_parameters.eta_two * eta;
        verifier_instance->relation_parameters.rom_logup_gamma = rom_logup_gamma;
    }

    // Get commitments to lookup argument polynomials and fourth wire
    if constexpr (Flavor::HasLogDerivLookup) {
        verifier_instance->witness_commitments.lookup_read_counts() =
            transcript->template receive_from_prover<Commitment>(comm_labels.lookup_read_counts());
        verifier_instance->witness_commitments.lookup_read_tags() =
            transcript->template receive_from_prover<Commitment>(comm_labels.lookup_read_tags());
    }
    verifier_instance->witness_commitments.w_4() =
        transcript->template receive_from_prover<Commitment>(comm_labels.w_4());
}

/**
 * @brief Receive beta/gamma challenges and log-derivative inverse commitments (plus databus inverses for Mega).
 */
template <typename Flavor> void OinkVerifier<Flavor>::receive_logderiv_commitments()
{
    auto [beta, gamma] = transcript->template get_challenges<FF>(std::array<std::string, 2>{ "beta", "gamma" });
    verifier_instance->relation_parameters.beta = beta;
    verifier_instance->relation_parameters.gamma = gamma;
    // The log-derivative lookup relation is the sole consumer of the squared/cubed beta powers, so
    // `Flavor::HasLogDerivLookup` gates their computation. When false, skip the extra multiplications
    // to avoid leaving the squared/cubed witnesses dangling in the in-circuit recursive verifier.
    if constexpr (Flavor::HasLogDerivLookup) {
        verifier_instance->relation_parameters.beta_sqr = beta * beta;
        verifier_instance->relation_parameters.beta_cube = verifier_instance->relation_parameters.beta_sqr * beta;
    }

    if constexpr (Flavor::HasLogDerivLookup) {
        verifier_instance->witness_commitments.lookup_inverses() =
            transcript->template receive_from_prover<Commitment>(comm_labels.lookup_inverses());
    }

    if constexpr (Flavor::HasDataBus) {
        for (auto [commitment, label] : zip_view(verifier_instance->witness_commitments.get_databus_inverses(),
                                                 comm_labels.get_databus_inverses())) {
            commitment = transcript->template receive_from_prover<Commitment>(label);
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
    if (stage_callback) {
        stage_callback("public_input_delta");
    }

    verifier_instance->witness_commitments.z_perm() =
        transcript->template receive_from_prover<Commitment>(comm_labels.z_perm());
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
template class OinkVerifier<MegaAppFlavor>;
template class OinkVerifier<MegaKernelFlavor>;
template class OinkVerifier<MegaAppRecursiveFlavor>;
template class OinkVerifier<MegaKernelRecursiveFlavor>;

} // namespace bb
