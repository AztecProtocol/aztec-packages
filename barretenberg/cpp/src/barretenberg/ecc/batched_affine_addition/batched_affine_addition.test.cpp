#include "barretenberg/ecc/batched_affine_addition/batched_affine_addition.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/ecc/scalar_multiplication/point_table.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"
#include "barretenberg/srs/io.hpp"

#include <cstddef>
#include <vector>

namespace bb {

namespace {
auto& engine = numeric::get_debug_randomness();
}

template <typename Curve> class BatchedAffineAdditionTests : public ::testing::Test {

  public:
    using G1 = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;
};

using Curves = ::testing::Types<curve::BN254>;

TYPED_TEST_SUITE(BatchedAffineAdditionTests, Curves);

// // Test method for a single affine addition with provided slope denominator
// TYPED_TEST(BatchedAffineAdditionTests, AffineAddWithDenominator)
// {
//     using Curve = TypeParam;
//     using G1 = typename Curve::AffineElement;
//     using Fq = typename Curve::BaseField;
//     using Sorter = BatchedAffineAddition<Curve>;

//     Sorter msm_sorter;

//     G1 point_1 = G1::random_element();
//     G1 point_2 = G1::random_element();
//     Fq denominator = (point_2.x - point_1.x).invert();

//     G1 expected = point_1 + point_2;

//     G1 result = msm_sorter.affine_add_with_denominator(point_1, point_2, denominator);

//     EXPECT_EQ(result, expected);
// }

TYPED_TEST(BatchedAffineAdditionTests, ReduceSmall)
{
    using Curve = TypeParam;
    using G1 = Curve::AffineElement;
    using BatchedAddition = BatchedAffineAddition<Curve>;

    const size_t num_chunks = 5;
    const size_t chunk_size = 100;
    const size_t input_size = num_chunks * chunk_size;
    std::vector<size_t> sequence_counts(num_chunks, chunk_size);

    // Extract raw SRS points from point point table points
    std::vector<G1> points;
    points.reserve(input_size);
    for (size_t i = 0; i < input_size; ++i) {
        points.emplace_back(G1::random_element());
    }

    // Manually sum the points in each sequence to get the expected result
    std::vector<G1> expected_reduced_points;
    size_t point_idx = 0;
    for (size_t i = 0; i < num_chunks; ++i) {
        G1 sum = G1::infinity();
        for (size_t j = 0; j < chunk_size; ++j) {
            sum = sum + points[point_idx++];
        }
        expected_reduced_points.push_back(sum);
    }

    // Reduce the points using the custom method
    auto reduced_points = BatchedAddition::add_in_place(points, sequence_counts);

    // Check agreement of the reduced points
    for (auto [result, expected] : zip_view(reduced_points, expected_reduced_points)) {
        EXPECT_EQ(result, expected);
    }
}

// Test that the method reduce_msm_inputs can reduce a set of {points, scalars} with duplicate scalars to a reduced set
// of inputs {points', scalars'} such that all scalars in scalars' are unique and that perfoming the MSM on the reduced
// inputs yields the same result as with the original inputs
TYPED_TEST(BatchedAffineAdditionTests, ReduceLarge)
{
    using Curve = TypeParam;
    using G1 = Curve::AffineElement;
    using BatchedAddition = BatchedAffineAddition<Curve>;

    const size_t num_chunks = 5;
    const size_t chunk_size = 100;
    const size_t input_size = num_chunks * chunk_size;
    std::vector<size_t> sequence_counts(num_chunks, chunk_size);

    // Extract raw SRS points from point point table points
    std::vector<G1> points;
    points.reserve(input_size);
    for (size_t i = 0; i < input_size; ++i) {
        points.emplace_back(G1::random_element());
    }

    // Manually sum the points in each sequence to get the expected result
    std::vector<G1> expected_reduced_points;
    size_t point_idx = 0;
    for (size_t i = 0; i < num_chunks; ++i) {
        G1 sum = G1::infinity();
        for (size_t j = 0; j < chunk_size; ++j) {
            sum = sum + points[point_idx++];
        }
        expected_reduced_points.push_back(sum);
    }

    // Reduce the points using the custom method
    auto reduced_points = BatchedAddition::add_in_place(points, sequence_counts);

    // Check agreement of the reduced points
    for (auto [result, expected] : zip_view(reduced_points, expected_reduced_points)) {
        EXPECT_EQ(result, expected);
    }
}
} // namespace bb