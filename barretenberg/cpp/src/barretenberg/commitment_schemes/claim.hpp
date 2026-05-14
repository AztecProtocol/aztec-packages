// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Khashayar], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/primitives/field/field_conversion.hpp"

namespace bb {
/**
 * @brief Opening pair (r,v) for some witness polynomial p(X) such that p(r) = v
 *
 * @tparam Params for the given commitment scheme
 */
template <typename Curve> class OpeningPair {
    using Fr = typename Curve::ScalarField;

  public:
    Fr challenge;  // r
    Fr evaluation; // v = p(r)

    bool operator==(const OpeningPair& other) const = default;
};

/**
 * @brief Polynomial p and an opening pair (r,v) such that p(r) = v
 *
 * @tparam Params for the given commitment scheme
 */
template <typename Curve> class ProverOpeningClaim {
    using Fr = typename Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

  public:
    Polynomial polynomial;           // p
    OpeningPair<Curve> opening_pair; // (challenge r, evaluation v = p(r))
    // Gemini Folds have to be opened at `challenge` and -`challenge`. Instead of copying a polynomial into 2 claims, we
    // raise the flag that turns on relevant claim processing logic in Shplonk.
    bool gemini_fold = false;
};

/**
 * @brief Unverified claim (C,r,v) for some witness polynomial p(X) such that
 *  - C = Commit(p(X))
 *  - p(r) = v
 *
 * @tparam Params for the given commitment scheme
 */
template <typename Curve> class OpeningClaim {
    using CK = CommitmentKey<Curve>;
    using Commitment = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;

  public:
    using Builder =
        std::conditional_t<std::is_same_v<Curve, stdlib::grumpkin<UltraCircuitBuilder>>, UltraCircuitBuilder, void>;
    // (challenge r, evaluation v = p(r))
    OpeningPair<Curve> opening_pair;
    // commitment to univariate polynomial p(X)
    Commitment commitment;

    static constexpr bool IS_GRUMPKIN =
        std::is_same_v<Curve, curve::Grumpkin> || std::is_same_v<Curve, stdlib::grumpkin<UltraCircuitBuilder>>;
    // Size of public inputs representation of an opening claim over Grumpkin: 2 * 4 + 2 = 10
    static constexpr size_t PUBLIC_INPUTS_SIZE = IS_GRUMPKIN ? GRUMPKIN_OPENING_CLAIM_SIZE : INVALID_PUBLIC_INPUTS_SIZE;

    /**
     * @brief Set the witness indices for the opening claim to public
     * @note Implemented only for an opening claim over Grumpkin for use with IPA.
     *
     */
    uint32_t set_public()
        requires(std::is_same_v<Curve, stdlib::grumpkin<UltraCircuitBuilder>>)
    {
        uint32_t start_idx = opening_pair.challenge.set_public();
        opening_pair.evaluation.set_public();
        commitment.set_public();

        return start_idx;
    }

    /**
     * @brief Reconstruct an opening claim from limbs stored on the public inputs.
     * @note Implemented only for an opening claim over Grumpkin for use with IPA.
     *
     */
    static OpeningClaim<Curve> reconstruct_from_public(
        const std::span<const stdlib::field_t<Builder>, PUBLIC_INPUTS_SIZE>& limbs)
        requires(std::is_same_v<Curve, stdlib::grumpkin<UltraCircuitBuilder>>)
    {
        using field_ct = stdlib::field_t<Builder>;
        using Codec = stdlib::StdlibCodec<field_ct>;
        const size_t FIELD_SIZE = Fr::PUBLIC_INPUTS_SIZE;
        const size_t COMMITMENT_SIZE = Commitment::PUBLIC_INPUTS_SIZE;
        std::span<const field_ct, FIELD_SIZE> challenge_limbs{ limbs.data(), FIELD_SIZE };
        std::span<const field_ct, FIELD_SIZE> evaluation_limbs{ limbs.data() + FIELD_SIZE, FIELD_SIZE };
        std::span<const field_ct, COMMITMENT_SIZE> commitment_limbs{ limbs.data() + 2 * FIELD_SIZE, COMMITMENT_SIZE };
        auto challenge = Codec::template deserialize_from_fields<Fr>(challenge_limbs);
        auto evaluation = Codec::template deserialize_from_fields<Fr>(evaluation_limbs);
        auto commitment = Codec::template deserialize_from_fields<Commitment>(commitment_limbs);

        return OpeningClaim<Curve>{ { challenge, evaluation }, commitment };
    }

    /**
     * @brief Reconstruct a native opening claim from native field elements
     * @note Implemented for native curve::Grumpkin for use with IPA.
     *
     */
    static OpeningClaim<Curve> reconstruct_from_public(const std::span<const bb::fr, PUBLIC_INPUTS_SIZE>& limbs)
        requires(std::is_same_v<Curve, curve::Grumpkin>)
    {
        using Codec = FrCodec;
        const size_t FIELD_SIZE = Fr::PUBLIC_INPUTS_SIZE;
        const size_t COMMITMENT_SIZE = Commitment::PUBLIC_INPUTS_SIZE;
        std::span<const bb::fr, FIELD_SIZE> challenge_limbs{ limbs.data(), FIELD_SIZE };
        std::span<const bb::fr, FIELD_SIZE> evaluation_limbs{ limbs.data() + FIELD_SIZE, FIELD_SIZE };
        std::span<const bb::fr, COMMITMENT_SIZE> commitment_limbs{ limbs.data() + 2 * FIELD_SIZE, COMMITMENT_SIZE };

        Fr challenge = Codec::deserialize_from_fields<Fr>(challenge_limbs);
        Fr evaluation = Codec::deserialize_from_fields<Fr>(evaluation_limbs);
        Commitment commitment = Codec::deserialize_from_fields<Commitment>(commitment_limbs);

        return OpeningClaim<Curve>{ { challenge, evaluation }, commitment };
    }

    auto get_native_opening_claim() const
        requires(Curve::is_stdlib_type)
    {
        return OpeningClaim<typename Curve::NativeCurve>{
            { static_cast<typename Curve::NativeCurve::ScalarField>(opening_pair.challenge.get_value()),
              static_cast<typename Curve::NativeCurve::ScalarField>(opening_pair.evaluation.get_value()) },
            commitment.get_value()
        };
    }

    bool operator==(const OpeningClaim& other) const = default;
};

/**
 * @brief An accumulator consisting of the Shplonk evaluation challenge and vectors of commitments and scalars.
 *
 * @details This structure is used in the `reduce_verify_batch_opening_claim` method of KZG or IPA.
 *
 * @note This structure always represents a zero evaluation claim.
 *
 * @tparam Curve: BN254 or Grumpkin.
 */
template <typename Curve> struct BatchOpeningClaim {

    using Commitment = typename Curve::AffineElement;
    using Scalar = typename Curve::ScalarField;

    std::vector<Commitment> commitments;
    std::vector<Scalar> scalars;
    Scalar evaluation_point;
};

} // namespace bb
