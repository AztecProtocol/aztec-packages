#pragma once

#include "barretenberg/flavor/multilinear_batching_flavor.hpp"

namespace bb {

struct MultilinearBatchingProverClaim {
    using FF = MultilinearBatchingFlavor::FF;
    using Commitment = MultilinearBatchingFlavor::Commitment;
    using Polynomial = MultilinearBatchingFlavor::Polynomial;
    std::vector<FF> challenge;
    FF non_shifted_evaluation;
    FF shifted_evaluation;
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
    FF non_shifted_evaluation;
    FF shifted_evaluation;
    Commitment non_shifted_commitment;
    Commitment shifted_commitment;

    /**
     * @brief Constructor for instantiating a recursive claim from a native one
     *
     * @tparam RecursiveCurve
     * @param builder
     * @param native_claim
     * @return MultilinearBatchingVerifierClaim
     */
    template <typename RecursiveCurve>
    static MultilinearBatchingVerifierClaim stdlib_from_native(
        typename RecursiveCurve::Builder* builder,
        const MultilinearBatchingVerifierClaim<typename RecursiveCurve::NativeCurve>& native_claim)
        requires Curve::is_stdlib_type
    {
        MultilinearBatchingVerifierClaim<RecursiveCurve> result;

        for (auto& element : native_claim.challenge) {
            result.challenge.emplace_back(FF::from_witness(builder, element));
        }

        result.non_shifted_evaluation = FF::from_witness(builder, native_claim.non_shifted_evaluation);
        result.shifted_evaluation = FF::from_witness(builder, native_claim.shifted_evaluation);
        result.non_shifted_commitment = Commitment::from_witness(builder, native_claim.non_shifted_commitment);
        result.shifted_commitment = Commitment::from_witness(builder, native_claim.shifted_commitment);

        return result;
    }

    /**
     * @brief Return the native claim underlying the recursive one
     */
    template <typename T>
    T get_value()
        requires Curve::is_stdlib_type
    {
        T native_claim;
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

    /**
     * @brief Hash the claim via the transcript mechanism
     */
    template <typename T> FF hash_through_transcript(const std::string& domain_separator, T& transcript) const
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
