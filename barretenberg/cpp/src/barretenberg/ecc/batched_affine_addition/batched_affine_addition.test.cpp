#include "barretenberg/ecc/batched_affine_addition/batched_affine_addition.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/common/zip_view.hpp"
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

using Curves = ::testing::Types<curve::BN254, curve::Grumpkin>;

TYPED_TEST_SUITE(BatchedAffineAdditionTests, Curves);

// Test the method for summing one or more large sequences of affine EC points in place
TYPED_TEST(BatchedAffineAdditionTests, Reduce)
{
    using Curve = TypeParam;
    using G1 = Curve::AffineElement;
    using BatchedAddition = BatchedAffineAddition<Curve>;

    // Construct a single array of random points containing 5 sequences to be summed
    const size_t num_sequences = 5;
    const size_t sequence_size = 1 << 10;
    const size_t input_size = num_sequences * sequence_size;
    std::vector<size_t> sequence_counts(num_sequences, sequence_size);

    // Extract raw SRS points from point point table points
    std::vector<G1> points;
    points.reserve(input_size);
    for (size_t i = 0; i < input_size; ++i) {
        points.emplace_back(G1::random_element());
    }

    // Manually sum the points in each sequence to get the expected num-sequences-many reduced points
    std::vector<G1> expected_reduced_points;
    size_t point_idx = 0;
    for (size_t i = 0; i < num_sequences; ++i) {
        G1 sum = G1::infinity();
        for (size_t j = 0; j < sequence_size; ++j) {
            sum = sum + points[point_idx++];
        }
        expected_reduced_points.push_back(sum);
    }

    // Reduce the points using the optimized method
    auto reduced_points = BatchedAddition::add_in_place(points, sequence_counts);

    // Check agreement of the reduced points
    for (auto [result, expected] : zip_view(reduced_points, expected_reduced_points)) {
        EXPECT_EQ(result, expected);
    }
}
} // namespace bb