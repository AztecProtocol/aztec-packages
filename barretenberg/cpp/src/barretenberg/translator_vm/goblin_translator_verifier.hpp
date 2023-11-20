#pragma once
#include "barretenberg/flavor/goblin_translator.hpp"
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/plonk/proof_system/types/proof.hpp"

namespace proof_system::honk {
class GoblinTranslatorVerifier {
  public:
    using Flavor = honk::flavor::GoblinTranslator;
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using TranslationEvaluations = barretenberg::TranslationEvaluations;

    BF evaluation_input_x = 0;
    BF batching_challenge_v = 0;
    std::shared_ptr<VerificationKey> key;
    std::map<std::string, Commitment> commitments;
    std::map<std::string, FF> pcs_fr_elements;
    std::shared_ptr<VerifierCommitmentKey> pcs_verification_key;
    BaseTranscript<FF> transcript;
    RelationParameters<FF> relation_parameters;

    // WORKTODO: kill these
    explicit GoblinTranslatorVerifier(std::shared_ptr<VerificationKey> verifier_key = nullptr);
    GoblinTranslatorVerifier(GoblinTranslatorVerifier&& other) noexcept;
    GoblinTranslatorVerifier(const GoblinTranslatorVerifier& other) = delete;
    GoblinTranslatorVerifier& operator=(const GoblinTranslatorVerifier& other) = delete;
    GoblinTranslatorVerifier& operator=(GoblinTranslatorVerifier&& other) noexcept;
    ~GoblinTranslatorVerifier() = default;

    void put_translation_data_in_relation_parameters(const uint256_t& evaluation_input_x,
                                                     const BF& batching_challenge_v,
                                                     const uint256_t& accumulated_result)
    {
        constexpr size_t NUM_LIMB_BITS = Flavor::NUM_LIMB_BITS;

        relation_parameters.evaluation_input_x = { evaluation_input_x.slice(0, NUM_LIMB_BITS),
                                                   evaluation_input_x.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
                                                   evaluation_input_x.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
                                                   evaluation_input_x.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4),
                                                   evaluation_input_x };
        relation_parameters.accumulated_result = {
            accumulated_result.slice(0, NUM_LIMB_BITS),
            accumulated_result.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
            accumulated_result.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
            accumulated_result.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4),
        };

        std::vector<uint256_t> uint_batching_challenge_powers;
        uint_batching_challenge_powers.emplace_back(batching_challenge_v);
        auto running_power = batching_challenge_v * batching_challenge_v;
        uint_batching_challenge_powers.emplace_back(running_power);
        running_power *= batching_challenge_v;
        uint_batching_challenge_powers.emplace_back(running_power);
        running_power *= batching_challenge_v;
        uint_batching_challenge_powers.emplace_back(running_power);

        for (size_t i = 0; i < 4; i++) {
            relation_parameters.batching_challenge_v[i] = {
                uint_batching_challenge_powers[i].slice(0, NUM_LIMB_BITS),
                uint_batching_challenge_powers[i].slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
                uint_batching_challenge_powers[i].slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
                uint_batching_challenge_powers[i].slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4),
                uint_batching_challenge_powers[i]
            };
        }
    };
    bool verify_proof(const plonk::proof& proof);
    bool verify_translation(const TranslationEvaluations& translation_evaluations);
};
} // namespace proof_system::honk
