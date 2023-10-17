

#pragma once
#include "barretenberg/honk/flavor/generated/ExampleRelation_flavor.hpp"
#include "barretenberg/honk/sumcheck/sumcheck.hpp"
#include "barretenberg/plonk/proof_system/types/proof.hpp"

namespace proof_system::honk {
template <typename Flavor> class ExampleRelationVerifier_ {
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;

  public:
    explicit ExampleRelationVerifier_(std::shared_ptr<VerificationKey> verifier_key = nullptr);
    ExampleRelationVerifier_(std::shared_ptr<VerificationKey> key,
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

    ExampleRelationVerifier_(ExampleRelationVerifier_&& other) noexcept;
    ExampleRelationVerifier_(const ExampleRelationVerifier_& other) = delete;
    ExampleRelationVerifier_& operator=(const ExampleRelationVerifier_& other) = delete;
    ExampleRelationVerifier_& operator=(ExampleRelationVerifier_&& other) noexcept;
    ~ExampleRelationVerifier_() = default;

    bool verify_proof(const plonk::proof& proof);

    std::shared_ptr<VerificationKey> key;
    std::map<std::string, Commitment> commitments;
    std::map<std::string, FF> pcs_fr_elements;
    std::shared_ptr<VerifierCommitmentKey> pcs_verification_key;
    VerifierTranscript<FF> transcript;
};

extern template class ExampleRelationVerifier_<honk::flavor::ExampleRelationFlavor>;

using ExampleRelationVerifier = ExampleRelationVerifier_<honk::flavor::ExampleRelationFlavor>;

} // namespace proof_system::honk
