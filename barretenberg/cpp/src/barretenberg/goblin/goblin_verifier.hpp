// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================
//
// Unified Goblin verifier for both native and recursive verification.
// See: chonk/README.md#goblin-eccvm--translator
//
#pragma once
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

// Forward declarations for GoblinVerificationResult specializations
template <typename Curve> struct GoblinVerificationResult;

/**
 * @brief Output of native Goblin verification.
 */
template <> struct GoblinVerificationResult<curve::BN254> {
    using PairingPointsType = bb::PairingPoints<curve::BN254>;
    using OpeningClaimType = bb::OpeningClaim<curve::Grumpkin>;
    using IPAProof = HonkProof;

    PairingPointsType pairing_points; // BN254 pairing points - verified on L1
    OpeningClaimType ipa_claim;       // IPA opening claim from ECCVM
    IPAProof ipa_proof;               // IPA proof for verification
};

/**
 * @brief Output of recursive Goblin verification.
 * @details Contains the deferred verification data that must be accumulated and
 * verified elsewhere (IPA claim for Grumpkin, pairing points for BN254).
 *
 * In Aztec's rollup architecture:
 *   - Pairing points: aggregated at each rollup level, verified on L1 via ecPairing precompile
 *   - IPA claims: originate from ECCVM, carried in RollupIO public inputs through rollup levels,
 *     accumulated via IPA::accumulate at each level, verified in-circuit at root via IPA::full_verify_recursive
 */
template <typename Builder> struct GoblinVerificationResult<stdlib::bn254<Builder>> {
    using BN254Curve = stdlib::bn254<Builder>;
    using GrumpkinCurve = stdlib::grumpkin<Builder>;
    using PairingPointsType = stdlib::recursion::PairingPoints<BN254Curve>;
    using OpeningClaimType = bb::OpeningClaim<GrumpkinCurve>;
    using IPAProof = stdlib::Proof<Builder>;

    PairingPointsType pairing_points; // BN254 pairing points - aggregated, verified on L1 or accumulated in-circuit
    OpeningClaimType ipa_claim;       // IPA opening claim from ECCVM - accumulated, verified in-circuit at root
    IPAProof ipa_proof;               // IPA proof - used for deferred verification
};

/**
 * @brief Unified verifier for Goblin proofs (Merge + ECCVM + IPA + Translator).
 * @details Creates a circuit verifying a Goblin proof. The verification is split into:
 *   1. Merge verification - checks ECC op queue commitment consistency
 *   2. ECCVM verification - verifies the correctness of ECC operations, outputs an IPA opening claim
 *   3. Translator verification - links ECCVM to BN254, outputs KZG pairing points
 *
 * The output contains deferred verification data (IPA claim + pairing points) that must be
 * accumulated and verified elsewhere.
 *
 * @tparam Curve The BN254 curve type (either curve::BN254 for native or stdlib::bn254<Builder> for recursive)
 */
template <typename Curve> class GoblinVerifier_ {
  public:
    static constexpr bool IsRecursive = Curve::is_stdlib_type;
    using Builder = std::conditional_t<IsRecursive, typename Curve::Builder, void>;

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

    // Verification result
    using VerificationResult = GoblinVerificationResult<Curve>;

    /**
     * @brief Construct a Goblin verifier
     * @param transcript Shared transcript for Fiat-Shamir
     */
    explicit GoblinVerifier_(const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>())
        : transcript(transcript)
    {}

    /**
     * @brief Verify a full Goblin proof (Merge, ECCVM + IPA, Translator)
     *
     * @param proof The complete Goblin proof containing Merge, ECCVM, IPA, and Translator proofs
     * @param merge_commitments The input commitments for the Merge verifier (t and T_prev tables)
     * @param merge_settings How the ecc op subtable was merged (PREPEND or APPEND)
     * @return VerificationResult containing pairing points, IPA claim, and IPA proof
     */
    [[nodiscard("Verification result should be accumulated")]] VerificationResult verify(
        const GoblinProof& proof,
        const MergeCommitments& merge_commitments,
        const MergeSettings merge_settings = MergeSettings::PREPEND);

  private:
    std::shared_ptr<Transcript> transcript;
};

// Type aliases for convenience
using GoblinVerifier = GoblinVerifier_<curve::BN254>;
using GoblinRecursiveVerifier = GoblinVerifier_<stdlib::bn254<UltraCircuitBuilder>>;

} // namespace bb
