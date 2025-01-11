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
    using Transcript = typename Flavor::Transcript;
    using DeciderVK = DeciderVerificationKey_<Flavor>;
    using DeciderVerifier = DeciderVerifier_<Flavor>;

  public:
    explicit UltraVerifier_(
        const std::shared_ptr<VerificationKey>& verifier_key,
        const std::shared_ptr<VerifierCommitmentKey<curve::Grumpkin>>& ipa_verification_key = nullptr)
        : verification_key(std::make_shared<DeciderVK>(verifier_key))
        , ipa_verification_key(ipa_verification_key)
    {}

    bool verify_proof(const HonkProof& proof, const HonkProof& ipa_proof = {});

    std::shared_ptr<Transcript> transcript{ nullptr };
    std::shared_ptr<DeciderVK> verification_key;
    std::shared_ptr<VerifierCommitmentKey<curve::Grumpkin>> ipa_verification_key;
};

using UltraVerifier = UltraVerifier_<UltraFlavor>;
using UltraRollupVerifier = UltraVerifier_<UltraRollupFlavor>;
using UltraKeccakVerifier = UltraVerifier_<UltraKeccakFlavor>;
using UltraStarknetVerifier = UltraVerifier_<UltraStarknetFlavor>;
using MegaVerifier = UltraVerifier_<MegaFlavor>;
using MegaZKVerifier = UltraVerifier_<MegaZKFlavor>;

} // namespace bb
