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
    using G1 = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;
    // using Fq = typename Curve::BaseField;

    struct TestData {
        size_t num_points;
        std::vector<G1> points;
        std::vector<Fr> scalars;
        G1 msm_result;
    };

    TestData generate_test_data_from_sequence_counts(std::span<uint64_t> sequence_counts)
    {
        size_t num_points{ 0 };
        std::vector<Fr> scalars;
        for (auto& count : sequence_counts) {
            Fr repeated_scalar = Fr::random_element();
            for (size_t i = 0; i < count; ++i) {
                scalars.emplace_back(repeated_scalar);
                num_points++;
            }
        }

        std::vector<G1> points;
        for (size_t i = 0; i < num_points; ++i) {
            points.emplace_back(G1::random_element());
        }

        G1 msm_result = points[0] * scalars[0];
        for (size_t i = 1; i < num_points; ++i) {
            msm_result = msm_result + points[i] * scalars[i];
        }

        return { num_points, points, scalars, msm_result };
    }
};

using Curves = ::testing::Types<curve::BN254, curve::Grumpkin>;

TYPED_TEST_SUITE(SortedMsmTests, Curves);

TYPED_TEST(SortedMsmTests, AffineAddWithDenominator)
{
    using Curve = TypeParam;
    using G1 = typename Curve::AffineElement;
    using Fq = typename Curve::BaseField;
    using MsmManager = SortedMsmManager<Curve>;

    MsmManager msm_manager;

    G1 point_1 = G1::random_element();
    G1 point_2 = G1::random_element();
    Fq denominator = (point_2.x - point_1.x).invert();

    G1 expected = point_1 + point_2;

    G1 result = msm_manager.affine_add_with_denominator(point_1, point_2, denominator);

    EXPECT_EQ(result, expected);
}

TYPED_TEST(SortedMsmTests, ComputePointAdditionDenominators)
{
    using Curve = TypeParam;
    using Fq = typename Curve::BaseField;
    using MsmManager = SortedMsmManager<Curve>;
    using AdditionSequences = typename MsmManager::AdditionSequences;

    // Generate random MSM inputs based on a set of sequence counts
    std::array<uint64_t, 2> sequence_counts{ 3, 2 };
    auto test_data = TestFixture::generate_test_data_from_sequence_counts(sequence_counts);
    size_t num_points = test_data.num_points;
    auto& points = test_data.points;

    AdditionSequences addition_sequences{ sequence_counts, test_data.points, {} };

    const size_t num_pairs = 2;
    std::array<Fq, num_pairs> denominators_expected;
    denominators_expected[0] = (points[1].x - points[0].x).invert();
    denominators_expected[1] = (points[4].x - points[3].x).invert();

    MsmManager msm_manager(num_points);
    msm_manager.batch_compute_point_addition_slope_inverses(addition_sequences);

    for (size_t i = 0; i < num_pairs; ++i) {
        Fq result = msm_manager.denominators[i];
        Fq expected = denominators_expected[i];
        EXPECT_EQ(result, expected);
    }
}

TYPED_TEST(SortedMsmTests, BatchedAffineAddInPlaceSimple)
{
    using Curve = TypeParam;
    using G1 = typename Curve::AffineElement;
    using MsmManager = SortedMsmManager<Curve>;
    using AdditionSequences = typename MsmManager::AdditionSequences;

    // Generate random MSM inputs based on a set of sequence counts
    std::array<uint64_t, 1> sequence_counts{ 2 };
    auto [num_points, points, scalars, msm_result] =
        TestFixture::generate_test_data_from_sequence_counts(sequence_counts);

    AdditionSequences addition_sequences{ sequence_counts, points, {} };

    std::array<G1, 1> expected_points{ points[0] + points[1] };

    MsmManager msm_manager(num_points);
    msm_manager.batched_affine_add_in_place(addition_sequences);

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

    // Generate random MSM inputs based on a set of sequence counts
    std::array<uint64_t, 3> sequence_counts{ 5, 2, 3 };
    auto [num_points, points, scalars, msm_result] =
        TestFixture::generate_test_data_from_sequence_counts(sequence_counts);

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

    MsmManager msm_manager(num_points);
    msm_manager.batched_affine_add_in_place(addition_sequences);

    for (size_t idx = 0; idx < expected_points.size(); ++idx) {
        EXPECT_EQ(expected_points[idx], points[idx]);
    }
}

TYPED_TEST(SortedMsmTests, GenerateAdditionSequences)
{
    using Curve = TypeParam;
    using G1 = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;
    using MsmManager = SortedMsmManager<Curve>;
    using AdditionSequences = typename MsmManager::AdditionSequences;

    // Generate random MSM inputs based on a set of sequence counts
    std::array<uint64_t, 3> sequence_counts{ 5, 2, 3 };
    auto [num_points, points, scalars, expected_msm_result] =
        TestFixture::generate_test_data_from_sequence_counts(sequence_counts);

    // Randomly shuffle the scalars so duplicates are no longer grouped together
    std::random_device rd;
    std::shuffle(scalars.begin(), scalars.end(), std::default_random_engine(rd()));

    MsmManager msm_manager{ num_points };
    AdditionSequences result = msm_manager.construct_addition_sequences(scalars, points);

    // The resulting sequence counts should match expectation but only as multisets
    std::multiset<Fr> expected_sequence_counts(sequence_counts.begin(), sequence_counts.end());
    std::multiset<Fr> result_sequence_counts(result.sequence_counts.begin(), result.sequence_counts.end());
    EXPECT_EQ(expected_sequence_counts, result_sequence_counts);

    // The result points will be sorted but should match the original as multisets
    std::multiset<G1> expected_points(points.begin(), points.end());
    std::multiset<G1> result_points(result.points.begin(), result.points.end());
    EXPECT_EQ(expected_points, result_points);

    G1 msm_result;
    msm_result.self_set_infinity();
    size_t scalar_idx = 0;
    size_t point_idx = 0;
    for (auto count : result.sequence_counts) {
        for (size_t i = 0; i < count; ++i) {
            msm_result = msm_result + result.points[point_idx] * msm_manager.unique_scalars[scalar_idx];
            point_idx++;
        }
        scalar_idx++;
    }

    EXPECT_EQ(msm_result, expected_msm_result);
}

TYPED_TEST(SortedMsmTests, ReduceMsmInputsSimple)
{
    using Curve = TypeParam;
    using G1 = typename Curve::AffineElement;
    using MsmManager = SortedMsmManager<Curve>;

    // Generate random MSM inputs based on a set of sequence counts
    std::array<uint64_t, 3> sequence_counts{ 5, 2, 3 };
    auto [num_points, points, scalars, expected_msm_result] =
        TestFixture::generate_test_data_from_sequence_counts(sequence_counts);

    // Randomly shuffle the scalars so duplicates are no longer grouped together
    std::random_device rd;
    std::shuffle(scalars.begin(), scalars.end(), std::default_random_engine(rd()));

    MsmManager msm_manager{ num_points };
    auto [result_scalars, result_points] = msm_manager.reduce_msm_inputs(scalars, points);

    G1 msm_result = result_points[0] * result_scalars[0];
    for (size_t i = 1; i < result_points.size(); ++i) {
        msm_result = msm_result + result_points[i] * result_scalars[i];
    }

    EXPECT_EQ(msm_result, expected_msm_result);
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
