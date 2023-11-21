

#pragma once
#include "barretenberg/flavor/generated/AvmMini_flavor.hpp"
#include "barretenberg/plonk/proof_system/types/proof.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace proof_system::honk {
class AvmMiniVerifier {
    using Flavor = honk::flavor::AvmMiniFlavor;
    using FF = Flavor::FF;
    using Commitment = Flavor::Commitment;
    using VerificationKey = Flavor::VerificationKey;
    using VerifierCommitmentKey = Flavor::VerifierCommitmentKey;

  public:
    explicit FibVerifier(std::shared_ptr<VerificationKey> verifier_key = nullptr);
    FibVerifier(FibVerifier&& other) noexcept;
    FibVerifier(const FibVerifier& other) = delete;

    FibVerifier& operator=(const FibVerifier& other) = delete;
    FibVerifier& operator=(FibVerifier&& other) noexcept;

    bool verify_proof(const plonk::proof& proof);

    std::shared_ptr<VerificationKey> key;
    std::map<std::string, Commitment> commitments;
    std::shared_ptr<VerifierCommitmentKey> pcs_verification_key;
    BaseTranscript<FF> transcript;
};

} // namespace proof_system::honk
