#pragma once

#include "barretenberg/proof_system/composer/composer_lib.hpp"
#include "barretenberg/proof_system/flavor/flavor.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"

namespace proof_system::honk {

template <typename Flavor> class GoblinTranslatorComposer_ {
  public:
    using CircuitBuilder = typename Flavor::CircuitBuilder;
    using ProvingKey = typename Flavor::ProvingKey;
    using VerificationKey = typename Flavor::VerificationKey;
    using PCSParams = typename Flavor::PCSParams;
    using PCS = typename Flavor::PCS;
    using PCSCommitmentKey = typename PCSParams::CommitmentKey;
    using PCSVerificationKey = typename PCSParams::VerificationKey;

    // offset due to placing zero wires at the start of execution trace
    static constexpr size_t num_zero_rows = Flavor::has_zero_row ? 1 : 0;

    static constexpr std::string_view NAME_STRING = "GoblinTranslator";
    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;
    std::shared_ptr<ProvingKey> proving_key;
    std::shared_ptr<VerificationKey> verification_key;

    // The crs_factory holds the path to the srs and exposes methods to extract the srs elements
    std::shared_ptr<srs::factories::CrsFactory<typename Flavor::Curve>> crs_factory_;

    // The commitment key is passed to the prover but also used herein to compute the verfication key commitments
    std::shared_ptr<PCSCommitmentKey> commitment_key;

    bool computed_witness = false;
    size_t total_num_gates = 0; // num_gates + num_pub_inputs + tables + zero_row_offset (used to compute dyadic size)
    size_t dyadic_circuit_size = 0; // final power-of-2 circuit size

    // We only need the standard crs factory. GoblinTranslator is not supposed to be used with Grumpkin
    GoblinTranslatorComposer_() { crs_factory_ = barretenberg::srs::get_crs_factory(); }

    GoblinTranslatorComposer_(std::shared_ptr<ProvingKey> p_key, std::shared_ptr<VerificationKey> v_key)
        : proving_key(std::move(p_key))
        , verification_key(std::move(v_key))
    {}

    GoblinTranslatorComposer_(GoblinTranslatorComposer_&& other) noexcept = default;
    GoblinTranslatorComposer_(GoblinTranslatorComposer_ const& other) noexcept = default;
    GoblinTranslatorComposer_& operator=(GoblinTranslatorComposer_&& other) noexcept = default;
    GoblinTranslatorComposer_& operator=(GoblinTranslatorComposer_ const& other) noexcept = default;
    ~GoblinTranslatorComposer_() = default;

    void compute_circuit_size_parameters(CircuitBuilder& circuit_constructor);

    void compute_witness(CircuitBuilder& circuit_constructor);

    // UltraProver_<Flavor> create_prover(CircuitBuilder& circuit_constructor);
    // UltraVerifier_<Flavor> create_verifier(const CircuitBuilder& circuit_constructor);

    void compute_commitment_key(size_t circuit_size)
    {
        commitment_key = std::make_shared<typename PCSParams::CommitmentKey>(circuit_size, crs_factory_);
    };
}
} // namespace proof_system::honk