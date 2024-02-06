

#pragma once
#include "barretenberg/flavor/generated/Toy_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb {
class ToyVerifier {
    using Flavor = ToyFlavor;
    using FF = Flavor::FF;
    using Commitment = Flavor::Commitment;
    using VerificationKey = Flavor::VerificationKey;
    using VerifierCommitmentKey = Flavor::VerifierCommitmentKey;
    using Transcript = Flavor::Transcript;

  public:
    explicit ToyVerifier(std::shared_ptr<VerificationKey> verifier_key = nullptr);
    ToyVerifier(ToyVerifier&& other) noexcept;
    ToyVerifier(const ToyVerifier& other) = delete;

    ToyVerifier& operator=(const ToyVerifier& other) = delete;
    ToyVerifier& operator=(ToyVerifier&& other) noexcept;

    bool verify_proof(const HonkProof& proof);

    std::shared_ptr<VerificationKey> key;
    std::map<std::string, Commitment> commitments;
    std::shared_ptr<VerifierCommitmentKey> pcs_verification_key;
    std::shared_ptr<Transcript> transcript;
};

} // namespace bb
