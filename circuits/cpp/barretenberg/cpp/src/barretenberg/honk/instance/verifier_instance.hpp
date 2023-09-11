#include "barretenberg/proof_system/flavor/flavor.hpp"
namespace proof_system::honk {
template <UltraFlavor Flavor> class VerifierInstance_ {
    using FF = typename Flavor::FF;
    using VerificationKey = typename Flavor::VerificationKey;
    using FoldingParameters = typename Flavor::FoldingParameters;

    std::shared_ptr<VerificationKey> verification_key;
    std::vector<FF> public_inputs;
    size_t pub_inputs_offset;
    size_t circuit_size;
    FoldingParameters folding_params;
    size_t index;
};
} // namespace proof_system::honk