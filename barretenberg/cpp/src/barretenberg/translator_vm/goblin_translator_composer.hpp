#pragma once

#include "barretenberg/flavor/goblin_translator.hpp"
#include "barretenberg/proof_system/composer/composer_lib.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/translator_vm/goblin_translator_prover.hpp"
#include "barretenberg/translator_vm/goblin_translator_verifier.hpp"

namespace bb {
class GoblinTranslatorComposer {
  public:
    using Flavor = GoblinTranslatorFlavor;
    using Curve = typename Flavor::Curve;
    using CircuitBuilder = typename Flavor::CircuitBuilder;
    using ProvingKey = typename Flavor::ProvingKey;
    using VerificationKey = typename Flavor::VerificationKey;
    using PCS = typename Flavor::PCS;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using Polynomial = typename Flavor::Polynomial;
    using Transcript = NativeTranscript;

    static constexpr std::string_view NAME_STRING = "GoblinTranslator";
    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;
    // The minimum size of the mini-circuit (or sorted constraints won't work)
    static constexpr size_t MINIMUM_MINI_CIRCUIT_SIZE = 2048;
    std::shared_ptr<ProvingKey> proving_key;
    std::shared_ptr<VerificationKey> verification_key;

    // The crs_factory holds the path to the srs and exposes methods to extract the srs elements
    std::shared_ptr<bb::srs::factories::CrsFactory<Curve>> crs_factory_;

    // The commitment key is passed to the prover but also used herein to compute the verfication key commitments
    std::shared_ptr<CommitmentKey> commitment_key;

    // We only need the standard crs factory. GoblinTranslatorFlavor is not supposed to be used with Grumpkin
    GoblinTranslatorComposer() { crs_factory_ = bb::srs::get_bn254_crs_factory(); }

    GoblinTranslatorComposer(std::shared_ptr<ProvingKey> p_key, std::shared_ptr<VerificationKey> v_key)
        : proving_key(std::move(p_key))
        , verification_key(std::move(v_key))
    {}

    std::shared_ptr<VerificationKey> compute_verification_key(const CircuitBuilder& circuit_builder);

    GoblinTranslatorVerifier create_verifier(
        const CircuitBuilder& circuit_builder,
        const std::shared_ptr<Transcript>& transcript = std::make_shared<Transcript>());
};
} // namespace bb
