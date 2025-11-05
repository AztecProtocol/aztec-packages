#pragma once

#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

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

        result.shifted_evaluation = FF::from_witness(builder, native_claim.shifted_evaluation);
        result.non_shifted_evaluation = FF::from_witness(builder, native_claim.non_shifted_evaluation);
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
     * @brief Tag claim components and hash.
     */
    template <typename T>
    FF hash_with_origin_tags([[maybe_unused]] const std::string& domain_separator, T& transcript) const
    {
        using Codec = typename T::Codec;
        std::vector<FF> claim_elements;

        const OriginTag tag = bb::extract_transcript_tag(transcript);

        // Tag, serialize, and append
        auto append_tagged = [&]<typename U>(const U& component) {
            auto frs = bb::tag_and_serialize<T::in_circuit, Codec>(component, tag);
            claim_elements.insert(claim_elements.end(), frs.begin(), frs.end());
        };

        // Tag and serialize all challenge elements
        for (const auto& element : challenge) {
            append_tagged(element);
        }

        // Tag and serialize evaluations and commitments
        append_tagged(non_shifted_evaluation);
        append_tagged(shifted_evaluation);
        append_tagged(non_shifted_commitment);
        append_tagged(shifted_commitment);

        // Sanitize free witness tags before hashing
        bb::unset_free_witness_tags<T::in_circuit, FF>(claim_elements);

        // Hash the tagged elements directly
        return T::HashFunction::hash(claim_elements);
    }
};

} // namespace bb
