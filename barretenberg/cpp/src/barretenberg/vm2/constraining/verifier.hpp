#pragma once

#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/vm2/constraining/flavor.hpp"

namespace bb::avm2 {

class AvmVerifier {
  public:
    using Flavor = AvmFlavor;
    using FF = Flavor::FF;
    using Commitment = Flavor::Commitment;
    using VerificationKey = Flavor::VerificationKey;
    using VerifierCommitmentKey = Flavor::VerifierCommitmentKey;
    using Transcript = Flavor::Transcript;

    explicit AvmVerifier(std::shared_ptr<VerificationKey> verifier_key);
    AvmVerifier(AvmVerifier&& other) noexcept;
    AvmVerifier(const AvmVerifier& other) = delete;
    virtual ~AvmVerifier() = default;

    AvmVerifier& operator=(const AvmVerifier& other) = delete;
    AvmVerifier& operator=(AvmVerifier&& other) noexcept;

    // Note: all the following methods are virtual to allow Avm2 to tweak the behaviour.
    // We can remove this once the transition is done.
    virtual bool verify_proof(const HonkProof& proof, const std::vector<std::vector<FF>>& public_inputs);

    std::shared_ptr<VerificationKey> key;
    std::map<std::string, Commitment> commitments;
    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>();

  private:
    FF evaluate_public_input_column(const std::vector<FF>& points, std::vector<FF> challenges);
};

} // namespace bb::avm2
