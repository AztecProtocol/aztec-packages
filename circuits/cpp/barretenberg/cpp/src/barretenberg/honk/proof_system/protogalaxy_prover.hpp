#pragma once
#include "barretenberg/honk/flavor/goblin_ultra.hpp"
#include "barretenberg/honk/flavor/ultra.hpp"
#include "barretenberg/honk/flavor/ultra_grumpkin.hpp"
#include "barretenberg/honk/instance/instance.hpp"
#include "barretenberg/honk/proof_system/folding_result.hpp"
#include "barretenberg/proof_system/flavor/flavor.hpp"
namespace proof_system::honk {
template <UltraFlavor Flavor> class ProtoGalaxyProver_ {
  public:
    using FF = typename Flavor::FF;
    using Instance = Instance_<Flavor>;
    using ProverPolynomials = typename Flavor::ProverPolynomials;

    std::vector<std::shared_ptr<Instance>> instances;

    ProverTranscript<FF> transcript;

    explicit ProtoGalaxyProver_(std::vector<std::shared_ptr<Instance>>);
    ProtoGalaxyProver_(ProtoGalaxyProver_&& other) noexcept = default;
    ProtoGalaxyProver_(ProtoGalaxyProver_ const& other) noexcept = default;
    ProtoGalaxyProver_& operator=(ProtoGalaxyProver_&& other) noexcept = default;
    ProtoGalaxyProver_& operator=(ProtoGalaxyProver_ const& other) noexcept = default;
    ~ProtoGalaxyProver_() = default;

    void prepare_for_folding();

    ProverFoldingResult<Flavor> fold_instances();
};

extern template class ProtoGalaxyProver_<honk::flavor::Ultra>;
extern template class ProtoGalaxyProver_<honk::flavor::UltraGrumpkin>;
extern template class ProtoGalaxyProver_<honk::flavor::GoblinUltra>;
// the folding prover returns the new prover polynomials and the new public inputs(does the verifier do anything)
} // namespace proof_system::honk