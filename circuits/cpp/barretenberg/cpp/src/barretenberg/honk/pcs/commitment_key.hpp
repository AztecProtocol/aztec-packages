#pragma once

/**
 * @brief Provides interfaces for different 'CommitmentKey' classes.
 *
 * TODO(#218)(Mara): This class should handle any modification to the SRS (e.g compute pippenger point table) to
 * simplify the codebase.
 */

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/bn254/pairing.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/numeric/bitop/pow.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/polynomial_arithmetic.hpp"
#include "barretenberg/srs/factories/crs_factory.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"
#include "barretenberg/honk/pcs/commitment_key_new.hpp"
#include "barretenberg/honk/pcs/verification_key_new.hpp"

#include <cstddef>
#include <memory>
#include <string_view>

namespace proof_system::honk::pcs {

namespace kzg {

struct Params {
    using Curve = curve::BN254;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using GroupElement = typename Curve::Element;

    using Polynomial = barretenberg::Polynomial<Fr>;
};

} // namespace kzg

// namespace fake {

// // Define a common trapdoor for both keys
// namespace {
// template <typename G> constexpr typename G::Fr trapdoor(5);
// }

// template <typename G> struct Params {
//     using Fr = typename G::Fr;
//     using Commitment = typename G::affine_element;
//     using GroupElement = typename G::element;

//     using Polynomial = barretenberg::Polynomial<Fr>;

//     template <G> class CommitmentKey;
//     template <G> class VerificationKey;

//     /**
//      * @brief Simulates a KZG CommitmentKey, but where we know the secret trapdoor
//      * which allows us to commit to polynomials using a single group multiplication.
//      *
//      * @tparam G the commitment group
//      */
//     template <G> class CommitmentKey {

//       public:
//         /**
//          * @brief efficiently create a KZG commitment to p(X) using the trapdoor 'secret'
//          * Uses only 1 group scalar multiplication, and 1 polynomial evaluation
//          *
//          *
//          * @param polynomial a univariate polynomial p(X)
//          * @return Commitment computed as C = p(secret)•[1]_1 .
//          */
//         Commitment commit(std::span<const Fr> polynomial)
//         {
//             const Fr eval_secret = barretenberg::polynomial_arithmetic::evaluate(polynomial, trapdoor<G>);
//             return Commitment::one() * eval_secret;
//         };
//     };

//     template <G> class VerificationKey {

//       public:
//         /**
//          * @brief verifies a pairing equation over 2 points using the trapdoor
//          *
//          * @param p0 = P₀
//          * @param p1 = P₁
//          * @return P₀ - x⋅P₁ ≡ [1]
//          */
//         bool pairing_check(const Commitment& p0, const Commitment& p1)
//         {
//             Commitment result = p0 + p1 * trapdoor<G>;
//             return result.is_point_at_infinity();
//         }
//     };
// };
// } // namespace fake

namespace ipa {

struct Params {
    using Curve = curve::Grumpkin;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using GroupElement = typename Curve::Element;

    using Polynomial = barretenberg::Polynomial<Fr>;
};

} // namespace ipa

} // namespace proof_system::honk::pcs
