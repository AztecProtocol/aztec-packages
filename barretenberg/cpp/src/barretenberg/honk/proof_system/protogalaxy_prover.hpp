#pragma once
#include "barretenberg/honk/flavor/goblin_ultra.hpp"
#include "barretenberg/honk/flavor/ultra.hpp"
#include "barretenberg/honk/flavor/ultra_grumpkin.hpp"
#include "barretenberg/honk/instance/prover_instance.hpp"
#include "barretenberg/honk/proof_system/folding_result.hpp"
#include "barretenberg/proof_system/flavor/flavor.hpp"
namespace proof_system::honk {
template <class ProverInstances> class ProtoGalaxyProver_ {
  public:
    using Flavor = typename ProverInstances::Flavor;
    using FF = typename Flavor::FF;
    using Instances = ProverInstances;
    using ProverPolynomials = typename Flavor::ProverPolynomials;

    std::shared_ptr<Instances> instances;

    ProverTranscript<FF> transcript;

    explicit ProtoGalaxyProver_(std::shared_ptr<Instances>);
    ~ProtoGalaxyProver_() = default;

    void prepare_for_folding();

    ProverFoldingResult<Flavor> fold_instances();
};

// extern template class ProtoGalaxyProver_<honk::flavor::Ultra>;
// extern template class ProtoGalaxyProver_<honk::flavor::UltraGrumpkin>;
// extern template class ProtoGalaxyProver_<honk::flavor::GoblinUltra>;
} // namespace proof_system::honk