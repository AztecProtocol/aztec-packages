// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/honk/types/aggregation_object_type.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"

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

    // Size of public inputs representation of an opening claim over Grumpkin
    static constexpr size_t PUBLIC_INPUTS_SIZE = IPA_CLAIM_SIZE;

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

        Builder* ctx = commitment.get_context();
        ctx->ipa_claim_public_input_key.start_idx = start_idx;

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
        BB_ASSERT_EQ(2 * Fr::PUBLIC_INPUTS_SIZE + Commitment::PUBLIC_INPUTS_SIZE, PUBLIC_INPUTS_SIZE);

        const size_t FIELD_SIZE = Fr::PUBLIC_INPUTS_SIZE;
        const size_t COMMITMENT_SIZE = Commitment::PUBLIC_INPUTS_SIZE;
        std::span<const stdlib::field_t<Builder>, FIELD_SIZE> challenge_limbs{ limbs.data(), FIELD_SIZE };
        std::span<const stdlib::field_t<Builder>, FIELD_SIZE> evaluation_limbs{ limbs.data() + FIELD_SIZE, FIELD_SIZE };
        std::span<const stdlib::field_t<Builder>, COMMITMENT_SIZE> commitment_limbs{ limbs.data() + 2 * FIELD_SIZE,
                                                                                     COMMITMENT_SIZE };
        auto challenge = Fr::reconstruct_from_public(challenge_limbs);
        auto evaluation = Fr::reconstruct_from_public(evaluation_limbs);
        auto commitment = Commitment::reconstruct_from_public(commitment_limbs);

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
    /**
     * @brief inefficiently check that the claim is correct by recomputing the commitment
     * and evaluating the polynomial in r.
     *
     * @param ck CommitmentKey used
     * @param polynomial the claimed witness polynomial p(X)
     * @return C = Commit(p(X)) && p(r) = v
     */
    bool verify(std::shared_ptr<CK> ck, const bb::Polynomial<Fr>& polynomial) const
    {
        Fr real_eval = polynomial.evaluate(opening_pair.challenge);
        if (real_eval != opening_pair.evaluation) {
            return false;
        }
        // Note: real_commitment is a raw type, while commitment may be a linear combination.
        auto real_commitment = ck->commit(polynomial);
        return (real_commitment == commitment);
    };

    bool operator==(const OpeningClaim& other) const = default;
};

/**
 * @brief An accumulator consisting of the Shplonk evaluation challenge and vectors of commitments and scalars.
 *
 * @details This structure is used in the `reduce_verify_batch_opening_claim` method of KZG or IPA.
 *
 * @tparam Curve: BN254 or Grumpkin.
 */
template <typename Curve> struct BatchOpeningClaim {
    std::vector<typename Curve::AffineElement> commitments;
    std::vector<typename Curve::ScalarField> scalars;
    typename Curve::ScalarField evaluation_point;
};
} // namespace bb
