

#pragma once
#include "barretenberg/honk/flavor/generated/Fib_flavor.hpp"
#include "barretenberg/honk/sumcheck/sumcheck.hpp"
#include "barretenberg/plonk/proof_system/types/proof.hpp"

namespace proof_system::honk {
template <typename Flavor> class FibVerifier_ {
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using VerificationKey = typename Flavor::VerificationKey;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;

  public:
    explicit FibVerifier_(std::shared_ptr<VerificationKey> verifier_key = nullptr);
    FibVerifier_(std::shared_ptr<VerificationKey> key,
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

    FibVerifier_(FibVerifier_&& other) noexcept;
    FibVerifier_(const FibVerifier_& other) = delete;
    FibVerifier_& operator=(const FibVerifier_& other) = delete;
    FibVerifier_& operator=(FibVerifier_&& other) noexcept;
    ~FibVerifier_() = default;

    bool verify_proof(const plonk::proof& proof);

    std::shared_ptr<VerificationKey> key;
    std::map<std::string, Commitment> commitments;
    std::map<std::string, FF> pcs_fr_elements;
    std::shared_ptr<VerifierCommitmentKey> pcs_verification_key;
    VerifierTranscript<FF> transcript;
};

extern template class FibVerifier_<honk::flavor::FibFlavor>;

using FibVerifier = FibVerifier_<honk::flavor::FibFlavor>;

} // namespace proof_system::honk
