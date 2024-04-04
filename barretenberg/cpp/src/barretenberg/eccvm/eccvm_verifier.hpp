#pragma once
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb {
class ECCVMVerifier {
    using Flavor = ECCVMFlavor;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using ProvingKey = typename Flavor::ProvingKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using Transcript = typename Flavor::Transcript;

  public:
    explicit ECCVMVerifier(const std::shared_ptr<VerificationKey>& verifier_key = nullptr);

    explicit ECCVMVerifier(const std::shared_ptr<ECCVMVerifier::ProvingKey>& proving_key)
        : ECCVMVerifier(std::make_shared<ECCVMFlavor::VerificationKey>(proving_key)){};

    bool verify_proof(const HonkProof& proof);

    std::shared_ptr<VerificationKey> key;
    std::map<std::string, Commitment> commitments;
    std::map<std::string, FF> pcs_fr_elements;
    std::shared_ptr<Transcript> transcript;
};
} // namespace bb
