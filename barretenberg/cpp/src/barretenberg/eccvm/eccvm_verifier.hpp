#pragma once
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb {
template <typename Flavor> class ECCVMVerifier_ {
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using ProvingKey = typename Flavor::ProvingKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
    using Transcript = typename Flavor::Transcript;

  public:
    explicit ECCVMVerifier_(const std::shared_ptr<VerificationKey>& verifier_key = nullptr);

    explicit ECCVMVerifier_(const std::shared_ptr<ECCVMVerifier_::ProvingKey>& proving_key)
        : ECCVMVerifier_(std::make_shared<ECCVMFlavor::VerificationKey>(proving_key)){};

    bool verify_proof(const HonkProof& proof);

    std::shared_ptr<VerificationKey> key;
    std::map<std::string, Commitment> commitments;
    std::map<std::string, FF> pcs_fr_elements;
    std::shared_ptr<VerifierCommitmentKey> pcs_verification_key;
    std::shared_ptr<Transcript> transcript;
};

using ECCVMVerifier = ECCVMVerifier_<ECCVMFlavor>;

} // namespace bb
