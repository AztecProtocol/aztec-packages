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
    using PCS = typename Flavor::PCS;
    using TranslatorInputData = TranslatorInputData_<FF>;

    static constexpr bool IsRecursive = Curve::is_stdlib_type;
    using Builder = std::conditional_t<IsRecursive, typename Flavor::CircuitBuilder, void>;

    // Proof type from flavor

    // Native constructor
    explicit ECCVMVerifier_(const std::shared_ptr<Transcript>& transcript)
        requires(!IsRecursive)
        : transcript(transcript)
    {}

    // Recursive constructor
    template <typename NativeVK>
    ECCVMVerifier_(Builder* builder,
                   const std::shared_ptr<NativeVK>& native_verifier_key,
                   const std::shared_ptr<Transcript>& transcript)
        requires IsRecursive
        : key(std::make_shared<VerificationKey>(builder, native_verifier_key))
        , vk_hash(stdlib::witness_t<Builder>(builder, native_verifier_key->hash()))
        , builder(builder)
        , transcript(transcript)
    {
        key->fix_witness();
        vk_hash.fix_witness();
    }

    [[nodiscard("IPA claim should be verified/accumulated")]] OpeningClaim<Curve> verify_proof(const Proof& proof);

    void compute_translation_opening_claims(const std::vector<Commitment>& translation_commitments);
    void compute_accumulated_result();

    /**
     * @brief Get the data required by the TranslatorVerifier
     * @return TranslatorInputData containing evaluation_challenge_x, batching_challenge_v, and accumulated_result
     */
    TranslatorInputData get_translator_input_data() const
    {
        return { evaluation_challenge_x, batching_challenge_v, accumulated_result };
    }

    std::shared_ptr<VerificationKey> key = []() {
        if constexpr (IsRecursive) {
            return nullptr;
        } else {
            return std::make_shared<VerificationKey>();
        }
    }();

    BF vk_hash;

    // Builder pointer (only used for recursive, nullptr for native)
    std::conditional_t<IsRecursive, Builder*, void*> builder = nullptr;

    // Final ShplonkVerifier consumes an array consisting of Translation Opening Claims and a
    // `multivariate_to_univariate_opening_claim`
    static constexpr size_t NUM_OPENING_CLAIMS = ECCVMFlavor::NUM_TRANSLATION_OPENING_CLAIMS + 1;
    std::array<OpeningClaim<Curve>, NUM_OPENING_CLAIMS> opening_claims;

    // Verification flags (native only, recursive uses circuit assertions)
    bool sumcheck_verified = false;
    bool consistency_checked = false;
    std::shared_ptr<Transcript> transcript;
    TranslationEvaluations_<FF> translation_evaluations;

    bool translation_masking_consistency_checked = false;

  private:
    // Translation evaluation and batching challenges. They are propagated to the TranslatorVerifier
    FF evaluation_challenge_x;
    FF batching_challenge_v;
    // The value ∑ mᵢ(x) ⋅ vⁱ which needs to be propagated to TranslatorVerifier
    FF translation_masking_term_eval;
    // The accumulated result computed from translation evaluations, to be used by TranslatorVerifier
    FF accumulated_result;
};

// Type alias for native verifier
using ECCVMVerifier = ECCVMVerifier_<ECCVMFlavor>;

// Note: For recursive verifier, use ECCVMVerifier_<ECCVMRecursiveFlavor_<Builder>> directly
// or define alias in the appropriate namespace

} // namespace bb
