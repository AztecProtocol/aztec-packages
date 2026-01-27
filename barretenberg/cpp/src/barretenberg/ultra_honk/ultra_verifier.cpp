// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "./ultra_verifier.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/flavor/mega_avm_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_recursive_flavor.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/stdlib/primitives/padding_indicator_array/padding_indicator_array.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"

namespace bb {

/**
 * @brief Compute log_n based on flavor configuration.
 * @details Returns VIRTUAL_LOG_N for padded flavors, or VK's log_circuit_size otherwise.
 *          Called early in verification to derive num_public_inputs from proof size.
 */
template <typename Flavor, class IO> size_t UltraVerifier_<Flavor, IO>::compute_log_n() const
{
    if constexpr (Flavor::USE_PADDING) {
        return static_cast<size_t>(Flavor::VIRTUAL_LOG_N);
    } else {
        // Non-padded: use actual circuit size from VK (native only)
        return static_cast<size_t>(verifier_instance->get_vk()->log_circuit_size);
    }
}

/**
 * @brief Compute padding indicator array based on flavor configuration.
 * @details Must be called AFTER OinkVerifier::verify() so that VK fields are properly
 *          tagged through the transcript (for recursive ZK flavors).
 * @param log_n The log circuit size (from compute_log_n)
 * @return std::vector<FF> padding indicator array
 */
template <typename Flavor, class IO>
std::vector<typename Flavor::FF> UltraVerifier_<Flavor, IO>::compute_padding_indicator_array(size_t log_n) const
{
    // - Non-ZK flavors: all 1s (no masking needed)
    // - ZK without padding: all 1s (log_n == log_circuit_size, no padded region)
    // - ZK with padding: computed to mask padded rounds (1s for real, 0s for padding)
    std::vector<FF> padding_indicator_array(log_n, FF{ 1 });
    if constexpr (Flavor::HasZK && Flavor::USE_PADDING) {
        auto vk_ptr = verifier_instance->get_vk();
        if constexpr (IsRecursive) {
            // Recursive: use in-circuit computation via Lagrange polynomials
            // Note: Must be called after OinkVerifier so log_circuit_size is properly tagged
            padding_indicator_array =
                stdlib::compute_padding_indicator_array<Curve, Flavor::VIRTUAL_LOG_N>(vk_ptr->log_circuit_size);
        } else {
            // Native: simple loop comparison
            const size_t log_circuit_size = static_cast<size_t>(vk_ptr->log_circuit_size);
            for (size_t idx = 0; idx < log_n; idx++) {
                padding_indicator_array[idx] = (idx < log_circuit_size) ? FF{ 1 } : FF{ 0 };
            }
        }
    }

    return padding_indicator_array;
}

/**
 * @brief Split a combined rollup proof into honk and IPA components
 */
template <typename Flavor, class IO>
std::pair<typename UltraVerifier_<Flavor, IO>::Proof, typename UltraVerifier_<Flavor, IO>::Proof> UltraVerifier_<
    Flavor,
    IO>::split_rollup_proof(const Proof& combined_proof) const
    requires(HasIPAAccumulator<Flavor>)
{
    // Split point: IPA proof is appended at the end
    const auto honk_proof_length = static_cast<std::ptrdiff_t>(combined_proof.size() - IPA_PROOF_LENGTH);

    Proof honk_proof(combined_proof.begin(), combined_proof.begin() + honk_proof_length);
    Proof ipa_proof(combined_proof.begin() + honk_proof_length, combined_proof.end());

    return std::make_pair(honk_proof, ipa_proof);
}

/**
 * @brief Verify IPA proof for rollup circuits (native verifier only)
 */
template <typename Flavor, class IO>
bool UltraVerifier_<Flavor, IO>::verify_ipa(const Proof& ipa_proof, const IPAClaim& ipa_claim)
    requires(!IsRecursiveFlavor<Flavor> && HasIPAAccumulator<Flavor>)
{
    VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key(1 << CONST_ECCVM_LOG_N);
    ipa_transcript->load_proof(ipa_proof);
    bool ipa_verified = IPA<curve::Grumpkin>::reduce_verify(ipa_verification_key, ipa_claim, ipa_transcript);
    vinfo("UltraVerifier: IPA check: ", ipa_verified ? "true" : "false");

    if (!ipa_verified) {
        info("UltraVerifier: verification failed at IPA check");
    }

    return ipa_verified;
}

/**
 * @brief Reduce ultra proof to verification claims (works for both native and recursive)
 * @details Contains all shared verification logic: Oink, Sumcheck, Shplemini
 * @return ReductionResult with pairing points and intermediate consistency checks
 */
template <typename Flavor, class IO>
typename UltraVerifier_<Flavor, IO>::ReductionResult UltraVerifier_<Flavor, IO>::reduce_to_pairing_check(
    const typename UltraVerifier_<Flavor, IO>::Proof& proof)
{
    using Shplemini = ShpleminiVerifier_<Curve, Flavor::HasZK>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    transcript->load_proof(proof);

    // Compute log_n first (needed for proof layout calculation)
    const size_t log_n = compute_log_n();

    // Derive num_public_inputs from proof size using centralized proof layout
    const size_t num_public_inputs = ProofLength::Honk<Flavor>::derive_num_public_inputs(proof.size(), log_n);

    OinkVerifier<Flavor> oink_verifier{ verifier_instance, transcript, num_public_inputs };
    oink_verifier.verify();

    // Compute padding indicator array AFTER OinkVerifier so VK fields are properly tagged
    auto padding_indicator_array = compute_padding_indicator_array(log_n);
    verifier_instance->gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", log_n);

    // Get the witness commitments that the verifier needs to verify
    VerifierCommitments commitments{ verifier_instance->get_vk(), verifier_instance->witness_commitments };
    // For ZK flavors: set gemini_masking_poly commitment from accumulator
    if constexpr (Flavor::HasZK) {
        commitments.gemini_masking_poly = verifier_instance->gemini_masking_commitment;
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

    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ commitments.get_unshifted(), sumcheck_output.claimed_evaluations.get_unshifted() },
        .shifted = ClaimBatch{ commitments.get_to_be_shifted(), sumcheck_output.claimed_evaluations.get_shifted() }
    };

    const Commitment one_commitment = [&]() {
        if constexpr (IsRecursive) {
            return Commitment::one(builder);
        } else {
            return Commitment::one();
        }
    }();

    auto shplemini_output = Shplemini::compute_batch_opening_claim(padding_indicator_array,
                                                                   claim_batcher,
                                                                   sumcheck_output.challenge,
                                                                   one_commitment,
                                                                   transcript,
                                                                   Flavor::REPEATED_COMMITMENTS,
                                                                   libra_commitments,
                                                                   sumcheck_output.claimed_libra_evaluation);

    // Build reduction result
    ReductionResult result;
    result.pairing_points = PCS::reduce_verify_batch_opening_claim(
        std::move(shplemini_output.batch_opening_claim), transcript, Flavor::FINAL_PCS_MSM_SIZE(log_n));

    bool consistency_checked = true;
    if constexpr (Flavor::HasZK) {
        consistency_checked = shplemini_output.consistency_checked;
        vinfo("Ultra Verifier (with ZK): Libra evals consistency checked ", consistency_checked ? "true" : "false");
    }
    vinfo("Ultra Verifier sumcheck_verified: ", sumcheck_output.verified ? "true" : "false");
    result.reduction_succeeded = sumcheck_output.verified && consistency_checked;

    return result;
}

/**
 * @brief Perform ultra verification
 * @details
 * For Rollup flavors, splits the combined proof internally.
 * - Native: Performs immediate pairing verification (+ IPA for Rollup)
 * - Recursive: Returns pairing points (+ IPA proof for Rollup) for deferred verification
 */
template <typename Flavor, class IO>
typename UltraVerifier_<Flavor, IO>::Output UltraVerifier_<Flavor, IO>::verify_proof(
    const typename UltraVerifier_<Flavor, IO>::Proof& proof)
{
    // Step 1: Split proof if needed
    Proof honk_proof;
    Proof ipa_proof;
    if constexpr (HasIPAAccumulator<Flavor>) {
        std::tie(honk_proof, ipa_proof) = split_rollup_proof(proof);
    } else {
        honk_proof = proof;
    }

    // Step 2: Reduce to pairing check
    auto [pcs_pairing_points, reduction_succeeded] = reduce_to_pairing_check(honk_proof);
    vinfo("UltraVerifier: reduced to pairing check: ", reduction_succeeded ? "true" : "false");

    if constexpr (!IsRecursive) {
        if (!reduction_succeeded) {
            info("UltraVerifier: verification failed at reduction step");
            return Output{};
        }
    }

    // Step 3: Process the reduction result and public inputs
    IO inputs;
    inputs.reconstruct_from_public(verifier_instance->public_inputs);

    // Aggregate pairing points
    PairingPoints pi_pairing_points = inputs.pairing_inputs;
    pi_pairing_points.aggregate(pcs_pairing_points);

    // Construct output (common to both native and recursive)
    Output output(inputs);

    if constexpr (IsRecursive) {
        // Recursive: populate output for deferred verification
        output.points_accumulator = std::move(pi_pairing_points);
        if constexpr (HasIPAAccumulator<Flavor>) {
            output.ipa_proof = ipa_proof;
        }
    } else {
        // Perform pairing check
        bool pairing_verified = pi_pairing_points.check();
        vinfo("UltraVerifier: pairing check: ", pairing_verified ? "true" : "false");

        if (!pairing_verified) {
            info("UltraVerifier: verification failed at pairing check");
            return Output{};
        }

        // Perform IPA verification if Rollup flavor
        if constexpr (HasIPAAccumulator<Flavor>) {
            if (!verify_ipa(ipa_proof, inputs.ipa_claim)) {
                return Output{};
            }
        }

        output.result = true;
    }

    return output;
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
template class UltraVerifier_<MegaAvmRecursiveFlavor_<UltraCircuitBuilder>,
                              stdlib::recursion::honk::GoblinAvmIO<UltraCircuitBuilder>>;

} // namespace bb
