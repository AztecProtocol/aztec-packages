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

    using IPAProof = std::conditional_t<IsRecursive, stdlib::Proof<UltraCircuitBuilder>, HonkProof>;
    using PairingPoints = MergeVerifier::PairingPoints;
    using IPAClaim = OpeningClaim<typename ECCVMVerifier::Curve>;

    // Verification result
    struct VerificationResult {
        PairingPoints pairing_points; // BN254 pairing points - aggregated, verified natively or aggregated in-circuit
        IPAClaim ipa_claim;           // IPA opening claim from ECCVM - accumulated, verified natively by base, verified
                                      // in-circuit at root
        IPAProof ipa_proof;           // IPA proof - used for deferred verification
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
                    const MergeCommitments& merge_commitments)
        : transcript(std::move(transcript))
        , proof(proof)
        , merge_commitments(merge_commitments)
    {}

    /**
     * @brief Verify a full Goblin proof (Merge, ECCVM + IPA, Translator)
     * @return VerificationResult containing pairing points, IPA claim, and IPA proof
     */
    [[nodiscard("Verification result must be accumulated")]] VerificationResult verify();

  private:
    std::shared_ptr<Transcript> transcript;
    GoblinProof proof;
    MergeCommitments merge_commitments;
    static constexpr MergeSettings merge_settings = MergeSettings::APPEND;
};

// Type aliases for convenience
using GoblinVerifier = GoblinVerifier_<curve::BN254>;
using GoblinRecursiveVerifier = GoblinVerifier_<stdlib::bn254<UltraCircuitBuilder>>;

} // namespace bb
