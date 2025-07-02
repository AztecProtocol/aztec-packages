// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/stdlib/protogalaxy_verifier/recursive_decider_verification_key.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"

namespace bb::stdlib::recursion::honk {

template <typename Flavor> class OinkRecursiveVerifier_ {
  public:
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using GroupElement = typename Flavor::GroupElement;
    using RecursiveDeciderVK = RecursiveDeciderVerificationKey_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using Builder = typename Flavor::CircuitBuilder;
    using RelationSeparator = typename Flavor::RelationSeparator;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using OinkProof = std::vector<FF>;

    /**
     * @brief Constructs an Oink Recursive Verifier with a transcript that has been instantiated externally.
     * @details Used when oink recursive verification is part of a larger protocol for which a transcript already
     * exists, e.g. Honk recursive verification.
     *
     * @param builder
     * @param verification_key Incomplete verifier verification_key to be completed during verification
     * @param transcript Transcript instantiated with an Oink proof (or a proof that contains an Oink proof).
     * @param domain_separator string used for differentiating verification_keys in the transcript (PG only)
     */
    explicit OinkRecursiveVerifier_(Builder* builder,
                                    const std::shared_ptr<RecursiveDeciderVK>& decider_vk,
                                    const std::shared_ptr<Transcript>& transcript,
                                    std::string domain_separator = "");

    /**
     * @brief Constructs an Oink Recursive Verifier
     *
     * @param builder
     * @param verification_key Incomplete verifier verification_key to be completed during verification
     * @param domain_separator string used for differentiating verification_keys in the transcript (PG only)
     */
    explicit OinkRecursiveVerifier_(Builder* builder,
                                    const std::shared_ptr<RecursiveDeciderVK>& decider_vk,
                                    std::string domain_separator = "");

    /**
     * @brief Constructs an oink recursive verifier circuit for an oink proof assumed to be contained in the transcript.
     *
     */
    void verify();

    /**
     * @brief Constructs an oink recursive verifier circuit for a provided oink proof.
     *
     */
    void verify_proof(const OinkProof& proof);

    std::shared_ptr<RecursiveDeciderVK> decider_vk;
    Builder* builder;
    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>();
    std::string domain_separator; // used in PG to distinguish between verification_keys in transcript
};

} // namespace bb::stdlib::recursion::honk
