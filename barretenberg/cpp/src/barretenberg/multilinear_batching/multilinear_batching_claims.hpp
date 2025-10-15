#pragma once

#include "barretenberg/flavor/multilinear_batching_flavor.hpp"

namespace bb {

struct MultilinearBatchingProverClaim {
    using FF = MultilinearBatchingFlavor::FF;
    using Commitment = MultilinearBatchingFlavor::Commitment;
    using Polynomial = MultilinearBatchingFlavor::Polynomial;
    std::vector<FF> challenge;
    FF shifted_evaluation;
    FF non_shifted_evaluation;
    Polynomial non_shifted_polynomial;
    Polynomial shifted_polynomial;
    Commitment non_shifted_commitment;
    Commitment shifted_commitment;
    size_t dyadic_size;
};

template <typename Curve> struct MultilinearBatchingVerifierClaim {
    using FF = Curve::ScalarField;
    using Commitment = Curve::AffineElement;
    std::vector<FF> challenge;
    FF shifted_evaluation;
    FF non_shifted_evaluation;
    Commitment non_shifted_commitment;
    Commitment shifted_commitment;

    MultilinearBatchingVerifierClaim() = default;

    MultilinearBatchingVerifierClaim(const std::vector<FF>& challenge,
                                     const FF& shifted_evaluation,
                                     const FF& non_shifted_evaluation,
                                     const Commitment& non_shifted_commitment,
                                     const Commitment& shifted_commitment)
        : challenge(challenge)
        , shifted_evaluation(shifted_evaluation)
        , non_shifted_evaluation(non_shifted_evaluation)
        , non_shifted_commitment(non_shifted_commitment)
        , shifted_commitment(shifted_commitment)
    {}

    MultilinearBatchingVerifierClaim(auto* builder, const auto& native_claim)
        requires Curve::is_stdlib_type
        : shifted_evaluation(FF::from_witness(builder, native_claim.shifted_evaluation))
        , non_shifted_evaluation(FF::from_witness(builder, native_claim.non_shifted_evaluation))
        , non_shifted_commitment(Commitment::from_witness(builder, native_claim.non_shifted_commitment))
        , shifted_commitment(Commitment::from_witness(builder, native_claim.shifted_commitment))
    {
        for (auto& element : native_claim.challenge) {
            challenge.emplace_back(FF::from_witness(builder, element));
        }
    }

    auto get_value()
        requires Curve::is_stdlib_type
    {
        MultilinearBatchingVerifierClaim<typename Curve::NativeCurve> native_claim;
        native_claim.challenge.reserve(challenge.size());

        for (auto& recursive_challenge : challenge) {
            native_claim.challenge.emplace_back(recursive_challenge.get_value());
        }
        native_claim.non_shifted_evaluation = non_shifted_evaluation.get_value();
        native_claim.shifted_evaluation = shifted_evaluation.get_value();
        native_claim.non_shifted_commitment = non_shifted_commitment.get_value();
        native_claim.shifted_commitment = shifted_commitment.get_value();

        return native_claim;
    }

    FF hash_through_transcript(const std::string& domain_separator, auto& transcript) const
    {
        for (size_t idx = 0; auto& element : challenge) {
            transcript.add_to_independent_hash_buffer(domain_separator + "challenge_" + std::to_string(idx), element);
        }
        transcript.add_to_independent_hash_buffer(domain_separator + "non_shifted_evaluation", non_shifted_evaluation);
        transcript.add_to_independent_hash_buffer(domain_separator + "shifted_evaluation", shifted_evaluation);
        transcript.add_to_independent_hash_buffer(domain_separator + "non_shifted_commitment", non_shifted_commitment);
        transcript.add_to_independent_hash_buffer(domain_separator + "shifted_commmitment", shifted_commitment);

        return transcript.hash_independent_buffer();
    }
};

} // namespace bb
