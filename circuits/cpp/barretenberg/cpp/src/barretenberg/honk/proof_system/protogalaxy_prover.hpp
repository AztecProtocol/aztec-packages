#include "barretenberg/honk/instance/instance.hpp"
#include "barretenberg/proof_system/flavor/flavor.hpp"
#include "barretenberg/proof_system/folding_result.hpp"
namespace proof_system::honk {
template <UltraFlavor Flavor> class ProtoGalaxyProver_ {
  public:
    using FF = typename Flavor::FF;
    using Instance = Instance_<Flavor>;
    using ProverPolynomials = typename Flavor::ProverPolynomials;

    std::vector<Instance&> instances;

    ProverTranscript<FF> transcript;

    explicit ProtoGalaxyProver_(std::vector<Instance&>);

    void prepare_for_folding();

    // TODO: implement this function
    ProverFoldingResult<Flavor> fold_instances();
};
// the folding prover returns the new prover polynomials and the new public inputs(does the verifier do anything)
} // namespace proof_system::honk