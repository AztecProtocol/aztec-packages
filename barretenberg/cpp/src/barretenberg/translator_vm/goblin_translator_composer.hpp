#pragma once

#include "barretenberg/flavor/goblin_translator.hpp"
#include "barretenberg/proof_system/composer/composer_lib.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/translator_vm/goblin_translator_prover.hpp"
#include "barretenberg/translator_vm/goblin_translator_verifier.hpp"
#include <cstddef>

namespace proof_system::honk {
using namespace barretenberg;
template <typename Flavor> class GoblinTranslatorComposer_ {
  public:
    using CircuitBuilder = typename Flavor::CircuitBuilder;
    using ProvingKey = typename Flavor::ProvingKey;
    using VerificationKey = typename Flavor::VerificationKey;
    using PCS = typename Flavor::PCS;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    static constexpr size_t MINI_CIRCUIT_SIZE = Flavor::MINI_CIRCUIT_SIZE;

    static constexpr std::string_view NAME_STRING = "GoblinTranslator";
    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;
    std::shared_ptr<ProvingKey> proving_key;
    std::shared_ptr<VerificationKey> verification_key;

    // The crs_factory holds the path to the srs and exposes methods to extract the srs elements
    std::shared_ptr<srs::factories::CrsFactory<typename Flavor::Curve>> crs_factory_;

    // The commitment key is passed to the prover but also used herein to compute the verfication key commitments
    std::shared_ptr<CommitmentKey> commitment_key;

    bool computed_witness = false;
    size_t total_num_gates = 0;          // num_gates (already include zero row offset) (used to compute dyadic size)
    size_t dyadic_circuit_size = 0;      // final power-of-2 circuit size
    size_t mini_circuit_dyadic_size = 0; // The size of the small circuit that contains non-range constraint relations

    // We only need the standard crs factory. GoblinTranslator is not supposed to be used with Grumpkin
    GoblinTranslatorComposer_() { crs_factory_ = srs::get_crs_factory(); }

    GoblinTranslatorComposer_(std::shared_ptr<ProvingKey> p_key, std::shared_ptr<VerificationKey> v_key)
        : proving_key(std::move(p_key))
        , verification_key(std::move(v_key))
    {}

    GoblinTranslatorComposer_(GoblinTranslatorComposer_&& other) noexcept = default;
    GoblinTranslatorComposer_(GoblinTranslatorComposer_ const& other) noexcept = default;
    GoblinTranslatorComposer_& operator=(GoblinTranslatorComposer_&& other) noexcept = default;
    GoblinTranslatorComposer_& operator=(GoblinTranslatorComposer_ const& other) noexcept = default;
    ~GoblinTranslatorComposer_() = default;

    std::shared_ptr<ProvingKey> compute_proving_key(const CircuitBuilder& circuit_constructor);
    std::shared_ptr<VerificationKey> compute_verification_key(const CircuitBuilder& circuit_constructor);

    void compute_circuit_size_parameters(CircuitBuilder& circuit_constructor);

    void compute_witness(CircuitBuilder& circuit_constructor);

    GoblinTranslatorProver_<Flavor> create_prover(CircuitBuilder& circuit_constructor);
    GoblinTranslatorVerifier_<Flavor> create_verifier(const CircuitBuilder& circuit_constructor);

    std::shared_ptr<CommitmentKey> compute_commitment_key(size_t circuit_size)
    {
        if (commitment_key) {
            return commitment_key;
        }

        commitment_key = std::make_shared<CommitmentKey>(circuit_size, crs_factory_);
        return commitment_key;
    };
};
extern template class GoblinTranslatorComposer_<honk::flavor::GoblinTranslator>;
using GoblinTranslatorComposer = GoblinTranslatorComposer_<honk::flavor::GoblinTranslator>;
} // namespace proof_system::honk