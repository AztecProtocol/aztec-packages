// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 0e37cb8}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
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

    AvmVerifier() = default;
    AvmVerifier(AvmVerifier&& other) noexcept;
    AvmVerifier(const AvmVerifier& other) = delete;
    virtual ~AvmVerifier() = default;

    AvmVerifier& operator=(const AvmVerifier& other) = delete;
    AvmVerifier& operator=(AvmVerifier&& other) noexcept;

    bool verify_proof(const HonkProof& proof, const std::vector<std::vector<FF>>& public_inputs);

    std::shared_ptr<VerificationKey> key = std::make_shared<VerificationKey>();
    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>();

  private:
    static FF evaluate_public_input_column(const std::vector<FF>& points, const std::vector<FF>& challenges);
};

} // namespace bb::avm2
