// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================
//
// Recursive Goblin verifier for in-circuit verification.
// See: chonk/README.md#goblin-eccvm--translator
//
#pragma once
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/merge_verifier.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief Output of recursive Goblin verification.
 * @details Contains the deferred verification data that must be accumulated and
 * verified later (IPA claim for Grumpkin, pairing points for BN254).
 *
 * In Aztec's rollup architecture:
 *   - Pairing points: aggregated at each rollup level, verified on L1 via ecPairing precompile
 *   - IPA claims: originate from ECCVM, carried in RollupIO public inputs through rollup levels,
 *     accumulated via IPA::accumulate at each level, verified in-circuit at root via IPA::full_verify_recursive
 */
struct GoblinRecursiveVerifierOutput {
    using Builder = UltraCircuitBuilder;
    using Curve = grumpkin<Builder>;
    using BN254Curve = bn254<Builder>;
    using PairingAccumulator = PairingPoints<BN254Curve>;
    PairingAccumulator points_accumulator; // BN254 pairing points - accumulated, verified on L1
    OpeningClaim<Curve> opening_claim;     // IPA opening claim from ECCVM - accumulated, verified in-circuit at root
    stdlib::Proof<Builder> ipa_proof;      // IPA proof - used in root rollup's in-circuit verification
};

/**
 * @brief Recursive verifier for Goblin proofs (Merge + ECCVM + IPA + Translator).
 * @details Creates a circuit verifying a Goblin proof. The verification is split into:
 *   1. Merge verification - checks ECC op queue commitment consistency
 *   2. ECCVM verification - verifies the correctness of ECC operations, outputs an IPA opening claim
 *   3. Translator verification - links ECCVM to BN254, outputs KZG pairing points
 *
 * The output contains deferred verification data (IPA claim + pairing points) that must be
 * accumulated and verified elsewhere.
 *
 * Uses Ultra arithmetization, as all ECC ops have to be performed in-circuit at this stage.
 */
class GoblinRecursiveVerifier {
  public:
    // Goblin Recursive Verifier circuit is using Ultra arithmetisation
    using Builder = UltraCircuitBuilder;
    using MergeVerifier = bb::stdlib::recursion::goblin::MergeRecursiveVerifier<Builder>;
    using Transcript = UltraStdlibTranscript;
    using TranslatorFlavor = TranslatorRecursiveFlavor;
    using TranslatorVerifier = TranslatorRecursiveVerifier;
    using TranslatorInputData = TranslatorInputData_<TranslatorRecursiveVerifier::BF>;

    // ECCVM and Translator verification keys
    using VerificationKey = Goblin::VerificationKey;

    // Merge commitments
    using MergeCommitments = MergeVerifier::InputCommitments;

    GoblinRecursiveVerifier(Builder* builder,
                            const VerificationKey& verification_keys,
                            const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>())
        : builder(builder)
        , verification_keys(verification_keys)
        , transcript(transcript) {};

    [[nodiscard("IPA claim and Pairing points should be accumulated")]] GoblinRecursiveVerifierOutput verify(
        const GoblinStdlibProof&,
        const MergeCommitments& merge_commitments,
        const MergeSettings merge_settings = MergeSettings::PREPEND);

  private:
    Builder* builder;
    VerificationKey verification_keys; // ECCVM and Translator verification keys
    std::shared_ptr<Transcript> transcript;
};

} // namespace bb::stdlib::recursion::honk
