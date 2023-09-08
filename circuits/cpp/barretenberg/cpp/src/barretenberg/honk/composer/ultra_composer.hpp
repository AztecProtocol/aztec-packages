#pragma once

#include "barretenberg/honk/instance/instance.hpp"
#include "barretenberg/honk/proof_system/folding_prover.hpp"
#include "barretenberg/honk/proof_system/folding_verifier.hpp"
#include "barretenberg/honk/proof_system/ultra_prover.hpp"
#include "barretenberg/honk/proof_system/ultra_verifier.hpp"
#include "barretenberg/proof_system/composer/composer_lib.hpp"
#include "barretenberg/proof_system/flavor/flavor.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"

#include <cstddef>
#include <memory>
#include <utility>
#include <vector>

namespace proof_system::honk {
template <UltraFlavor Flavor> class UltraComposer_ {
  public:
    using CircuitBuilder = typename Flavor::CircuitBuilder;
    using ProvingKey = typename Flavor::ProvingKey;
    using VerificationKey = typename Flavor::VerificationKey;
    using PCS = typename Flavor::PCS;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;

    // offset due to placing zero wires at the start of execution trace
    static constexpr size_t num_zero_rows = Flavor::has_zero_row ? 1 : 0;

    static constexpr std::string_view NAME_STRING = "UltraHonk";
    static constexpr size_t NUM_WIRES = CircuitBuilder::NUM_WIRES;
    std::shared_ptr<ProvingKey> proving_key;
    std::shared_ptr<VerificationKey> verification_key;

    // The composer manages the commitment key!
    // The crs_factory holds the path to the srs and exposes methods to extract the srs elements
    std::shared_ptr<srs::factories::CrsFactory<typename Flavor::Curve>> crs_factory_;
    // The commitment key is passed to the prover but also used herein to compute the verfication key commitments
    std::shared_ptr<CommitmentKey> commitment_key;

    UltraComposer_() { crs_factory_ = barretenberg::srs::get_crs_factory(); }

    explicit UltraComposer_(std::shared_ptr<srs::factories::CrsFactory<typename Flavor::Curve>> crs_factory)
        : crs_factory_(std::move(crs_factory))
    {}

    // I don't really want this
    UltraComposer_(std::shared_ptr<ProvingKey> p_key, std::shared_ptr<VerificationKey> v_key)
        : proving_key(std::move(p_key))
        , verification_key(std::move(v_key))
    {}

    UltraComposer_(UltraComposer_&& other) noexcept = default;
    UltraComposer_(UltraComposer_ const& other) noexcept = default;
    UltraComposer_& operator=(UltraComposer_&& other) noexcept = default;
    UltraComposer_& operator=(UltraComposer_ const& other) noexcept = default;
    ~UltraComposer_() = default;

    // TODO: can instances share commitment key?
    void compute_commitment_key(size_t circuit_size)
    {
        commitment_key = std::make_shared<CommitmentKey>(circuit_size);
    };

    Instance<Flavor> create_instance(CircuitBuilder& circuit);
    Instance<Flavor> create_instance(std::shared_ptr<ProvingKey> p_key, std::shared_ptr<VerificationKey> v_key);

    UltraProver_<Flavor> create_prover(Instance<Flavor>& instance);
    UltraVerifier_<Flavor> create_verifier(const Instance<Flavor>& instance);

    // underlying assumption that the first instance should be the one we fold on?
    FoldingProver_<Flavor> create_folding_prover(std::vector<Instance<Flavor>&> instances);
    FoldingVerifier_<Flavor> create_folding_verifier(std::vector<Instance<Flavor>&> instances);
};
extern template class UltraComposer_<honk::flavor::Ultra>;
// TODO: the UltraGrumpkin flavor still works on BN254 because plookup needs to be templated to be able to construct
// Grumpkin circuits.
extern template class UltraComposer_<honk::flavor::UltraGrumpkin>;
extern template class UltraComposer_<honk::flavor::GoblinUltra>;
// TODO(#532): this pattern is weird; is this not instantiating the templates?
using UltraComposer = UltraComposer_<honk::flavor::Ultra>;
using UltraGrumpkinComposer = UltraComposer_<honk::flavor::UltraGrumpkin>;
using GoblinUltraComposer = UltraComposer_<honk::flavor::GoblinUltra>;
} // namespace proof_system::honk
