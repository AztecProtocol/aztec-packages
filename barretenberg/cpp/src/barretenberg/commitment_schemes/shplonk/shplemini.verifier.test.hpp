#include "../shplonk/shplemini_verifier.hpp"
#include "./mock_transcript.hpp"
#include "barretenberg/commitment_schemes/commitment_key.test.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/ecc/curves/bn254/fq12.hpp"
#include "barretenberg/ecc/curves/types.hpp"
#include "barretenberg/polynomials/polynomial_arithmetic.hpp"
#include <gtest/gtest.h>
#include <utility>

using namespace bb;

namespace {
using Curve = curve::BN254;

class ShpleminiVerifierTests : public CommitmentTest<Curve> {
  public:
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using CK = CommitmentKey<Curve>;
    using VK = VerifierCommitmentKey<Curve>;
    using Polynomial = bb::Polynomial<Fr>;
    using Commitment = typename Curve::AffineElement;
};
} // namespace

#define SHPLEMINI_VERIFIER_TEST

TEST(ShpleminiVerifierTests, AccumulateBatchMulArgumentsCorrectness)
{
    using CurveType = bb::curve::BN254; // Specify the curve type
    bb::ShpleminiVerifier_<CurveType> verifier;

    const size_t n = 8;
    const size_t log_n = 3;

    // Generate test inputs
    auto mle_opening_point = this->random_evaluation_point(log_n);
    auto poly1 = this->random_polynomial(n);
    auto poly2 = this->random_polynomial(n);
    poly2[0] = typename CurveType::ScalarField::zero();

    auto commitment1 = this->commit(poly1);
    auto commitment2 = this->commit(poly2);
    std::vector<typename CurveType::AffineElement> unshifted_commitments = { commitment1, commitment2 };
    std::vector<typename CurveType::AffineElement> shifted_commitments = { commitment2 };

    auto eval1 = poly1.evaluate_mle(mle_opening_point);
    auto eval2 = poly2.evaluate_mle(mle_opening_point);
    auto eval2_shift = poly2.evaluate_mle(mle_opening_point, true);

    std::vector<typename CurveType::ScalarField> multilinear_evaluations = { eval1, eval2, eval2_shift };
    std::vector<typename CurveType::ScalarField> multivariate_challenge = { /* Insert challenge values */ };

    auto transcript = std::make_shared<TranscriptType>(); // Replace TranscriptType with actual type

    // Call the method
    auto output =
        verifier.accumulate_batch_mul_arguments(log_n,
                                                RefSpan<typename CurveType::AffineElement>(unshifted_commitments),
                                                RefSpan<typename CurveType::AffineElement>(shifted_commitments),
                                                RefSpan<typename CurveType::ScalarField>(multilinear_evaluations),
                                                multivariate_challenge,
                                                g1_identity, // Define g1_identity appropriately
                                                transcript);

    // Expected outputs (these should be derived from your knowledge of the input/output relationship)
    std::vector<typename CurveType::AffineElement> expected_commitments = { /* Expected commitments */ };
    std::vector<typename CurveType::ScalarField> expected_scalars = { /* Expected scalars */ };
    auto expected_evaluation_point = /* Expected evaluation point value */;

    // Assertions
    ASSERT_EQ(output.commitments.size(), expected_commitments.size());
    ASSERT_EQ(output.scalars.size(), expected_scalars.size());
    ASSERT_EQ(output.evaluation_point, expected_evaluation_point);

    for (size_t i = 0; i < output.commitments.size(); ++i) {
        EXPECT_EQ(output.commitments[i], expected_commitments[i]);
    }

    for (size_t i = 0; i < output.scalars.size(); ++i) {
        EXPECT_EQ(output.scalars[i], expected_scalars[i]);
    }
}
