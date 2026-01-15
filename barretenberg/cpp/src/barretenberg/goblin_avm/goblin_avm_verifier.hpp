// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/goblin/goblin_verifier.hpp"
#include "barretenberg/goblin_avm/types.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"

namespace bb {

/**
 * @brief GoblinAvm verifier
 *
 * @details Orchestrates verification of the two Goblin sub-protocols (as the AVM only doesn't have a merge protocol):
 *   1. ECCVM verification - Proves correct execution of elliptic curve operations
 *   2. Translator verification - Proves consistency between BN254 ↔ Grumpkin field element representations
 *
 * This verifier does NOT perform final verification - it returns reduction results for deferred verification.
 *
 */
class GoblinAvmRecursiveVerifier {
  public:
    using Curve = stdlib::bn254<UltraCircuitBuilder>;
    using Transcript = UltraStdlibTranscript;
    // Verifiers
    using ECCVMVerifier = ECCVMVerifier_<ECCVMRecursiveFlavor>;
    using TranslatorVerifier = TranslatorVerifier_<TranslatorRecursiveFlavor>;
    // Proof and commitment types
    using GoblinProof = GoblinAvmStdlibProof;
    using Commitment = Curve::AffineElement;
    using TableCommitments = std::array<Commitment, UltraCircuitBuilder::NUM_WIRES>;

    /**
     * @brief Result of GoblinAvm verification
     * @details Both pairing and IPA verification deferred for batched verification
     */
    struct ReductionResult {
        using PairingPoints = stdlib::recursion::PairingPoints<Curve>;
        using IPAClaim = OpeningClaim<typename ECCVMVerifier::Curve>;
        using IPAProof = stdlib::Proof<UltraCircuitBuilder>;

        PairingPoints translator_pairing_points; // KZG pairing points from Translator
        IPAClaim ipa_claim;                      // IPA opening claim from ECCVM (Grumpkin curve)
        IPAProof ipa_proof;                      // IPA proof for verifying the claim
    };

    /**
     * @brief Construct a GoblinAvm verifier
     * @param transcript Shared transcript for Fiat-Shamir
     * @param proof The complete GoblinAvm proof containing ECCVM, IPA, and Translator proofs
     * @param table_commitments The commitments to the full table of ECC ops
     */
    GoblinAvmRecursiveVerifier(std::shared_ptr<Transcript> transcript,
                               const GoblinProof& proof,
                               const TableCommitments& table_commitments)

        : transcript(std::move(transcript))
        , proof(proof)
        , table_commitments(table_commitments) {};

    /**
     * @brief Reduce Goblin proof to pairing check and IPA opening claim
     * @details Orchestrates two sub-verifiers in sequence: ECCVM → Translator
     *   - ECCVM: reduces to IPA opening claim (Grumpkin curve)
     *   - Translator: reduces to KZG pairing check
     *
     * @warning Caller must verify translator_pairing_points with a pairing check, and ipa_claim using ipa_proof
     */
    [[nodiscard("Verification result must be accumulated")]] ReductionResult reduce_to_pairing_check_and_ipa_opening();

  private:
    std::shared_ptr<Transcript> transcript;
    GoblinProof proof;
    TableCommitments table_commitments;
};

} // namespace bb
