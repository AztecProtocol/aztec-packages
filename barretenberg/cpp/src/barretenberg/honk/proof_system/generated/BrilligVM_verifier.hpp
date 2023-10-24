

#pragma once
#include "barretenberg/honk/flavor/generated/BrilligVM_flavor.hpp"
#include "barretenberg/honk/sumcheck/sumcheck.hpp"
#include "barretenberg/plonk/proof_system/types/proof.hpp"

namespace proof_system::honk {
template <typename Flavor> class BrilligVMVerifier_ {
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;

  public:
    explicit BrilligVMVerifier_(std::shared_ptr<VerificationKey> verifier_key = nullptr);
    BrilligVMVerifier_(std::shared_ptr<VerificationKey> key,
                       std::map<std::string, Commitment> commitments,
                       std::map<std::string, FF> pcs_fr_elements,
                       std::shared_ptr<VerifierCommitmentKey> pcs_verification_key,
                       VerifierTranscript<FF> transcript)
        : key(std::move(key))
        , commitments(std::move(commitments))
        , pcs_fr_elements(std::move(pcs_fr_elements))
        , pcs_verification_key(std::move(pcs_verification_key))
        , transcript(std::move(transcript))
    {}

    BrilligVMVerifier_(BrilligVMVerifier_&& other) noexcept;
    BrilligVMVerifier_(const BrilligVMVerifier_& other) = delete;
    BrilligVMVerifier_& operator=(const BrilligVMVerifier_& other) = delete;
    BrilligVMVerifier_& operator=(BrilligVMVerifier_&& other) noexcept;
    ~BrilligVMVerifier_() = default;

    bool verify_proof(const plonk::proof& proof);

    std::shared_ptr<VerificationKey> key;
    std::map<std::string, Commitment> commitments;
    std::map<std::string, FF> pcs_fr_elements;
    std::shared_ptr<VerifierCommitmentKey> pcs_verification_key;
    VerifierTranscript<FF> transcript;
};

extern template class BrilligVMVerifier_<honk::flavor::BrilligVMFlavor>;

using BrilligVMVerifier = BrilligVMVerifier_<honk::flavor::BrilligVMFlavor>;

} // namespace proof_system::honk
