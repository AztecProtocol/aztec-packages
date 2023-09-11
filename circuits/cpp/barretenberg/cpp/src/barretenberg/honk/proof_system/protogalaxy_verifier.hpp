#include "barretenberg/honk/transcript/transcript.hpp"
#include "barretenberg/proof_system/flavor/flavor.hpp"
#include "barretenberg/proof_system/folding_result.hpp"

namespace proof_system::honk {
template <UltraFlavor Flavor> class ProtoGalaxyVerifier_ {
  public:
    using FF = typename Flavor::FF;
    using VerificationKey = typename Flavor::VerificationKey;
    std::vector<VerifierInstance> verifier_instances;
    VerifierTranscript<FF> transcript;

    explicit ProtoGalaxyVerifier_(std::vector<VerificationKey> vks);
    VerifierFoldingResult<Flavor> fold_public_parameters();
};
} // namespace proof_system::honk