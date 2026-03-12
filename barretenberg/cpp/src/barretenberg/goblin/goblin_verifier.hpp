// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/goblin/merge_verifier.hpp"
#include "barretenberg/goblin/types.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"

namespace bb {

/**
 * @brief Unified Goblin verifier for both native and recursive verification.
 *
 * @details Orchestrates verification of the three Goblin sub-protocols:
 *   1. Merge protocol - Proves correct concatenation of op queue tables (see MERGE_PROTOCOL.md)
 *   2. ECCVM verification - Proves correct execution of elliptic curve operations
 *   3. Translator verification - Proves consistency between BN254 ↔ Grumpkin field element representations
 *
 *
 * This verifier does NOT perform final verification - it returns reduction results for deferred verification.
 *
 * @tparam Curve The BN254 curve type (either curve::BN254 for native or stdlib::bn254<Builder> for recursive)
 */
template <typename Curve> class GoblinVerifier_ {
  public:
    static constexpr bool IsRecursive = Curve::is_stdlib_type;

    // Verifier types
    using MergeVerifier = MergeVerifier_<Curve>;
    using ECCVMVerifier = ECCVMVerifier_<std::conditional_t<IsRecursive, ECCVMRecursiveFlavor, ECCVMFlavor>>;
    using TranslatorVerifier =
        TranslatorVerifier_<std::conditional_t<IsRecursive, TranslatorRecursiveFlavor, TranslatorFlavor>>;

    // Proof and commitment types
    using GoblinProof = std::conditional_t<IsRecursive, GoblinStdlibProof, bb::GoblinProof>;
    using MergeCommitments = typename MergeVerifier::InputCommitments;

    // Transcript type
    using Transcript = std::conditional_t<IsRecursive, UltraStdlibTranscript, NativeTranscript>;

    /**
     * @brief Result of Goblin verification with mode-specific semantics
     * @details Native mode: Pairing checks performed immediately (fail-fast), only IPA verification deferred
     *          Recursive mode: Both pairing and IPA verification deferred for batched verification
     */
    struct ReductionResult {
        using PairingPoints = MergeVerifier::PairingPoints;
        using IPAClaim = OpeningClaim<typename ECCVMVerifier::Curve>;
        using IPAProof = std::conditional_t<IsRecursive, stdlib::Proof<UltraCircuitBuilder>, HonkProof>;

        PairingPoints merge_pairing_points;      // KZG pairing points from Merge
        PairingPoints translator_pairing_points; // KZG pairing points from Translator
        IPAClaim ipa_claim;                      // IPA opening claim from ECCVM (Grumpkin curve)
        IPAProof ipa_proof;                      // IPA proof for verifying the claim
        bool all_checks_passed = false;          // Native: includes pairing checks (already performed)
                                                 // Recursive: excludes pairing (deferred for batching)
                                                 // Both: excludes IPA verification (always deferred)
    };

    /**
     * @brief Like ReductionResult but with a deferred batch opening claim instead of a finalized IPA claim.
     * @details The ECCVM's Shplonk MSM is deferred, allowing multiple proofs' claims to be batched.
     */
    struct BatchReductionResult {
        using PairingPoints = typename ReductionResult::PairingPoints;
        using DeferredIPAClaim = typename ECCVMVerifier::DeferredIPAClaim;
        using IPAProof = typename ReductionResult::IPAProof;

        PairingPoints merge_pairing_points;
        PairingPoints translator_pairing_points;
        DeferredIPAClaim deferred_ipa_claim; // Deferred ECCVM Shplonk MSM + evaluation
        IPAProof ipa_proof;
        bool all_checks_passed = false;
    };

    /**
     * @brief Construct a Goblin verifier
     * @param transcript Shared transcript for Fiat-Shamir
     * @param proof The complete Goblin proof containing Merge, ECCVM, IPA, and Translator proofs
     * @param merge_commitments The input commitments for the Merge verifier (t and T_prev tables)
     * @param merge_settings How the ecc op subtable was merged (PREPEND or APPEND)
     */
    GoblinVerifier_(std::shared_ptr<Transcript> transcript,
                    const GoblinProof& proof,
                    const MergeCommitments& merge_commitments,
                    MergeSettings merge_settings)
        : transcript(std::move(transcript))
        , proof(proof)
        , merge_commitments(merge_commitments)
        , merge_settings(merge_settings)
    {}

    /**
     * @brief Reduce Goblin proof to pairing points and IPA opening claim.
     * @details Orchestrates three sub-verifiers in sequence: Merge -> ECCVM -> Translator.
     * Returns pairing points (deferred for caller to check) and a finalized IPA opening claim.
     * IPA verification is always deferred to the caller.
     *
     * @return ReductionResult with pairing points and IPA claim (both need external verification)
     */
    [[nodiscard("Verification result must be accumulated")]] ReductionResult reduce_to_pairing_check_and_ipa_opening();

    /**
     * @brief Like reduce_to_pairing_check_and_ipa_opening but also defers the ECCVM Shplonk MSM.
     * @details Returns a DeferredIPAClaim whose commitments and scalars can be merged with other
     * proofs' claims for a single batched MSM before finalization.
     */
    [[nodiscard("Batch opening claim must be finalized")]] BatchReductionResult
    reduce_to_pairing_check_and_batch_opening_claim();

  private:
    std::shared_ptr<Transcript> transcript;
    GoblinProof proof;
    MergeCommitments merge_commitments;
    MergeSettings merge_settings;
};

// Type aliases for convenience
using GoblinVerifier = GoblinVerifier_<curve::BN254>;
using GoblinRecursiveVerifier = GoblinVerifier_<stdlib::bn254<UltraCircuitBuilder>>;

} // namespace bb
