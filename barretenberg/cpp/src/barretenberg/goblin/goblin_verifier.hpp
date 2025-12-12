// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
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
 *      - Reduces to KZG pairing check
 *   2. ECCVM verification - Proves correct execution of elliptic curve operations
 *      - Reduces to IPA opening claim (Grumpkin curve)
 *   3. Translator verification - Proves consistency between BN254 ↔ Grumpkin field element representations
 *      - Reduces to KZG pairing check
 *
 * Each sub-verifier performs internal consistency checks and reduces polynomial opening claims to either:
 *   - KZG pairing points (Merge, Translator) - aggregated and verified via ecPairing on L1 or accumulated in-circuit
 *   - IPA opening claim (ECCVM) - accumulated across proofs and verified in root rollup (recursive) or natively
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

        PairingPoints pairing_points;   // Aggregated KZG pairing points (Merge + Translator)
        IPAClaim ipa_claim;             // IPA opening claim from ECCVM (Grumpkin curve)
        IPAProof ipa_proof;             // IPA proof for verifying the claim
        bool all_checks_passed = false; // Native: includes pairing checks (already performed)
                                        // Recursive: excludes pairing (deferred for batching)
                                        // Both: excludes IPA verification (always deferred)
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
     * @brief Verify Goblin proof components and return deferred verification data
     * @details Orchestrates three sub-verifiers: Merge → ECCVM → Translator
     *
     * Native mode: Performs immediate pairing checks (cheap ~1ms) for fail-fast, returns IPA claim for deferred
     * verification. Recursive mode: Returns both pairing points and IPA claim for batched verification.
     *
     * @return VerificationResult with all_checks_passed indicating:
     *   - Native: reduction checks + pairing checks passed, IPA verification still needed
     *   - Recursive: reduction checks only (pairing and IPA both deferred)
     *
     * @warning Caller must verify ipa_claim using ipa_proof (deferred in both modes)
     */
    [[nodiscard("Verification result must be accumulated")]] ReductionResult reduce_to_pairing_check_and_ipa_opening();

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
