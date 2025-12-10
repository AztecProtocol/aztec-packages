// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/goblin/types.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/translator_vm_verifier/translator_recursive_flavor.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"

namespace bb {
class TranslatorRecursiveVerifier {
  public:
    using Flavor = TranslatorRecursiveFlavor;
    using FF = Flavor::FF;
    using NativeBF = Flavor::Curve::BaseFieldNative;
    using Builder = Flavor::CircuitBuilder;
    using Curve = Flavor::Curve;
    using BF = Flavor::BF;
    using Commitment = Flavor::Commitment;
    using GroupElement = Flavor::GroupElement;
    using VerificationKey = Flavor::VerificationKey;
    using NativeVerificationKey = Flavor::NativeVerificationKey;
    using VerifierCommitmentKey = Flavor::VerifierCommitmentKey;
    using PairingPoints = stdlib::recursion::PairingPoints<Curve>;
    using TranslationEvaluations = TranslationEvaluations_<BF>;
    using Transcript = Flavor::Transcript;
    using RelationParams = ::bb::RelationParameters<FF>;
    using StdlibProof = stdlib::Proof<Builder>;

    std::shared_ptr<VerificationKey> key;
    FF vk_hash;
    std::shared_ptr<Transcript> transcript;
    VerifierCommitmentKey pcs_verification_key; // can remove maybe hopefully
    Builder* builder;

    RelationParams relation_parameters;

    TranslatorRecursiveVerifier(Builder* builder,
                                const std::shared_ptr<NativeVerificationKey>& native_verifier_key,
                                const std::shared_ptr<Transcript>& transcript);

    void put_translation_data_in_relation_parameters(const BF& evaluation_input_x,
                                                     const BF& batching_challenge_v,
                                                     const BF& accumulated_result);

    [[nodiscard("Pairing points should be accumulated")]] PairingPoints verify_proof(
        const StdlibProof& proof,
        const BF& evaluation_input_x,
        const BF& batching_challenge_v,
        const BF& accumulated_result,
        const std::array<Commitment, TranslatorFlavor::NUM_OP_QUEUE_WIRES>& op_queue_wire_commitments);
};
} // namespace bb
