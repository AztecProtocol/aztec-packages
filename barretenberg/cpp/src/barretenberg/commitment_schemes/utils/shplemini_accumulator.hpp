#pragma once
#include <vector>

namespace bb {
/**
 * @brief An accumulator consisting of the Shplonk evaluation challenge and vectors of commitments and scalars.
 *
 * @details This structure is used in the `reduce_verify_shplemini_accumulator` method of KZG or IPA. It allows a chosen
 * Polynomial Commitment Scheme (PCS) to perform a single batch multiplication operation by:
 * 1. Receiving the last commitment \f$ W \f$ from the prover.
 * 2. Adding this commitment to the vector of commitments.
 * 3. Adding \f$ -\text{evaluation\_point} \f$ to the vector of scalars.
 * 4. Performing a single `batch_mul` operation to obtain the pair of pairing points.
 *
 * @tparam Curve: BN254 or Grumpkin.
 */
template <typename Curve> struct ShpleminiAccumulator {
    std::vector<typename Curve::AffineElement> commitments;
    std::vector<typename Curve::ScalarField> scalars;
    typename Curve::ScalarField evaluation_point;
};
} // namespace bb