

#pragma once
#include "barretenberg/plonk/proof_system/types/proof.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/vm/avm_trace/constants.hpp"
#include "barretenberg/vm/generated/copy_flavor.hpp"

namespace bb {
class CopyVerifier {
    using Flavor = CopyFlavor;
    using FF = Flavor::FF;
    using Commitment = Flavor::Commitment;
    using VerificationKey = Flavor::VerificationKey;
    using VerifierCommitmentKey = Flavor::VerifierCommitmentKey;
    using Transcript = Flavor::Transcript;

  public:
    explicit CopyVerifier(std::shared_ptr<VerificationKey> verifier_key = nullptr);
    CopyVerifier(CopyVerifier&& other) noexcept;
    CopyVerifier(const CopyVerifier& other) = delete;

    CopyVerifier& operator=(const CopyVerifier& other) = delete;
    CopyVerifier& operator=(CopyVerifier&& other) noexcept;

    bool verify_proof(const HonkProof& proof);

    std::shared_ptr<VerificationKey> key;
    std::map<std::string, Commitment> commitments;
    std::shared_ptr<VerifierCommitmentKey> pcs_verification_key;
    std::shared_ptr<Transcript> transcript;
};

} // namespace bb
