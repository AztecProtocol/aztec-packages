// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

namespace bb {

/**
 * @brief Verifier's claim for multilinear batching - contains commitments and evaluation claims.
 * @details Templated on Curve to support both native (BN254) and recursive (stdlib) verification.
 */
template <typename Curve> struct MultilinearBatchingVerifierClaim {
    using FF = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;

    std::vector<FF> challenge;         // Evaluation point r
    FF non_shifted_evaluation;         // Claimed value P(r)
    FF shifted_evaluation;             // Claimed value P_shifted(r)
    Commitment non_shifted_commitment; // Commitment [P]
    Commitment shifted_commitment;     // Commitment [P_shifted]

    /**
     * @brief Construct a recursive claim from a native one.
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
     * @brief Extract native claim from recursive one.
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
     * @brief Tag claim components and hash for origin tagging.
     */
    template <typename Codec, typename HashFn> FF hash_with_origin_tagging(const OriginTag& tag) const
    {
        constexpr bool in_circuit = Curve::is_stdlib_type;
        std::vector<FF> claim_elements;

        auto append_tagged = [&]<typename U>(const U& component) {
            auto frs = bb::tag_and_serialize<in_circuit, Codec>(component, tag);
            claim_elements.insert(claim_elements.end(), frs.begin(), frs.end());
        };

        for (const auto& element : challenge) {
            append_tagged(element);
        }

        append_tagged(non_shifted_evaluation);
        append_tagged(shifted_evaluation);
        append_tagged(non_shifted_commitment);
        append_tagged(shifted_commitment);

        bb::unset_free_witness_tags<in_circuit, FF>(claim_elements);

        return HashFn::hash(claim_elements);
    }

    /**
     * @brief Convenience overload that extracts tag from transcript.
     */
    template <typename TranscriptType> FF hash_with_origin_tagging(const TranscriptType& transcript) const
    {
        const OriginTag tag = bb::extract_transcript_tag(transcript);
        return hash_with_origin_tagging<typename TranscriptType::Codec, typename TranscriptType::HashFunction>(tag);
    }
};

} // namespace bb
