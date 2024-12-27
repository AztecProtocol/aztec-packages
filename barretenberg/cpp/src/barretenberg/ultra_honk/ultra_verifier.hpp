#pragma once
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/decider_verification_key.hpp"
#include "barretenberg/ultra_honk/decider_verifier.hpp"

namespace bb {
template <typename Flavor> class UltraVerifier_ {
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using Transcript = typename Flavor::Transcript;
    using DeciderVK = DeciderVerificationKey_<Flavor>;
    using DeciderVerifier = DeciderVerifier_<Flavor>;

  public:
    explicit UltraVerifier_(const std::shared_ptr<VerificationKey>& verifier_key)
        : verification_key(std::make_shared<DeciderVK>(verifier_key))
    {}

    bool verify_proof(const HonkProof& proof);

    std::shared_ptr<Transcript> transcript{ nullptr };
    std::shared_ptr<DeciderVK> verification_key;
};

using UltraVerifier = UltraVerifier_<UltraFlavor>;
using UltraKeccakVerifier = UltraVerifier_<UltraKeccakFlavor>;
using UltraStarknetVerifier = UltraVerifier_<UltraStarknetFlavor>;
using MegaVerifier = UltraVerifier_<MegaFlavor>;

} // namespace bb
