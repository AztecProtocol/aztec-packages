#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/plonk_honk_shared/types/aggregation_object_type.hpp"
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

    // WORKTODO: Number of bb::fr field elements used to represent a claim over Grumpkin
    static constexpr size_t PUBLIC_INPUTS_SIZE = 10;

    uint32_t set_public()
        requires(std::is_same_v<Curve, stdlib::grumpkin<UltraCircuitBuilder>>)
    {
        uint32_t start_idx = opening_pair.challenge.set_public();
        opening_pair.evaluation.set_public();
        commitment.set_public();

        Builder* ctx = commitment.get_context();
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1325): Eventually the builder/PK/VK will store
        // public input key which should be set here and ipa_claim_public_input_indices should go away.
        uint32_t pub_idx = start_idx;
        for (uint32_t& idx : ctx->ipa_claim_public_input_indices) {
            idx = pub_idx++;
        }
        ctx->contains_ipa_claim = true;

        return start_idx;
    }

    static OpeningClaim<Curve> reconstruct_from_public(
        const std::span<const stdlib::field_t<Builder>, PUBLIC_INPUTS_SIZE>& limbs)
        requires(std::is_same_v<Curve, stdlib::grumpkin<UltraCircuitBuilder>>)
    {
        using BaseField = typename Curve::BaseField;

        const size_t SFS_PER_BF = Fr::PUBLIC_INPUTS_SIZE;
        std::span<const stdlib::field_t<Builder>, SFS_PER_BF> challenge_limbs{ limbs.data(), SFS_PER_BF };
        std::span<const stdlib::field_t<Builder>, SFS_PER_BF> evaluation_limbs{ limbs.data() + SFS_PER_BF, SFS_PER_BF };
        Fr challenge = Fr::reconstruct_from_public(challenge_limbs);
        Fr evaluation = Fr::reconstruct_from_public(evaluation_limbs);

        BaseField x{ limbs[PUBLIC_INPUTS_SIZE - 2] };
        BaseField y{ limbs[PUBLIC_INPUTS_SIZE - 1] };
        Commitment commitment = { x, y, false };

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
