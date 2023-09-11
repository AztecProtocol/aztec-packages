#include "protogalaxy_verifier.hpp"
namespace proof_system::honk {
template <UltraFlavor Flavor>
ProtoGalaxyVerifier_<Flavor>::ProtoGalaxyVerifier_(std::vector<VerificationKey> vks, std::vector<uint8_t> proof_data)

{
    transcript = VerifierTranscript<FF>{ proof_data };
}
} // namespace proof_system::honk