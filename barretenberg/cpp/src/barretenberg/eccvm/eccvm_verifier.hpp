// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
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

    // Final ShplonkVerifier consumes an array consisting of Translation Opening Claims and a
    // `multivariate_to_univariate_opening_claim`
    static constexpr size_t NUM_OPENING_CLAIMS = ECCVMFlavor::NUM_TRANSLATION_OPENING_CLAIMS + 1;

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
     * @brief Result of field-only ECCVM verification (everything before the Grumpkin MSMs).
     * @details Contains all data needed by compute_ec_verification():
     *   - Shplemini batch opening claims (to be reduced by IPA MSM)
     *   - Translation opening claims (SmallSubgroupIPA + batched translation + multivariate)
     *   - TranslatorInputData for downstream Translator verification
     *   - pcs_g1_identity (Grumpkin point needed for Shplonk)
     */
    struct FieldVerificationResult {
        BatchOpeningClaim<Curve> sumcheck_batch_opening_claim; // From Shplemini (single claim)
        std::array<OpeningClaim<Curve>, NUM_OPENING_CLAIMS> opening_claims; // Translation + multivariate
        Commitment pcs_g1_identity;                                         // G1 generator for PCS
        TranslatorInputData translator_input_data;
        bool verified = false;

        // Sumcheck round data (for ECCVMFieldCircuit in Chonk_G)
        std::vector<std::array<FF, 3>> round_univariate_evaluations; // {eval_0, eval_1, eval_u_i} per round
        std::vector<FF> round_challenges;                            // u_0, ..., u_{log_n-1}
        FF initial_target_sum;                                       // eval_0[0] + eval_1[0]

        // Shplemini data (for ECCVMFieldCircuit scalar computation)
        FF gemini_batching_challenge;      // ρ
        FF gemini_evaluation_challenge;    // r
        FF shplonk_batching_challenge;     // ν
        FF shplonk_evaluation_challenge;   // z
        std::vector<FF> gemini_fold_neg_evaluations;   // A_j(-r^{2^j})
        std::vector<FF> gemini_fold_pos_evaluations;   // A_j(r^{2^j})
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
     * @brief Reduce the ECCVM proof to an IPA opening claim
     * @details The ECCVM proves correct execution of elliptic curve operations accumulated in the op queue. This method
     * verifies the ECCVM proof's internal checks (sumcheck, translation masking consistency, etc.) and reduces all
     * polynomial opening claims to a single IPA opening claim via Shplemini and Shplonk. This method does NOT perform
     * the final IPA verification - it returns an IPA claim that must be verified externally.
     *
     * @return ReductionResult containing:
     *   - ipa_claim: IPA opening claim to be verified externally (in root rollup or natively)
     *   - reduction_succeeded: true if sumcheck, consistency, and masking checks passed
     */
    [[nodiscard("Verification result must be checked")]] ReductionResult reduce_to_ipa_opening();

    /**
     * @brief Perform field-only ECCVM verification: Sumcheck → Shplemini → translation claims.
     * @details Everything before the Grumpkin MSMs. Returns batch opening claims and translation
     * claims for EC verification, plus TranslatorInputData for downstream use.
     */
    [[nodiscard("Field verification result should be used")]] FieldVerificationResult compute_field_verification();

    /**
     * @brief Perform EC verification: IPA batch reduction + Shplonk → final OpeningClaim<Grumpkin>.
     * @details Takes the field verification result and performs two Grumpkin MSMs:
     *   1. IPA::reduce_batch_opening_claim (Shplemini claims → single OpeningClaim)
     *   2. Shplonk::reduce_verification (all claims → final IPA OpeningClaim)
     */
    OpeningClaim<Curve> compute_ec_verification(FieldVerificationResult&& field_result);

    /**
     * @brief Result of EC verification as a flat batch opening claim (for use in ECCVMECCircuit).
     * @details Contains all Grumpkin commitments and scalars needed for a single batch_mul.
     * The batch_claim.evaluation_point is the Shplonk z_challenge.
     * After batch_mul, the result commitment + (z_challenge, batched_evaluation) form the IPA OpeningClaim.
     */
    struct FlatECResult {
        BatchOpeningClaim<Curve> batch_claim;  // All commitments + scalars for a single batch_mul
        FF batched_evaluation;                 // Batched evaluation at z_challenge (for IPA claim)
    };

    /**
     * @brief Export EC verification as a flat batch claim (suitable for a single batch_mul in circuit).
     * @details Instead of performing the final batch_mul, exports all commitments and scalars
     * so the ECCVMECCircuit can perform a single cycle_group::batch_mul.
     */
    FlatECResult compute_ec_verification_flat(FieldVerificationResult&& field_result);

    /**
     * @brief Get the data required by the TranslatorVerifier
     * @return TranslatorInputData containing evaluation_challenge_x, batching_challenge_v, and accumulated_result
     */
    TranslatorInputData get_translator_input_data() const
    {
        return { evaluation_challenge_x, batching_challenge_v, accumulated_result };
    }

    /**
     * @brief Advance the transcript through all ECCVM proof elements WITHOUT doing verification.
     * @details Reads all proof elements (commitments, evaluations) and derives all challenges
     * from the transcript, advancing its Fiat-Shamir hash state. Does NOT perform sumcheck,
     * Shplemini, or any MSMs. Returns TranslatorInputData computed from the derived challenges.
     *
     * Used in the split Chonk_B circuit: the transcript must advance through the ECCVM proof
     * for Fiat-Shamir continuity before the Translator, but the actual ECCVM verification
     * happens via ECCVMFieldCircuit (Chonk_G) + ECCVMECCircuit (Chonk_B) separately.
     */
    TranslatorInputData advance_transcript_only();

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
