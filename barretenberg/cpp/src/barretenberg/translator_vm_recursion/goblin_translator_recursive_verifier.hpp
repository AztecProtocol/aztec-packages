#pragma once
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/honk_recursion/transcript/transcript.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/translator_vm/goblin_translator_prover.hpp"
#include "barretenberg/translator_vm_recursion/goblin_translator_recursive_flavor.hpp"

namespace bb {
template <typename Flavor> class GoblinTranslatorRecursiveVerifier_ {
  public:
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using NativeBF = typename Flavor::Curve::BaseFieldNative;
    using Commitment = typename Flavor::Commitment;
    using GroupElement = typename Flavor::GroupElement;
    using VerificationKey = typename Flavor::VerificationKey;
    using NativeVerificationKey = typename Flavor::NativeVerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using Builder = typename Flavor::CircuitBuilder;
    using RelationSeparator = typename Flavor::RelationSeparator;
    using PairingPoints = std::array<GroupElement, 2>;
    using TranslationEvaluations = TranslationEvaluations_<BF>;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;
    using RelationParams = ::bb::RelationParameters<FF>;

    BF evaluation_input_x = 0;
    BF batching_challenge_v = 0;

    std::shared_ptr<VerificationKey> key;
    std::map<std::string, Commitment> commitments;
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<VerifierCommitmentKey> pcs_verification_key; // can remove maybe hopefully
    Builder* builder;

    RelationParams relation_parameters;

    GoblinTranslatorRecursiveVerifier_(Builder* builder,
                                       const std::shared_ptr<NativeVerificationKey>& native_verifier_key,
                                       const NativeBF& translation_batching_challenge);

    void put_translation_data_in_relation_parameters(const BF& evaluation_input_x,
                                                     const BF& batching_challenge_v,
                                                     const BF& accumulated_result);
    // ?? is this the reasonable way to do this? we shall see...
    PairingPoints verify_proof(const HonkProof& proof);

    // ???
    bool verify_translation(const TranslationEvaluations& translation_evaluations);
};
} // namespace bb