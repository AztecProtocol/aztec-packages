#include "barretenberg/ecc/scalar_multiplication/sorted_msm.hpp"
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

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

template <typename Curve> class SortedMsmTests : public ::testing::Test {
  public:
};

using Curves = ::testing::Types<curve::BN254, curve::Grumpkin>;

TYPED_TEST_SUITE(SortedMsmTests, Curves);

TYPED_TEST(SortedMsmTests, ComputePointAdditionDenominators)
{
    using Curve = TypeParam;
    using G1 = typename Curve::AffineElement;
    using Fq = typename Curve::BaseField;
    using MsmManager = SortedMsmManager<Curve>;
    using AdditionSequences = typename MsmManager::AdditionSequences;

    const size_t num_points = 5;
    std::array<G1, num_points> points;
    for (auto& point : points) {
        point = G1::random_element();
    }
    std::array<uint64_t, 2> sequence_counts{ 3, 2 };

    AdditionSequences addition_sequences{ sequence_counts, points, {} };

    const size_t num_pairs = 2;
    std::array<Fq, num_pairs> denominators_expected;
    denominators_expected[0] = (points[1].x - points[0].x).invert();
    denominators_expected[1] = (points[4].x - points[3].x).invert();

    std::array<Fq, num_pairs> denominators;
    MsmManager::compute_point_addition_denominators(addition_sequences, denominators);

    for (auto [result, expected] : zip_view(denominators, denominators_expected)) {
        EXPECT_EQ(result, expected);
    }
}

TYPED_TEST(SortedMsmTests, AffineAddWithDenominator)
{
    using Curve = TypeParam;
    using G1 = typename Curve::AffineElement;
    using Fq = typename Curve::BaseField;
    using MsmManager = SortedMsmManager<Curve>;

    G1 point_1 = G1::random_element();
    G1 point_2 = G1::random_element();
    Fq denominator = (point_2.x - point_1.x).invert();

    G1 expected = point_1 + point_2;

    G1 result = MsmManager::affine_add_with_denominator(point_1, point_2, denominator);

    EXPECT_EQ(result, expected);
}

TYPED_TEST(SortedMsmTests, BatchedAffineAddInPlaceSimple)
{
    using Curve = TypeParam;
    using G1 = typename Curve::AffineElement;
    using MsmManager = SortedMsmManager<Curve>;
    using AdditionSequences = typename MsmManager::AdditionSequences;

    const size_t num_points = 2;
    std::array<G1, num_points> points;
    for (auto& point : points) {
        point = G1::random_element();
    }
    std::array<uint64_t, 1> sequence_counts{ 2 };

    AdditionSequences addition_sequences{ sequence_counts, points, {} };

    std::array<G1, 1> expected_points{ points[0] + points[1] };

    MsmManager::batched_affine_add_in_place(addition_sequences);

    for (size_t idx = 0; idx < expected_points.size(); ++idx) {
        EXPECT_EQ(expected_points[idx], points[idx]);
    }
}

TYPED_TEST(SortedMsmTests, BatchedAffineAddInPlace)
{
    using Curve = TypeParam;
    using G1 = typename Curve::AffineElement;
    using MsmManager = SortedMsmManager<Curve>;
    using AdditionSequences = typename MsmManager::AdditionSequences;

    const size_t num_points = 10;
    std::array<G1, num_points> points;
    for (auto& point : points) {
        point = G1::random_element();
    }
    std::array<uint64_t, 3> sequence_counts{ 5, 2, 3 };

    AdditionSequences addition_sequences{ sequence_counts, points, {} };

    std::vector<G1> expected_points;
    size_t point_idx = 0;
    for (auto count : sequence_counts) {
        G1 sum = points[point_idx++];
        for (size_t i = 1; i < count; ++i) {
            sum = sum + points[point_idx++];
        }
        expected_points.emplace_back(sum);
    }

    MsmManager::batched_affine_add_in_place(addition_sequences);

    for (size_t idx = 0; idx < expected_points.size(); ++idx) {
        EXPECT_EQ(expected_points[idx], points[idx]);
    }
}

// TYPED_TEST(ScalarMultiplicationTests, RemoveDuplicates)
// {
//     using Curve = TypeParam;
//     using Element = typename Curve::Element;
//     using AffineElement = typename Curve::AffineElement;
//     using Fr = typename Curve::ScalarField;

//     constexpr size_t num_points = 8192;

//     Fr* scalars = (Fr*)aligned_alloc(32, sizeof(Fr) * num_points);

//     AffineElement* points = (AffineElement*)aligned_alloc(32, sizeof(AffineElement) * (num_points * 2 + 1));

//     std::vector<AffineElement> expected;
//     bool filling_scalars = true;
//     size_t num_filled_scalars = 0;
//     while (filling_scalars) {
//         size_t num_identical_scalars = static_cast<size_t>(engine.get_random_uint64()) % 32 + 1;
//         if (num_filled_scalars + num_identical_scalars > num_points) {
//             num_identical_scalars = num_points - num_filled_scalars;
//         }
//         auto scalar = Fr::random_element();
//         Element accumulator;
//         accumulator.self_set_infinity();
//         for (size_t i = 0; i < num_identical_scalars; ++i) {
//             Element point = G1::random_element();
//             scalars[num_filled_scalars + i] = scalar;
//             points[num_filled_scalars + i] = point;
//             accumulator += point;
//         }
//         expected.push_back(accumulator);
//         num_filled_scalars += num_identical_scalars;
//         if (num_filled_scalars == num_points) {
//             filling_scalars = false;
//         }
//     }

//     // for (size_t i = 0; i < num_points; ++i) {
//     //     scalars[i] = Fr::random_element();
//     //     points[i] = AffineElement(G1::random_element());
//     // }

//     scalar_multiplication::generate_pippenger_point_table<Curve>(points, points, num_points);
//     scalar_multiplication::pippenger_runtime_state<Curve> state(num_points);

//     scalar_multiplication::remove_duplicates<Curve>(
//         std::span<Fr>(scalars, num_points), std::span<AffineElement>(points, num_points), state);

//     AffineElement* result = state.point_pairs_2;

//     for (size_t i = 0; i < expected.size(); ++i) {
//         EXPECT_EQ(result[i], expected[i]);
//     }
// }
