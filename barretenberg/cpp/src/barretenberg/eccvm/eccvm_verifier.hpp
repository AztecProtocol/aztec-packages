// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/stdlib/eccvm_verifier/eccvm_recursive_flavor.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"

namespace bb {

/**
 * @brief Unified ECCVM verifier class for both native and recursive verification
 * @tparam Flavor Either ECCVMFlavor (native) or ECCVMRecursiveFlavor (recursive)
 */
template <typename Flavor> class ECCVMVerifier_ {
  public:
    using FF = Flavor::FF;
    using BF = Flavor::BF;
    using Curve = Flavor::Curve;
    using Commitment = Flavor::Commitment;
    using CommitmentLabels = Flavor::CommitmentLabels;
    using Transcript = Flavor::Transcript;
    using VerificationKey = Flavor::VerificationKey;
    using VerifierCommitments = Flavor::VerifierCommitments;
    using VerifierCommitmentKey = Flavor::VerifierCommitmentKey;
    using Proof = Flavor::Proof;
    using PCS = IPA<Curve, CONST_ECCVM_LOG_N>;
    using TranslatorInputData = TranslatorInputData_<FF>;

    static constexpr bool IsRecursive = Curve::is_stdlib_type;
    using Builder = std::conditional_t<IsRecursive, typename Flavor::CircuitBuilder, void>;

    /**
     * @brief Result of reducing ECCVM proof to IPA opening claim
     * @details Contains IPA opening claim for deferred verification and status of internal checks. The IPA claim
     * must be verified externally. Individual check results are logged via vinfo().
     */
    struct ReductionResult {
        OpeningClaim<Curve> ipa_claim;    // IPA opening claim for deferred verification
        bool reduction_succeeded = false; // Aggregate of sumcheck, consistency, and translation masking checks
    };

    /**
     * @brief Deferred IPA opening claim: holds the Shplonk MSM inputs for lazy finalization.
     * @details The batch_opening_claim contains commitments, scalars, and evaluation_point from the
     * Shplonk reduction. Calling finalize() performs batch_mul to produce the commitment, then
     * combines it with the evaluation_point and evaluation to form a complete OpeningClaim for IPA.
     * The evaluation is always 0 for Shplonk (see ShplonkVerifier_ documentation).
     */
    struct DeferredIPAClaim {
        BatchOpeningClaim<Curve> batch_opening_claim; // Commitments + scalars for deferred MSM
        typename Curve::ScalarField evaluation;       // Always 0 for Shplonk

        /** Finalize the deferred MSM to produce a standard OpeningClaim. */
        OpeningClaim<Curve> finalize() const
        {
            auto commitment = Curve::Element::batch_mul(batch_opening_claim.commitments, batch_opening_claim.scalars);
            return { { batch_opening_claim.evaluation_point, evaluation }, commitment };
        }
    };

    /**
     * @brief Result of reducing ECCVM proof to a deferred batch opening claim
     * @details Like ReductionResult, but defers the final Shplonk MSM. The DeferredIPAClaim contains
     * commitments, scalars, and the evaluation that together form the IPA opening claim when finalized.
     * This enables batching: N proofs' deferred claims can be merged into a single MSM.
     */
    struct BatchReductionResult {
        DeferredIPAClaim deferred_ipa_claim; // Deferred Shplonk MSM + evaluation
        bool reduction_succeeded = false;
    };

    // Unified constructor for both native and recursive verification
    // For recursive case, extracts builder from proof elements via get_context()
    ECCVMVerifier_(const std::shared_ptr<Transcript>& transcript, const Proof& proof)
        : proof(proof)
        , transcript(transcript)
    {
        // ECCVM VK is constant
        auto native_vk = std::make_shared<ECCVMFlavor::VerificationKey>();
        // G1 identity is the first point of the SRS (used for PCS operations)
        auto native_pcs_g1_identity = ECCVMFlavor::VerifierCommitmentKey(1).get_g1_identity();
        if constexpr (IsRecursive) {
            builder = proof.back().get_context();
            key = std::make_shared<VerificationKey>(builder, native_vk);
            vk_hash = key->get_hash();
            pcs_g1_identity = Commitment(native_pcs_g1_identity);
        } else {
            key = native_vk;
            vk_hash = native_vk->get_hash();
            pcs_g1_identity = native_pcs_g1_identity;
        }
    }

    /**
     * @brief Reduce the ECCVM proof to an IPA opening claim (with eager Shplonk MSM).
     * @details Delegates to reduce_to_batch_opening_claim() and finalizes the deferred MSM.
     * Returns a standard OpeningClaim ready for IPA verification.
     */
    [[nodiscard("Verification result must be checked")]] ReductionResult reduce_to_ipa_opening();

    /**
     * @brief Reduce the ECCVM proof to a deferred batch opening claim (no final MSM)
     * @details Performs all internal verification (sumcheck, translation masking, Shplemini reduction) but
     * defers the final Shplonk batch_mul. Returns a BatchOpeningClaim whose commitments and scalars can
     * be merged with other proofs' claims for a single batched MSM.
     *
     * @return BatchReductionResult containing the deferred claim and verification status
     */
    [[nodiscard("Batch opening claim must be finalized")]] BatchReductionResult reduce_to_batch_opening_claim();

    /**
     * @brief Get the data required by the TranslatorVerifier
     * @return TranslatorInputData containing evaluation_challenge_x, batching_challenge_v, and accumulated_result
     */
    TranslatorInputData get_translator_input_data() const
    {
        return { evaluation_challenge_x, batching_challenge_v, accumulated_result };
    }

    std::shared_ptr<VerificationKey> get_verification_key() const { return key; }
    std::shared_ptr<Transcript> get_transcript() const { return transcript; }

  private:
    void compute_translation_opening_claims(const std::vector<Commitment>& translation_commitments);
    void compute_accumulated_result();

    std::shared_ptr<VerificationKey> key;
    Proof proof;
    BF vk_hash;
    Commitment pcs_g1_identity; // G1 generator for PCS operations (Shplemini/Shplonk)
    std::shared_ptr<Transcript> transcript;

    // Builder pointer (only used for recursive, nullptr for native)
    std::conditional_t<IsRecursive, Builder*, void*> builder = nullptr;

    // Final ShplonkVerifier consumes an array consisting of Translation Opening Claims and a
    // `multivariate_to_univariate_opening_claim`
    static constexpr size_t NUM_OPENING_CLAIMS = ECCVMFlavor::NUM_TRANSLATION_OPENING_CLAIMS + 1;
    std::array<OpeningClaim<Curve>, NUM_OPENING_CLAIMS> opening_claims;

    TranslationEvaluations_<FF> translation_evaluations;

    // Translation evaluation and batching challenges. Propagated to TranslatorVerifier via get_translator_input_data()
    FF evaluation_challenge_x;
    FF batching_challenge_v;
    FF accumulated_result;

    // Intermediate verification state
    FF translation_masking_term_eval;
    bool translation_masking_consistency_checked = false;
};

// Type aliases
using ECCVMVerifier = ECCVMVerifier_<ECCVMFlavor>;
using ECCVMRecursiveVerifier = ECCVMVerifier_<ECCVMRecursiveFlavor>;

} // namespace bb
