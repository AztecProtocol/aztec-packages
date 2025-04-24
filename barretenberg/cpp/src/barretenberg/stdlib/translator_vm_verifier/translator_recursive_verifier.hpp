// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/goblin/types.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/plonk_recursion/aggregation_state/aggregation_state.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/stdlib/translator_vm_verifier/translator_recursive_flavor.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"

namespace bb {
template <typename Flavor> class TranslatorRecursiveVerifier_ {
  public:
    using FF = typename Flavor::FF;
    using NativeBF = typename Flavor::Curve::BaseFieldNative;
    using Builder = typename Flavor::CircuitBuilder;
    using BF = typename stdlib::bigfield<Builder, typename NativeBF::Params>;
    using Commitment = typename Flavor::Commitment;
    using GroupElement = typename Flavor::GroupElement;
    using VerificationKey = typename Flavor::VerificationKey;
    using NativeVerificationKey = typename Flavor::NativeVerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using RelationSeparator = typename Flavor::RelationSeparator;
    using AggregationObject = stdlib::recursion::aggregation_state<Builder>;
    using TranslationEvaluations = TranslationEvaluations_<BF, FF>;
    using Transcript = typename Flavor::Transcript;
    using RelationParams = ::bb::RelationParameters<FF>;

    std::shared_ptr<VerificationKey> key;
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<VerifierCommitmentKey> pcs_verification_key; // can remove maybe hopefully
    Builder* builder;

    RelationParams relation_parameters;

    TranslatorRecursiveVerifier_(Builder* builder,
                                 const std::shared_ptr<NativeVerificationKey>& native_verifier_key,
                                 const std::shared_ptr<Transcript>& transcript);

    void put_translation_data_in_relation_parameters(const BF& evaluation_input_x,
                                                     const BF& batching_challenge_v,
                                                     const BF& accumulated_result);

    AggregationObject verify_proof(const HonkProof& proof,
                                   const BF& evaluation_input_x,
                                   const BF& batching_challenge_v);

    bool verify_translation(const TranslationEvaluations& translation_evaluations,
                            const BF& translation_masking_term_eval);
};
} // namespace bb
