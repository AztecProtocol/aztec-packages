// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/triple_ipa/triple_ipa.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/stdlib/eccvm_verifier/eccvm_recursive_flavor.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"

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
    static constexpr bool IsRecursive = Curve::is_stdlib_type;
    using Builder = std::conditional_t<IsRecursive, typename Flavor::CircuitBuilder, void>;
    using TripleIPA = bb::TripleIPA<Curve, CONST_ECCVM_LOG_N>;
    using TripleIpaAccumulator = typename TripleIPA::VerifierAccumulator;
    using TripleIpaClaim = typename TripleIPA::TripleIpaClaim;
    using TripleIpaProof = std::conditional_t<IsRecursive, stdlib::Proof<UltraCircuitBuilder>, HonkProof>;
    using TranslatorInputData = TranslatorInputData_<FF>;

    struct DeferredTripleIpaOpening {
        using Accumulator = TripleIpaAccumulator;

        TripleIpaClaim claim;
        TripleIpaProof proof;

        TripleIpaAccumulator reduce_to_accumulator() const
            requires(!IsRecursive)
        {
            auto transcript = std::make_shared<NativeTranscript>(proof);
            return TripleIPA::reduce_to_accumulator(claim, transcript);
        }

        TripleIpaAccumulator reduce_verify() const
            requires(IsRecursive)
        {
            auto transcript = std::make_shared<UltraStdlibTranscript>(proof);
            return TripleIPA::reduce_verify(claim, transcript);
        }
    };

    static bool verify_accumulator(const TripleIpaAccumulator& accumulator)
        requires(!IsRecursive)
    {
        auto ipa_vk = ECCVMFlavor::VerifierCommitmentKey{ ECCVMFlavor::ECCVM_FIXED_SIZE };
        return TripleIPA::verify_accumulator(ipa_vk, accumulator);
    }

    static bool batch_verify_accumulators(std::span<const TripleIpaAccumulator> accumulators)
        requires(!IsRecursive)
    {
        auto ipa_vk = ECCVMFlavor::VerifierCommitmentKey{ ECCVMFlavor::ECCVM_FIXED_SIZE };
        return TripleIPA::batch_verify_accumulators(ipa_vk, accumulators);
    }

    /**
     * @brief Result of reducing ECCVM proof to a compact TripleIPA claim.
     * @details Individual check results are logged via vinfo(). The TripleIPA proof is carried separately.
     */
    struct ReductionResult {
        TripleIpaClaim triple_ipa_claim;
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
     * @brief Reduce the ECCVM proof to a compact TripleIPA verifier claim.
     * @details The ECCVM proves correct execution of elliptic curve operations accumulated in the op queue. This method
     * verifies ECCVM internal checks (sumcheck, consistency, etc.) and reconstructs the public TripleIPA claim. The
     * TripleIPA proof is carried separately by callers and reduced/accumulated downstream.
     *
     * @return ReductionResult containing the TripleIPA claim and whether sumcheck, consistency, and masking checks
     * passed.
     */
    [[nodiscard("Verification result must be checked")]] ReductionResult reduce_to_triple_ipa_claim();

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
    // The verifier-side PCS pipeline mirrors the prover: collect all univariate opening claims, reduce them with one
    // Shplonk, then combine the reduced univariate claim with the sumcheck multilinear claims into a TripleIPA claim.
    bool append_libra_opening_claims(const std::array<Commitment, NUM_SMALL_IPA_COMMITMENTS>& libra_commitments,
                                     const std::vector<FF>& multilinear_challenge,
                                     const FF& claimed_libra_evaluation);
    void append_translation_opening_claims(const std::vector<Commitment>& translation_commitments);
    void append_sumcheck_round_opening_claims(const std::vector<Commitment>& sumcheck_round_commitments,
                                              const std::vector<std::array<FF, 3>>& sumcheck_round_evaluations,
                                              const std::vector<FF>& multilinear_challenge);
    void append_pow_masking_opening_claim();
    OpeningClaim<Curve> reduce_univariate_opening_claims();
    TripleIpaClaim compute_triple_ipa_claim(VerifierCommitments& commitments,
                                            SumcheckOutput<Flavor>& sumcheck_output,
                                            const OpeningClaim<Curve>& univariate_opening_claim);
    void compute_accumulated_result();

    std::shared_ptr<VerificationKey> key;
    Proof proof;
    BF vk_hash;
    Commitment pcs_g1_identity; // G1 generator for PCS operations (Shplonk)
    std::shared_ptr<Transcript> transcript;

    // Builder pointer (only used for recursive, nullptr for native)
    std::conditional_t<IsRecursive, Builder*, void*> builder = nullptr;

    std::vector<OpeningClaim<Curve>> univariate_opening_claims;
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
// Retained for call sites that name the TripleIPA verifier explicitly; the ECCVM verifier always uses it.
using ECCVMTripleIpaVerifier = ECCVMVerifier;
using ECCVMTripleIpaRecursiveVerifier = ECCVMRecursiveVerifier;

} // namespace bb
