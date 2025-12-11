// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
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

    /**
     * @brief Result of ECCVM verification
     * @details Contains IPA opening claim and aggregate check status.
     * Individual check results are logged internally by the verifier.
     */
    struct VerificationResult {
        OpeningClaim<Curve> ipa_claim;
        bool verified = false; // Aggregate of sumcheck, consistency, and translation masking checks
    };

    // Unified constructor for both native and recursive verification
    // For recursive case, extracts builder from proof elements via get_context()
    ECCVMVerifier_(const std::shared_ptr<Transcript>& transcript, const Proof& proof)
        : proof(proof)
        , transcript(transcript)
    {
        // ECCVM VK is constant
        auto native_vk = std::make_shared<ECCVMFlavor::VerificationKey>();
        if constexpr (IsRecursive) {
            // Extract builder from proof - safe since transcript cannot hash non-witness elements
            builder = proof.back().get_context();
            key = std::make_shared<VerificationKey>(builder, native_vk);
            vk_hash = stdlib::witness_t<Builder>(builder, native_vk->hash());
            key->fix_witness();
            vk_hash.fix_witness();
        } else {
            key = native_vk;
            vk_hash = native_vk->hash();
        }
    }

    [[nodiscard("Verification result should be checked")]] VerificationResult verify_proof();

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
