#pragma once

#include "barretenberg/goblin/goblin_v2_types.hpp"
#include "barretenberg/goblin/goblin_verifier.hpp"
#include "barretenberg/goblin/poseidon2_merge_verifier.hpp"
#include "barretenberg/poseidon2_final/poseidon2_final_verifier.hpp"

namespace bb {

/**
 * @brief Extended Goblin verifier with Poseidon2 verification.
 *
 * @details Orchestrates verification of all sub-protocols:
 *   1. Merge protocol (ECC) — proves op queue concatenation
 *   2. ECCVM — proves correct EC operations
 *   3. Translator — bridges BN254 ↔ Grumpkin fields
 *   4. Poseidon2 Merge — proves poseidon2 op queue concatenation
 *   5. Poseidon2 Final — proves all accumulated Poseidon2 hashes are correct
 *
 * The Poseidon2 final verifier substitutes the accumulated poseidon2_op_wire
 * commitments (from merge) for the wire commitments in the Poseidon2SingleRowFlavor
 * proof, then verifies Sumcheck + PCS.
 *
 * @tparam Curve BN254 curve type (native or recursive)
 */
template <typename Curve> class GoblinV2Verifier_ {
  public:
    static constexpr bool IsRecursive = Curve::is_stdlib_type;

    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using PairingPoints =
        std::conditional_t<IsRecursive, stdlib::recursion::PairingPoints<Curve>, bb::PairingPoints<Curve>>;
    using Transcript = std::conditional_t<IsRecursive, UltraStdlibTranscript, NativeTranscript>;

    // Sub-verifier types
    using EccMergeVerifier = MergeVerifier_<Curve>;
    using ECCVMVerifier = ECCVMVerifier_<std::conditional_t<IsRecursive, ECCVMRecursiveFlavor, ECCVMFlavor>>;
    using TranslatorVerifier =
        TranslatorVerifier_<std::conditional_t<IsRecursive, TranslatorRecursiveFlavor, TranslatorFlavor>>;
    using Poseidon2Merge = Poseidon2MergeVerifier_<Curve>;
    using Poseidon2Final = Poseidon2FinalVerifier_<Curve>;

    // Commitment types from merge verifiers
    using EccMergeCommitments = typename EccMergeVerifier::InputCommitments;
    using Poseidon2MergeCommitments = typename Poseidon2Merge::InputCommitments;

    using IPAClaim = OpeningClaim<typename ECCVMVerifier::Curve>;
    using IPAProof = std::conditional_t<IsRecursive, stdlib::Proof<UltraCircuitBuilder>, HonkProof>;

    /**
     * @brief Result of GoblinV2 verification.
     * @details Contains pairing points from all sub-protocols for batched verification.
     */
    struct ReductionResult {
        PairingPoints merge_pairing_points;             // from ECC merge
        PairingPoints translator_pairing_points;        // from Translator
        PairingPoints poseidon2_merge_pairing_points;   // from Poseidon2 merge
        PairingPoints poseidon2_final_pairing_points;   // from Poseidon2 final proof
        IPAClaim ipa_claim;                             // from ECCVM (Grumpkin)
        IPAProof ipa_proof;                             // IPA proof for the claim
        bool all_checks_passed = false;
    };

    GoblinV2Verifier_(std::shared_ptr<Transcript> transcript,
                      const GoblinV2Proof& proof,
                      const EccMergeCommitments& ecc_merge_commitments,
                      const Poseidon2MergeCommitments& poseidon2_merge_commitments,
                      MergeSettings ecc_merge_settings,
                      MergeSettings poseidon2_merge_settings)
        : transcript(std::move(transcript))
        , proof(proof)
        , ecc_merge_commitments(ecc_merge_commitments)
        , poseidon2_merge_commitments(poseidon2_merge_commitments)
        , ecc_merge_settings(ecc_merge_settings)
        , poseidon2_merge_settings(poseidon2_merge_settings)
    {}

    /**
     * @brief Reduce all GoblinV2 proofs to pairing checks + IPA opening claim.
     *
     * @details Verification flow:
     *   1. ECC Merge → KZG pairing points + merged ecc table commitments
     *   2. ECCVM → IPA opening claim + translation input data
     *   3. Translator (using merged ecc commitments) → KZG pairing points
     *   4. Poseidon2 Merge → KZG pairing points + merged poseidon2 table commitments
     *   5. Poseidon2 Final (using merged poseidon2 commitments) → KZG pairing points
     */
    [[nodiscard("Verification result must be accumulated")]]
    ReductionResult reduce_to_pairing_check_and_ipa_opening();

  private:
    std::shared_ptr<Transcript> transcript;
    GoblinV2Proof proof;
    EccMergeCommitments ecc_merge_commitments;
    Poseidon2MergeCommitments poseidon2_merge_commitments;
    MergeSettings ecc_merge_settings;
    MergeSettings poseidon2_merge_settings;
};

using GoblinV2Verifier = GoblinV2Verifier_<curve::BN254>;

} // namespace bb
