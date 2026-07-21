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
     * @details Native mode: Pairing checks are performed immediately (fail-fast), TripleIPA verification is deferred.
     *          Recursive mode: Pairing and TripleIPA verification are deferred for aggregation.
     */
    using DeferredTripleIpaOpening = typename ECCVMVerifier::DeferredTripleIpaOpening;

    struct ReductionResult {
        using PairingPoints = MergeVerifier::PairingPoints;
        PairingPoints merge_pairing_points;          // KZG pairing points from Merge
        PairingPoints translator_pairing_points;     // KZG pairing points from Translator
        DeferredTripleIpaOpening triple_ipa_opening; // Compact TripleIPA verifier input and proof from ECCVM
        bool all_checks_passed = false;              // Native: includes pairing checks (already performed)
                                                     // Recursive: excludes pairing (deferred for batching)
    };

    /**
     * @brief Construct a Goblin verifier
     * @param transcript Shared transcript for Fiat-Shamir
     * @param proof The complete Goblin proof containing Merge, ECCVM, TripleIPA, and Translator proofs
     * @param merge_commitments The input commitments for the Merge verifier (t and T_prev tables)
     */
    GoblinVerifier_(std::shared_ptr<Transcript> transcript,
                    const GoblinProof& proof,
                    const MergeCommitments& merge_commitments)
        : transcript(std::move(transcript))
        , proof(proof)
        , merge_commitments(merge_commitments)
    {}

    /**
     * @brief Reduce Goblin proof to pairing checks and a TripleIPA claim
     * @details Orchestrates three sub-verifiers in sequence: Merge → ECCVM → Translator
     *   - Merge: reduces to KZG pairing check
     *   - ECCVM: reconstructs a compact TripleIPA claim (Grumpkin curve)
     *   - Translator: reduces to KZG pairing check
     *
     * Pairing points from Merge and Translator are aggregated. In native mode, performs immediate pairing
     * checks for early rejections. TripleIPA verification is always deferred to the caller.
     *
     * @return ReductionResult with all_checks_passed indicating:
     *   - Native: reduction checks + pairing checks passed, TripleIPA verification still needed
     *   - Recursive: reduction checks only (pairing and TripleIPA verification both deferred)
     *
     * @warning Caller must reduce or verify triple_ipa_opening, then verify or accumulate the resulting accumulator.
     */
    [[nodiscard("Verification result must be accumulated")]] ReductionResult
    reduce_to_pairing_check_and_triple_ipa_opening();

  private:
    std::shared_ptr<Transcript> transcript;
    GoblinProof proof;
    MergeCommitments merge_commitments;
};

// Type aliases for convenience
using GoblinVerifier = GoblinVerifier_<curve::BN254>;
using GoblinRecursiveVerifier = GoblinVerifier_<stdlib::bn254<UltraCircuitBuilder>>;

} // namespace bb
