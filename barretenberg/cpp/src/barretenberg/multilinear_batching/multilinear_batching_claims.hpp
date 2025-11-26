#pragma once

#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

namespace bb {
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
     * @brief Tag claim components and hash.
     */
    template <typename T>
    FF hash_with_origin_tagging([[maybe_unused]] const std::string& domain_separator, T& transcript) const
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

#ifndef NDEBUG
    bool compare_with_verifier_claim(const MultilinearBatchingVerifierClaim<curve::BN254>& verifier_claim)
    {
        bool is_a_match = true;
        CommitmentKey<curve::BN254> bn254_commitment_key(dyadic_size);

        for (size_t idx = 0;
             auto [prover_challenge, verifier_challenge] : zip_view(challenge, verifier_claim.challenge)) {
            if (prover_challenge != verifier_challenge) {
                info("Challenge mismatch at index ", idx);
                is_a_match = false;
            }
            idx++;
        }

        if (verifier_claim.non_shifted_commitment != bn254_commitment_key.commit(non_shifted_polynomial)) {
            info("Non-shifted commitment mismatch");
            is_a_match = false;
        }

        if (verifier_claim.shifted_commitment != bn254_commitment_key.commit(shifted_polynomial)) {
            info("Shifted commitment mismatch");
            is_a_match = false;
        }

        // Bump the virtual size to compute mle evaluations
        non_shifted_polynomial.increase_virtual_size(1 << challenge.size());
        shifted_polynomial.increase_virtual_size(1 << challenge.size());

        if (verifier_claim.non_shifted_evaluation != non_shifted_polynomial.evaluate_mle(verifier_claim.challenge)) {
            info("Non-shifted evaluation mismatch");
            is_a_match = false;
        }

        if (verifier_claim.shifted_evaluation != shifted_polynomial.evaluate_mle(verifier_claim.challenge, true)) {
            info("Shifted evaluation mismatch");
            is_a_match = false;
        }

        return is_a_match;
    }
#endif
};

} // namespace bb
