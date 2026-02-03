#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "scalar_multiplication.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace {
auto& engine = numeric::get_randomness();
} // namespace

/**
 * @brief Tests for pippenger safe mode (handle_edge_cases=true) which is used in native batch_mul.
 * These tests verify that pippenger correctly handles scenarios that would fail with the unsafe affine variant:
 * - Duplicate points (same point appears multiple times)
 * - Point and its negation (P + (-P) = infinity)
 * Tests cover sizes both below and above SINGLE_MUL_THRESHOLD (16), which is where the switch from
 * naive small_mul to jacobian pippenger occurs.
 */
template <class Curve> class ScalarMultiplicationSafeModeTest : public ::testing::Test {
  public:
    using Group = typename Curve::Group;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using ScalarField = typename Curve::ScalarField;

    static constexpr size_t num_points = 1000;
    static inline std::vector<AffineElement> generators{};
    static inline std::vector<ScalarField> scalars{};

    static void SetUpTestSuite()
    {
        generators.resize(num_points);
        scalars.resize(num_points);
        for (size_t i = 0; i < num_points; ++i) {
            generators[i] = Group::one * Curve::ScalarField::random_element(&engine);
            scalars[i] = Curve::ScalarField::random_element(&engine);
        }
    };

    void test_duplicate_points_helper(size_t num_pts)
    {
        AffineElement base_point = generators[0];

        std::vector<AffineElement> points(num_pts, base_point);
        std::vector<ScalarField> test_scalars(num_pts);
        ScalarField scalar_sum = ScalarField::zero();

        for (size_t i = 0; i < num_pts; ++i) {
            test_scalars[i] = scalars[i];
            scalar_sum += test_scalars[i];
        }

        PolynomialSpan<ScalarField> scalar_span(0, test_scalars);

        auto result = scalar_multiplication::pippenger<Curve>(scalar_span, points, /*handle_edge_cases=*/true);

        AffineElement expected(base_point * scalar_sum);
        EXPECT_EQ(AffineElement(result), expected) << "Failed for size " << num_pts;
    }

    void test_duplicate_points()
    {
        // Test below SINGLE_MUL_THRESHOLD (16) - uses small_mul
        test_duplicate_points_helper(10);
        // Test above SINGLE_MUL_THRESHOLD - uses jacobian pippenger
        test_duplicate_points_helper(50);
    }

    void test_point_and_negation_helper(size_t num_pairs)
    {
        const size_t num_pts = num_pairs * 2;

        std::vector<AffineElement> points(num_pts);
        std::vector<ScalarField> test_scalars(num_pts);

        // Create pairs of (P, -P) with same scalar - should cancel to zero
        for (size_t i = 0; i < num_pairs; ++i) {
            points[2 * i] = generators[i];
            points[2 * i + 1] = -generators[i];
            test_scalars[2 * i] = ScalarField::one();
            test_scalars[2 * i + 1] = ScalarField::one();
        }

        PolynomialSpan<ScalarField> scalar_span(0, test_scalars);

        auto result = scalar_multiplication::pippenger<Curve>(scalar_span, points, /*handle_edge_cases=*/true);

        EXPECT_EQ(AffineElement(result), Group::affine_point_at_infinity) << "Failed for " << num_pairs << " pairs";
    }

    void test_point_and_negation()
    {
        // Test below SINGLE_MUL_THRESHOLD (16) - 5 pairs = 10 points
        test_point_and_negation_helper(5);
        // Test above SINGLE_MUL_THRESHOLD - 30 pairs = 60 points
        test_point_and_negation_helper(30);
    }

    void test_mixed_duplicates_and_unique()
    {
        // Test sizes: 10 (below SINGLE_MUL_THRESHOLD) and 50 (above threshold)
        for (size_t scale : { size_t{ 1 }, size_t{ 5 } }) {
            const size_t num_dup = 4 * scale;
            const size_t num_cancel_pairs = 2 * scale;
            const size_t num_unique = 4 * scale;
            const size_t num_pts = num_dup + num_cancel_pairs * 2 + num_unique; // 12 or 60

            std::vector<AffineElement> points(num_pts);
            std::vector<ScalarField> test_scalars(num_pts);

            size_t idx = 0;
            // First section: all same point
            for (size_t i = 0; i < num_dup; ++i) {
                points[idx] = generators[0];
                test_scalars[idx] = scalars[i];
                idx++;
            }
            // Middle section: pairs of point and negation
            for (size_t i = 0; i < num_cancel_pairs; ++i) {
                points[idx] = generators[i + 1];
                points[idx + 1] = -generators[i + 1];
                test_scalars[idx] = ScalarField::one();
                test_scalars[idx + 1] = ScalarField::one();
                idx += 2;
            }
            // Last section: unique points
            for (size_t i = 0; i < num_unique; ++i) {
                points[idx] = generators[100 + i];
                test_scalars[idx] = scalars[100 + i];
                idx++;
            }

            PolynomialSpan<ScalarField> scalar_span(0, test_scalars);

            auto result = scalar_multiplication::pippenger<Curve>(scalar_span, points, /*handle_edge_cases=*/true);

            // Compute expected: sum of duplicate scalars * generators[0] + sum of unique
            Element expected;
            expected.self_set_infinity();

            ScalarField first_sum = ScalarField::zero();
            for (size_t i = 0; i < num_dup; ++i) {
                first_sum += scalars[i];
            }
            expected += generators[0] * first_sum;

            for (size_t i = 0; i < num_unique; ++i) {
                expected += generators[100 + i] * scalars[100 + i];
            }

            EXPECT_EQ(AffineElement(result), AffineElement(expected)) << "Failed for size " << num_pts;
        }
    }

    void test_all_same_point_different_scalars()
    {
        // Test both below and above SINGLE_MUL_THRESHOLD (16)
        for (size_t num_pts : { size_t{ 10 }, size_t{ 50 } }) {
            AffineElement base_point = generators[0];

            std::vector<AffineElement> points(num_pts, base_point);
            std::vector<ScalarField> test_scalars(num_pts);

            ScalarField scalar_sum = ScalarField::zero();
            for (size_t i = 0; i < num_pts; ++i) {
                test_scalars[i] = ScalarField::random_element(&engine);
                scalar_sum += test_scalars[i];
            }

            PolynomialSpan<ScalarField> scalar_span(0, test_scalars);

            auto result = scalar_multiplication::pippenger<Curve>(scalar_span, points, /*handle_edge_cases=*/true);

            AffineElement expected(base_point * scalar_sum);
            EXPECT_EQ(AffineElement(result), expected) << "Failed for size " << num_pts;
        }
    }

    void test_empty_input()
    {
        std::vector<AffineElement> points;
        std::vector<ScalarField> test_scalars;

        PolynomialSpan<ScalarField> scalar_span(0, test_scalars);

        auto result = scalar_multiplication::pippenger<Curve>(scalar_span, points, /*handle_edge_cases=*/true);

        EXPECT_EQ(AffineElement(result), Group::affine_point_at_infinity);
    }

    void test_zero_scalars()
    {
        // Test that zero scalars contribute nothing to the result
        for (size_t num_pts : { size_t{ 10 }, size_t{ 50 } }) {
            std::vector<AffineElement> points(num_pts);
            std::vector<ScalarField> test_scalars(num_pts);

            // Half zero scalars, half random
            Element expected;
            expected.self_set_infinity();

            for (size_t i = 0; i < num_pts; ++i) {
                points[i] = generators[i];
                if (i % 2 == 0) {
                    test_scalars[i] = ScalarField::zero();
                    // Zero scalar contributes nothing
                } else {
                    test_scalars[i] = scalars[i];
                    expected += generators[i] * scalars[i];
                }
            }

            PolynomialSpan<ScalarField> scalar_span(0, test_scalars);

            auto result = scalar_multiplication::pippenger<Curve>(scalar_span, points, /*handle_edge_cases=*/true);

            EXPECT_EQ(AffineElement(result), AffineElement(expected)) << "Failed for size " << num_pts;
        }
    }

    void test_all_zero_scalars()
    {
        // All zero scalars should produce infinity
        for (size_t num_pts : { size_t{ 10 }, size_t{ 50 } }) {
            std::vector<AffineElement> points(num_pts);
            std::vector<ScalarField> test_scalars(num_pts, ScalarField::zero());

            for (size_t i = 0; i < num_pts; ++i) {
                points[i] = generators[i];
            }

            PolynomialSpan<ScalarField> scalar_span(0, test_scalars);

            auto result = scalar_multiplication::pippenger<Curve>(scalar_span, points, /*handle_edge_cases=*/true);

            EXPECT_EQ(AffineElement(result), Group::affine_point_at_infinity) << "Failed for size " << num_pts;
        }
    }

    void test_points_at_infinity_in_input()
    {
        // Points at infinity in the input should be handled correctly
        for (size_t num_pts : { size_t{ 12 }, size_t{ 51 } }) {
            std::vector<AffineElement> points(num_pts);
            std::vector<ScalarField> test_scalars(num_pts);

            Element expected;
            expected.self_set_infinity();

            for (size_t i = 0; i < num_pts; ++i) {
                if (i % 3 == 0) {
                    // Every third point is infinity
                    points[i] = Group::affine_point_at_infinity;
                    test_scalars[i] = scalars[i]; // Non-zero scalar, but infinity * s = infinity
                } else {
                    points[i] = generators[i];
                    test_scalars[i] = scalars[i];
                    expected += generators[i] * scalars[i];
                }
            }

            PolynomialSpan<ScalarField> scalar_span(0, test_scalars);

            auto result = scalar_multiplication::pippenger<Curve>(scalar_span, points, /*handle_edge_cases=*/true);

            EXPECT_EQ(AffineElement(result), AffineElement(expected)) << "Failed for size " << num_pts;
        }
    }

    void test_all_points_at_infinity()
    {
        // All points at infinity should produce infinity regardless of scalars
        for (size_t num_pts : { size_t{ 10 }, size_t{ 50 } }) {
            std::vector<AffineElement> points(num_pts, Group::affine_point_at_infinity);
            std::vector<ScalarField> test_scalars(num_pts);

            for (size_t i = 0; i < num_pts; ++i) {
                test_scalars[i] = scalars[i]; // Random non-zero scalars
            }

            PolynomialSpan<ScalarField> scalar_span(0, test_scalars);

            auto result = scalar_multiplication::pippenger<Curve>(scalar_span, points, /*handle_edge_cases=*/true);

            EXPECT_EQ(AffineElement(result), Group::affine_point_at_infinity) << "Failed for size " << num_pts;
        }
    }
};

using CurveTypes = ::testing::Types<bb::curve::BN254, bb::curve::Grumpkin>;
TYPED_TEST_SUITE(ScalarMultiplicationSafeModeTest, CurveTypes);

TYPED_TEST(ScalarMultiplicationSafeModeTest, DuplicatePoints)
{
    TestFixture::test_duplicate_points();
}
TYPED_TEST(ScalarMultiplicationSafeModeTest, PointAndNegation)
{
    TestFixture::test_point_and_negation();
}
TYPED_TEST(ScalarMultiplicationSafeModeTest, MixedDuplicatesAndUnique)
{
    TestFixture::test_mixed_duplicates_and_unique();
}
TYPED_TEST(ScalarMultiplicationSafeModeTest, AllSamePointDifferentScalars)
{
    TestFixture::test_all_same_point_different_scalars();
}
TYPED_TEST(ScalarMultiplicationSafeModeTest, EmptyInput)
{
    TestFixture::test_empty_input();
}
TYPED_TEST(ScalarMultiplicationSafeModeTest, ZeroScalars)
{
    TestFixture::test_zero_scalars();
}
TYPED_TEST(ScalarMultiplicationSafeModeTest, AllZeroScalars)
{
    TestFixture::test_all_zero_scalars();
}
TYPED_TEST(ScalarMultiplicationSafeModeTest, PointsAtInfinityInInput)
{
    TestFixture::test_points_at_infinity_in_input();
}
TYPED_TEST(ScalarMultiplicationSafeModeTest, AllPointsAtInfinity)
{
    TestFixture::test_all_points_at_infinity();
}
