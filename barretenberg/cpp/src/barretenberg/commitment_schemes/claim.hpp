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
    // (challenge r, evaluation v = p(r))
    OpeningPair<Curve> opening_pair;
    // commitment to univariate polynomial p(X)
    Commitment commitment;

    IPAClaimIndices get_witness_indices() const
        requires(std::is_same_v<Curve, stdlib::grumpkin<UltraCircuitBuilder>>)
    {
        return { opening_pair.challenge.binary_basis_limbs[0].element.normalize().witness_index,
                 opening_pair.challenge.binary_basis_limbs[1].element.normalize().witness_index,
                 opening_pair.challenge.binary_basis_limbs[2].element.normalize().witness_index,
                 opening_pair.challenge.binary_basis_limbs[3].element.normalize().witness_index,
                 opening_pair.evaluation.binary_basis_limbs[0].element.normalize().witness_index,
                 opening_pair.evaluation.binary_basis_limbs[1].element.normalize().witness_index,
                 opening_pair.evaluation.binary_basis_limbs[2].element.normalize().witness_index,
                 opening_pair.evaluation.binary_basis_limbs[3].element.normalize().witness_index,
                 commitment.x.normalize().witness_index, // no idea if we need these normalize() calls...
                 commitment.y.normalize().witness_index };
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
