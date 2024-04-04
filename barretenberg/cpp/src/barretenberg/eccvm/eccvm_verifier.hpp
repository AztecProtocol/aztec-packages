#pragma once
#include "barretenberg/eccvm/eccvm_flavor.hpp"

namespace bb::eccvm {
class ECCVMVerifier {

  public:
    explicit ECCVMVerifier(const std::shared_ptr<VerificationKey>& verifier_key)
        : key(verifier_key){};

    explicit ECCVMVerifier(const std::shared_ptr<ProvingKey>& proving_key)
        : ECCVMVerifier(std::make_shared<VerificationKey>(proving_key)){};

    bool verify_proof(const HonkProof& proof);

    std::shared_ptr<VerificationKey> key;
    std::map<std::string, Commitment> commitments;
    std::map<std::string, FF> pcs_fr_elements;
    std::shared_ptr<Transcript> transcript;
};
} // namespace bb::eccvm
