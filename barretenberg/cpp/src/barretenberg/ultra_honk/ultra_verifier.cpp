// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "./ultra_verifier.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_recursive_flavor.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"

namespace bb {

/**
 * @brief Reduce ultra proof to verification claims (works for both native and recursive)
 * @details Contains all shared verification logic: Oink, Sumcheck, Shplemini
 * @return ReductionResult with pairing points and IPA claim for deferred verification
 */
template <typename Flavor, class IO>
typename UltraVerifier_<Flavor, IO>::ReductionResult UltraVerifier_<Flavor, IO>::reduce_to_claims(
    const typename UltraVerifier_<Flavor, IO>::Proof& proof)
{
    using FF = typename Flavor::FF;
    using PCS = typename Flavor::PCS;
    using Curve = typename Flavor::Curve;
    using Shplemini = ShpleminiVerifier_<Curve>;
    using VerifierCommitments = typename Flavor::VerifierCommitments;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    transcript->load_proof(proof);

    // For recursive: extract builder from proof if not already set (for builder access in later operations)
    if constexpr (IsRecursive) {
        if (builder == nullptr) {
            builder = proof.back().get_context();
        }
    }

    OinkVerifier<Flavor> oink_verifier{ verifier_instance, transcript };
    oink_verifier.verify();

    // Determine the number of rounds in the sumcheck based on whether or not padding is employed
    const size_t log_circuit_size = [this]() {
        if constexpr (IsRecursive) {
            return static_cast<size_t>(
                static_cast<uint32_t>(verifier_instance->get_vk()->log_circuit_size.get_value()));
        } else {
            return static_cast<size_t>(verifier_instance->vk->log_circuit_size);
        }
    }();
    const size_t log_n = Flavor::USE_PADDING ? Flavor::VIRTUAL_LOG_N : log_circuit_size;
    verifier_instance->gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", log_n);

    // Get the witness commitments that the verifier needs to verify
    auto vk_ptr = verifier_instance->get_vk();
    VerifierCommitments commitments{ vk_ptr, verifier_instance->witness_commitments };
    // For ZK flavors: set gemini_masking_poly commitment from accumulator
    if constexpr (Flavor::HasZK) {
        commitments.gemini_masking_poly = verifier_instance->gemini_masking_commitment;
    }

    // Construct the padding indicator array
    std::vector<FF> padding_indicator_array(log_n, 1);
    if constexpr (Flavor::HasZK) {
        for (size_t idx = 0; idx < log_n; idx++) {
            padding_indicator_array[idx] = (idx < log_circuit_size) ? FF{ 1 } : FF{ 0 };
        }
    }

    // Construct the sumcheck verifier
    SumcheckVerifier<Flavor> sumcheck(transcript, verifier_instance->alpha, log_n);
    // Receive commitments to Libra masking polynomials for ZKFlavors
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};

    if constexpr (Flavor::HasZK) {
        libra_commitments[0] = transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");
    }
    // Run the sumcheck verifier
    SumcheckOutput<Flavor> sumcheck_output = sumcheck.verify(
        verifier_instance->relation_parameters, verifier_instance->gate_challenges, padding_indicator_array);
    // Get the claimed evaluation of the Libra polynomials for ZKFlavors
    if constexpr (Flavor::HasZK) {
        libra_commitments[1] = transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
        libra_commitments[2] = transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");
    }

    bool consistency_checked = true;
    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ commitments.get_unshifted(), sumcheck_output.claimed_evaluations.get_unshifted() },
        .shifted = ClaimBatch{ commitments.get_to_be_shifted(), sumcheck_output.claimed_evaluations.get_shifted() }
    };

    // Specialization point: Commitment::one()
    auto one_commitment = [&]() {
        if constexpr (IsRecursive) {
            return Commitment::one(builder);
        } else {
            return Commitment::one();
        }
    }();

    auto opening_claim = Shplemini::compute_batch_opening_claim(padding_indicator_array,
                                                                claim_batcher,
                                                                sumcheck_output.challenge,
                                                                one_commitment,
                                                                transcript,
                                                                Flavor::REPEATED_COMMITMENTS,
                                                                Flavor::HasZK,
                                                                &consistency_checked,
                                                                libra_commitments,
                                                                sumcheck_output.claimed_libra_evaluation);

    // Reduce to pairing points (different MSM size for native)
    auto pairing_points = [&]() {
        if constexpr (IsRecursive) {
            return PCS::reduce_verify_batch_opening_claim(std::move(opening_claim), transcript);
        } else {
            return PCS::reduce_verify_batch_opening_claim(
                std::move(opening_claim), transcript, Flavor::FINAL_PCS_MSM_SIZE(log_n));
        }
    }();
    // Reconstruct the public inputs
    IO inputs;
    inputs.reconstruct_from_public(verifier_instance->public_inputs);

    // Aggregate new pairing points with those reconstructed from the public inputs
    pairing_points.aggregate(inputs.pairing_inputs);

    // Build reduction result
    ReductionResult result;
    result.pairing_points = std::move(pairing_points);
    result.reduction_succeeded = sumcheck_output.verified && consistency_checked;

    // Populate optional fields based on IO type
    if constexpr (HasIPAAccumulator<Flavor>) {
        result.ipa_claim = inputs.ipa_claim;
    } else if constexpr (std::is_same_v<IO, HidingKernelIO>) {
        // Native HidingKernelIO
        result.kernel_return_data = inputs.kernel_return_data;
        result.ecc_op_tables = inputs.ecc_op_tables;
    } else if constexpr (IsRecursive) {
        // Recursive-only IO types
        using HidingKernelIOType = stdlib::recursion::honk::HidingKernelIO<Builder>;
        using GoblinAvmIOType = stdlib::recursion::honk::GoblinAvmIO<Builder>;
        if constexpr (std::is_same_v<IO, HidingKernelIOType>) {
            result.kernel_return_data = inputs.kernel_return_data;
            result.ecc_op_tables = inputs.ecc_op_tables;
        } else if constexpr (std::is_same_v<IO, GoblinAvmIOType>) {
            result.mega_hash = inputs.mega_hash;
        }
    }

    return result;
}

/**
 * @brief Perform verification (native: immediate, recursive: deferred)
 * @details
 * - Native: Calls reduce_to_claims() then performs immediate pairing check + IPA verification
 * - Recursive: Calls reduce_to_claims() and returns pairing points for deferred verification
 * @return Output (UltraVerifierOutput for native, UltraRecursiveVerifierOutput for recursive)
 */
template <typename Flavor, class IO>
typename UltraVerifier_<Flavor, IO>::Output UltraVerifier_<Flavor, IO>::verify_proof(
    const typename UltraVerifier_<Flavor, IO>::Proof& proof,
    const typename UltraVerifier_<Flavor, IO>::Proof& ipa_proof)
{
    if constexpr (IsRecursive) {
        // For recursive IPA flavors: split combined proof into honk_proof and ipa_proof
        Proof honk_proof;
        Proof extracted_ipa_proof;

        if constexpr (HasIPAAccumulator<Flavor>) {
            const size_t num_public_inputs =
                static_cast<uint32_t>(verifier_instance->get_vk()->num_public_inputs.get_value());
            const size_t HONK_PROOF_LENGTH = Flavor::NativeFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS() - IPA_PROOF_LENGTH;
            const std::ptrdiff_t honk_proof_with_pub_inputs_length =
                static_cast<std::ptrdiff_t>(HONK_PROOF_LENGTH + num_public_inputs);
            extracted_ipa_proof = Proof(proof.begin() + honk_proof_with_pub_inputs_length, proof.end());
            honk_proof = Proof(proof.begin(), proof.begin() + honk_proof_with_pub_inputs_length);
        } else {
            honk_proof = proof;
        }

        // Reduce to claims (common logic)
        auto reduction_result = reduce_to_claims(honk_proof);

        // Recursive path: Return pairing points for deferred verification
        // Note: Do NOT call reconstruct_from_public again here - it was already called in reduce_to_claims
        // and calling it again would create duplicate circuit variables for pairing points
        Output output;
        output.points_accumulator = reduction_result.pairing_points;

        if constexpr (HasIPAAccumulator<Flavor>) {
            output.ipa_claim = reduction_result.ipa_claim;
            output.ipa_proof = extracted_ipa_proof;
        } else {
            // Check if this is HidingKernelIO - use type alias to avoid nested template parsing issues
            using HidingKernelIOType = stdlib::recursion::honk::HidingKernelIO<Builder>;
            if constexpr (std::is_same_v<IO, HidingKernelIOType>) {
                output.kernel_return_data = reduction_result.kernel_return_data;
                output.ecc_op_tables = reduction_result.ecc_op_tables;
            } else {
                using GoblinAvmIOType = stdlib::recursion::honk::GoblinAvmIO<Builder>;
                if constexpr (std::is_same_v<IO, GoblinAvmIOType>) {
                    output.mega_hash = reduction_result.mega_hash;
                }
            }
        }

        return output;
    } else {
        // Native path: Immediate pairing verification
        auto reduction_result = reduce_to_claims(proof);

        bool pairing_verified = reduction_result.pairing_points.check();

        vinfo("sumcheck_verified: ", reduction_result.reduction_succeeded);
        vinfo("pairing_check_verified: ", pairing_verified);

        UltraVerifierOutput output;
        output.result = reduction_result.reduction_succeeded && pairing_verified;

        // IPA verification for rollup flavors
        if constexpr (HasIPAAccumulator<Flavor>) {
            ipa_transcript->load_proof(ipa_proof);
            bool ipa_result =
                IPA<curve::Grumpkin>::reduce_verify(ipa_verification_key, reduction_result.ipa_claim, ipa_transcript);
            if (!ipa_result) {
                info("IPA verification failed!");
            }
            output.result &= ipa_result;
        } else if constexpr (std::is_same_v<IO, HidingKernelIO>) {
            output.kernel_return_data = reduction_result.kernel_return_data;
            output.ecc_op_tables = reduction_result.ecc_op_tables;
        }

        return output;
    }
}

// ===== NATIVE FLAVOR INSTANTIATIONS =====

template class UltraVerifier_<UltraFlavor, DefaultIO>;
template class UltraVerifier_<UltraZKFlavor, DefaultIO>;
template class UltraVerifier_<UltraKeccakFlavor, DefaultIO>;
template class UltraVerifier_<UltraKeccakZKFlavor, DefaultIO>;
template class UltraVerifier_<UltraRollupFlavor, RollupIO>;
template class UltraVerifier_<MegaFlavor, DefaultIO>;
template class UltraVerifier_<MegaZKFlavor, DefaultIO>;
template class UltraVerifier_<MegaZKFlavor, HidingKernelIO>; // Chonk

#ifdef STARKNET_GARAGA_FLAVORS
template class UltraVerifier_<UltraStarknetFlavor, DefaultIO>;
template class UltraVerifier_<UltraStarknetZKFlavor, DefaultIO>;
#endif

// ===== RECURSIVE FLAVOR INSTANTIATIONS =====

// UltraRecursiveFlavor with DefaultIO
template class UltraVerifier_<UltraRecursiveFlavor_<UltraCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>;
template class UltraVerifier_<UltraRecursiveFlavor_<MegaCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>;

// UltraZKRecursiveFlavor with DefaultIO
template class UltraVerifier_<UltraZKRecursiveFlavor_<UltraCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>;
template class UltraVerifier_<UltraZKRecursiveFlavor_<MegaCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>;

// UltraRollupRecursiveFlavor with RollupIO
template class UltraVerifier_<UltraRollupRecursiveFlavor_<UltraCircuitBuilder>, stdlib::recursion::honk::RollupIO>;

// MegaRecursiveFlavor with DefaultIO
template class UltraVerifier_<MegaRecursiveFlavor_<UltraCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>;
template class UltraVerifier_<MegaRecursiveFlavor_<MegaCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>;

// MegaZKRecursiveFlavor with DefaultIO
template class UltraVerifier_<MegaZKRecursiveFlavor_<UltraCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>;
template class UltraVerifier_<MegaZKRecursiveFlavor_<MegaCircuitBuilder>,
                              stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>;

// MegaZKRecursiveFlavor with HidingKernelIO (Chonk)
template class UltraVerifier_<MegaZKRecursiveFlavor_<UltraCircuitBuilder>,
                              stdlib::recursion::honk::HidingKernelIO<UltraCircuitBuilder>>;

// MegaRecursiveFlavor with GoblinAvmIO
template class UltraVerifier_<MegaRecursiveFlavor_<UltraCircuitBuilder>,
                              stdlib::recursion::honk::GoblinAvmIO<UltraCircuitBuilder>>;

} // namespace bb
