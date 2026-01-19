#include "scalar_multiplication.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/curves/types.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/srs/factories/mem_bn254_crs_factory.hpp"
#include <filesystem>
#include <gtest/gtest.h>

using namespace bb;

namespace {
auto& engine = numeric::get_randomness();
} // namespace

template <class Curve> class ScalarMultiplicationTest : public ::testing::Test {
  public:
    using Group = typename Curve::Group;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using ScalarField = typename Curve::ScalarField;

    static constexpr size_t num_points = 201123;
    static inline std::vector<AffineElement> generators{};
    static inline std::vector<ScalarField> scalars{};

    static AffineElement naive_msm(std::span<ScalarField> input_scalars, std::span<const AffineElement> input_points)
    {
        size_t total_points = input_scalars.size();
        size_t num_threads = get_num_cpus();
        std::vector<Element> expected_accs(num_threads);
        size_t range_per_thread = (total_points + num_threads - 1) / num_threads;
        parallel_for(num_threads, [&](size_t thread_idx) {
            Element expected_thread_acc;
            expected_thread_acc.self_set_infinity();
            size_t start = thread_idx * range_per_thread;
            size_t end = ((thread_idx + 1) * range_per_thread > total_points) ? total_points
                                                                              : (thread_idx + 1) * range_per_thread;
            bool skip = start >= total_points;
            if (!skip) {
                for (size_t i = start; i < end; ++i) {
                    expected_thread_acc += input_points[i] * input_scalars[i];
                }
            }
            expected_accs[thread_idx] = expected_thread_acc;
        });

        Element expected_acc = Element();
        expected_acc.self_set_infinity();
        for (auto& acc : expected_accs) {
            expected_acc += acc;
        }
        return AffineElement(expected_acc);
    }

    static void SetUpTestSuite()
    {
        generators.resize(num_points);
        scalars.resize(num_points);
        parallel_for_range(num_points, [&](size_t start, size_t end) {
            for (size_t i = start; i < end; ++i) {
                generators[i] = Group::one * Curve::ScalarField::random_element(&engine);
                scalars[i] = Curve::ScalarField::random_element(&engine);
            }
        });
        for (size_t i = 0; i < num_points - 1; ++i) {
            ASSERT_EQ(generators[i].x == generators[i + 1].x, false);
        }
    };

    // ======================= Test Methods =======================

    void test_get_scalar_slice()
    {
        constexpr uint32_t fr_size = 254;
        constexpr uint32_t slice_bits = 7;
        constexpr uint32_t num_slices = (fr_size + 6) / 7;
        constexpr uint32_t last_slice_bits = fr_size - ((num_slices - 1) * slice_bits);

        for (size_t x = 0; x < 100; ++x) {
            uint256_t input_u256 = engine.get_random_uint256();
            input_u256.data[3] = input_u256.data[3] & 0x3FFFFFFFFFFFFFFF; // 254 bits
            while (input_u256 > ScalarField::modulus) {
                input_u256 -= ScalarField::modulus;
            }
            std::vector<uint32_t> slices(num_slices);

            uint256_t acc = input_u256;
            for (uint32_t i = 0; i < num_slices; ++i) {
                uint32_t mask = ((1U << slice_bits) - 1U);
                uint32_t shift = slice_bits;
                if (i == 0) {
                    mask = ((1U << last_slice_bits) - 1U);
                    shift = last_slice_bits;
                }
                slices[num_slices - 1 - i] = static_cast<uint32_t>((acc & mask).data[0]);
                acc = acc >> shift;
            }

            ScalarField input(input_u256);
            input.self_from_montgomery_form();

            ASSERT_EQ(input.data[0], input_u256.data[0]);
            ASSERT_EQ(input.data[1], input_u256.data[1]);
            ASSERT_EQ(input.data[2], input_u256.data[2]);
            ASSERT_EQ(input.data[3], input_u256.data[3]);

            for (uint32_t i = 0; i < num_slices; ++i) {
                uint32_t result = scalar_multiplication::MSM<Curve>::get_scalar_slice(input, i, slice_bits);
                EXPECT_EQ(result, slices[i]);
            }
        }
    }

    void test_consume_point_batch()
    {
        const size_t total_points = 30071;
        const size_t num_buckets = 128;

        std::vector<uint64_t> input_point_schedule;
        for (size_t i = 0; i < total_points; ++i) {
            uint64_t bucket = static_cast<uint64_t>(engine.get_random_uint8()) & 0x7f;
            uint64_t schedule = static_cast<uint64_t>(bucket) + (static_cast<uint64_t>(i) << 32);
            input_point_schedule.push_back(schedule);
        }
        typename scalar_multiplication::MSM<Curve>::AffineAdditionData affine_data;
        typename scalar_multiplication::MSM<Curve>::BucketAccumulators bucket_data(num_buckets);
        scalar_multiplication::MSM<Curve>::batch_accumulate_points_into_buckets(
            input_point_schedule, generators, affine_data, bucket_data);

        std::vector<Element> expected_buckets(num_buckets);
        for (auto& e : expected_buckets) {
            e.self_set_infinity();
        }
        for (size_t i = 0; i < total_points; ++i) {
            uint64_t bucket = input_point_schedule[i] & 0xFFFFFFFF;
            EXPECT_LT(static_cast<size_t>(bucket), num_buckets);
            expected_buckets[static_cast<size_t>(bucket)] += generators[i];
        }
        for (size_t i = 0; i < num_buckets; ++i) {
            if (!expected_buckets[i].is_point_at_infinity()) {
                AffineElement expected(expected_buckets[i]);
                EXPECT_EQ(expected, bucket_data.buckets[i]);
            } else {
                EXPECT_FALSE(bucket_data.bucket_exists.get(i));
            }
        }
    }

    void test_consume_point_batch_and_accumulate()
    {
        const size_t total_points = 30071;
        const size_t num_buckets = 128;

        std::vector<uint64_t> input_point_schedule;
        for (size_t i = 0; i < total_points; ++i) {
            uint64_t bucket = static_cast<uint64_t>(engine.get_random_uint8()) & 0x7f;
            uint64_t schedule = static_cast<uint64_t>(bucket) + (static_cast<uint64_t>(i) << 32);
            input_point_schedule.push_back(schedule);
        }
        typename scalar_multiplication::MSM<Curve>::AffineAdditionData affine_data;
        typename scalar_multiplication::MSM<Curve>::BucketAccumulators bucket_data(num_buckets);
        scalar_multiplication::MSM<Curve>::batch_accumulate_points_into_buckets(
            input_point_schedule, generators, affine_data, bucket_data);

        Element result = scalar_multiplication::MSM<Curve>::accumulate_buckets(bucket_data);

        Element expected_acc;
        expected_acc.self_set_infinity();
        size_t num_threads = get_num_cpus();
        std::vector<Element> expected_accs(num_threads);
        size_t range_per_thread = (total_points + num_threads - 1) / num_threads;
        parallel_for(num_threads, [&](size_t thread_idx) {
            Element expected_thread_acc;
            expected_thread_acc.self_set_infinity();
            size_t start = thread_idx * range_per_thread;
            size_t end = (thread_idx == num_threads - 1) ? total_points : (thread_idx + 1) * range_per_thread;
            bool skip = start >= total_points;
            if (!skip) {
                for (size_t i = start; i < end; ++i) {
                    ScalarField scalar = input_point_schedule[i] & 0xFFFFFFFF;
                    expected_thread_acc += generators[i] * scalar;
                }
            }
            expected_accs[thread_idx] = expected_thread_acc;
        });

        for (size_t i = 0; i < num_threads; ++i) {
            expected_acc += expected_accs[i];
        }
        AffineElement expected(expected_acc);
        EXPECT_EQ(AffineElement(result), expected);
    }

    void test_radix_sort_count_zero_entries()
    {
        const size_t total_points = 30071;

        std::vector<uint64_t> input_point_schedule;
        for (size_t i = 0; i < total_points; ++i) {
            uint64_t bucket = static_cast<uint64_t>(engine.get_random_uint8()) & 0x7f;
            uint64_t schedule = static_cast<uint64_t>(bucket) + (static_cast<uint64_t>(i) << 32);
            input_point_schedule.push_back(schedule);
        }

        size_t result = scalar_multiplication::sort_point_schedule_and_count_zero_buckets(
            &input_point_schedule[0], input_point_schedule.size(), 7);

        // Verify zero entry count is correct
        size_t expected = 0;
        for (size_t i = 0; i < total_points; ++i) {
            expected += static_cast<size_t>((input_point_schedule[i] & 0xFFFFFFFF) == 0);
        }
        EXPECT_EQ(result, expected);

        // Verify the array is sorted by bucket index (lower 32 bits)
        for (size_t i = 1; i < total_points; ++i) {
            uint32_t prev_bucket = static_cast<uint32_t>(input_point_schedule[i - 1]);
            uint32_t curr_bucket = static_cast<uint32_t>(input_point_schedule[i]);
            EXPECT_LE(prev_bucket, curr_bucket) << "Array not sorted at index " << i;
        }
    }

    void test_evaluate_pippenger_round()
    {
        const size_t num_pts = 2;
        std::vector<ScalarField> test_scalars(num_pts);
        std::vector<ScalarField> scalars_montgomery(num_pts);
        constexpr uint32_t NUM_BITS_IN_FIELD = fr::modulus.get_msb() + 1;
        constexpr uint32_t normal_slice_size = 7;
        const size_t num_buckets = size_t{ 1 } << normal_slice_size;

        constexpr uint32_t num_rounds = (NUM_BITS_IN_FIELD + normal_slice_size - 1) / normal_slice_size;
        typename scalar_multiplication::MSM<Curve>::AffineAdditionData affine_data;
        typename scalar_multiplication::MSM<Curve>::BucketAccumulators bucket_data(num_buckets);

        // Test only the last round (round_index = num_rounds - 1) since it exercises the edge case
        // where num_bits_in_slice may be smaller than normal_slice_size
        for (uint32_t round_index = num_rounds - 1; round_index < num_rounds; round_index++) {
            const uint32_t num_bits_in_slice =
                (round_index == (num_rounds - 1)) ? (NUM_BITS_IN_FIELD % normal_slice_size) : normal_slice_size;
            for (size_t i = 0; i < num_pts; ++i) {
                uint32_t hi_bit = NUM_BITS_IN_FIELD - (round_index * normal_slice_size);
                uint32_t lo_bit = hi_bit - normal_slice_size;
                if (hi_bit < normal_slice_size) {
                    lo_bit = 0;
                }
                uint64_t slice = engine.get_random_uint64() & ((1 << num_bits_in_slice) - 1);
                uint256_t scalar = uint256_t(slice) << lo_bit;
                ScalarField scalar_nonmontgomery;
                scalar_nonmontgomery.data[0] = scalar.data[0];
                scalar_nonmontgomery.data[1] = scalar.data[1];
                scalar_nonmontgomery.data[2] = scalar.data[2];
                scalar_nonmontgomery.data[3] = scalar.data[3];
                test_scalars[i] = scalar_nonmontgomery;
                test_scalars[i].self_to_montgomery_form();
                scalars_montgomery[i] = test_scalars[i];
            }

            std::vector<uint32_t> indices;
            scalar_multiplication::MSM<Curve>::transform_scalar_and_get_nonzero_scalar_indices(test_scalars, indices);

            for (auto x : indices) {
                ASSERT_LT(x, num_pts);
            }
            std::vector<uint64_t> point_schedule(test_scalars.size());
            typename scalar_multiplication::MSM<Curve>::MSMData msm_data(
                test_scalars, generators, indices, point_schedule);
            Element result;
            result.self_set_infinity();
            scalar_multiplication::MSM<Curve>::evaluate_affine_pippenger_round(
                msm_data, round_index, affine_data, bucket_data, result, normal_slice_size);
            Element expected;
            expected.self_set_infinity();
            for (size_t i = 0; i < num_pts; ++i) {
                expected += (generators[i] * scalars_montgomery[i]);
            }
            uint32_t num_doublings = NUM_BITS_IN_FIELD - (normal_slice_size * (round_index + 1));
            if (round_index == num_rounds - 1) {
                num_doublings = 0;
            }
            for (uint32_t i = 0; i < num_doublings; ++i) {
                result.self_dbl();
            }
            EXPECT_EQ(AffineElement(result), AffineElement(expected));
        }
    }

    void test_pippenger_low_memory()
    {
        std::span<ScalarField> test_scalars(&scalars[0], num_points);
        AffineElement result =
            scalar_multiplication::MSM<Curve>::msm(generators, PolynomialSpan<ScalarField>(0, test_scalars));
        AffineElement expected = naive_msm(test_scalars, generators);
        EXPECT_EQ(result, expected);
    }

    void test_batch_multi_scalar_mul()
    {
        BB_BENCH_NAME("BatchMultiScalarMul");

        const size_t num_msms = static_cast<size_t>(engine.get_random_uint8());
        std::vector<AffineElement> expected(num_msms);

        std::vector<std::vector<ScalarField>> batch_scalars_copies(num_msms);
        std::vector<std::span<const AffineElement>> batch_points_span;
        std::vector<std::span<ScalarField>> batch_scalars_spans;

        size_t vector_offset = 0;
        for (size_t k = 0; k < num_msms; ++k) {
            const size_t num_pts = static_cast<size_t>(engine.get_random_uint16()) % 400;

            ASSERT_LT(vector_offset + num_pts, num_points);
            std::span<const AffineElement> batch_points(&generators[vector_offset], num_pts);

            batch_scalars_copies[k].resize(num_pts);
            for (size_t i = 0; i < num_pts; ++i) {
                batch_scalars_copies[k][i] = scalars[vector_offset + i];
            }

            vector_offset += num_pts;
            batch_points_span.push_back(batch_points);
            batch_scalars_spans.push_back(batch_scalars_copies[k]);

            expected[k] = naive_msm(batch_scalars_spans[k], batch_points_span[k]);
        }

        std::vector<AffineElement> result =
            scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(batch_points_span, batch_scalars_spans);

        EXPECT_EQ(result, expected);
    }

    void test_batch_multi_scalar_mul_sparse()
    {
        const size_t num_msms = 10;
        std::vector<AffineElement> expected(num_msms);

        std::vector<std::vector<ScalarField>> batch_scalars(num_msms);
        std::vector<std::span<const AffineElement>> batch_points_span;
        std::vector<std::span<ScalarField>> batch_scalars_spans;

        for (size_t k = 0; k < num_msms; ++k) {
            const size_t num_pts = 33;
            auto& test_scalars = batch_scalars[k];

            test_scalars.resize(num_pts);

            size_t fixture_offset = k * num_pts;

            std::span<AffineElement> batch_points(&generators[fixture_offset], num_pts);
            for (size_t i = 0; i < 13; ++i) {
                test_scalars[i] = 0;
            }
            for (size_t i = 13; i < 23; ++i) {
                test_scalars[i] = scalars[fixture_offset + i + 13];
            }
            for (size_t i = 23; i < num_pts; ++i) {
                test_scalars[i] = 0;
            }
            batch_points_span.push_back(batch_points);
            batch_scalars_spans.push_back(batch_scalars[k]);

            expected[k] = naive_msm(batch_scalars[k], batch_points);
        }

        std::vector<AffineElement> result =
            scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(batch_points_span, batch_scalars_spans);

        EXPECT_EQ(result, expected);
    }

    void test_msm()
    {
        const size_t start_index = 1234;
        const size_t num_pts = num_points - start_index;

        PolynomialSpan<ScalarField> scalar_span =
            PolynomialSpan<ScalarField>(start_index, std::span<ScalarField>(&scalars[0], num_pts));
        AffineElement result = scalar_multiplication::MSM<Curve>::msm(generators, scalar_span);

        std::span<AffineElement> points(&generators[start_index], num_pts);
        AffineElement expected = naive_msm(scalar_span.span, points);
        EXPECT_EQ(result, expected);
    }

    void test_msm_all_zeroes()
    {
        const size_t start_index = 1234;
        const size_t num_pts = num_points - start_index;
        std::vector<ScalarField> test_scalars(num_pts, ScalarField::zero());

        PolynomialSpan<ScalarField> scalar_span = PolynomialSpan<ScalarField>(start_index, test_scalars);
        AffineElement result = scalar_multiplication::MSM<Curve>::msm(generators, scalar_span);

        EXPECT_EQ(result, Group::affine_point_at_infinity);
    }

    void test_msm_empty_polynomial()
    {
        std::vector<ScalarField> test_scalars;
        std::vector<AffineElement> input_points;
        PolynomialSpan<ScalarField> scalar_span = PolynomialSpan<ScalarField>(0, test_scalars);
        AffineElement result = scalar_multiplication::MSM<Curve>::msm(input_points, scalar_span);

        EXPECT_EQ(result, Group::affine_point_at_infinity);
    }

    void test_scalars_unchanged_after_msm()
    {
        const size_t num_pts = 100;
        std::vector<ScalarField> test_scalars(num_pts);
        std::vector<ScalarField> scalars_copy(num_pts);

        for (size_t i = 0; i < num_pts; ++i) {
            test_scalars[i] = scalars[i];
            scalars_copy[i] = test_scalars[i];
        }

        std::span<const AffineElement> points(&generators[0], num_pts);
        PolynomialSpan<ScalarField> scalar_span(0, test_scalars);

        scalar_multiplication::MSM<Curve>::msm(points, scalar_span);

        for (size_t i = 0; i < num_pts; ++i) {
            EXPECT_EQ(test_scalars[i], scalars_copy[i]) << "Scalar at index " << i << " was modified";
        }
    }

    void test_scalar_one()
    {
        const size_t num_pts = 5;
        std::vector<ScalarField> test_scalars(num_pts, ScalarField::one());
        std::span<const AffineElement> points(&generators[0], num_pts);

        PolynomialSpan<ScalarField> scalar_span(0, test_scalars);
        AffineElement result = scalar_multiplication::MSM<Curve>::msm(points, scalar_span);

        Element expected;
        expected.self_set_infinity();
        for (size_t i = 0; i < num_pts; ++i) {
            expected += points[i];
        }

        EXPECT_EQ(result, AffineElement(expected));
    }

    void test_scalar_minus_one()
    {
        const size_t num_pts = 5;
        std::vector<ScalarField> test_scalars(num_pts, -ScalarField::one());
        std::span<const AffineElement> points(&generators[0], num_pts);

        PolynomialSpan<ScalarField> scalar_span(0, test_scalars);
        AffineElement result = scalar_multiplication::MSM<Curve>::msm(points, scalar_span);

        Element expected;
        expected.self_set_infinity();
        for (size_t i = 0; i < num_pts; ++i) {
            expected -= points[i];
        }

        EXPECT_EQ(result, AffineElement(expected));
    }

    void test_single_point()
    {
        std::vector<ScalarField> test_scalars = { scalars[0] };
        std::span<const AffineElement> points(&generators[0], 1);

        PolynomialSpan<ScalarField> scalar_span(0, test_scalars);
        AffineElement result = scalar_multiplication::MSM<Curve>::msm(points, scalar_span);

        AffineElement expected(points[0] * test_scalars[0]);
        EXPECT_EQ(result, expected);
    }

    void test_size_thresholds()
    {
        std::vector<size_t> test_sizes = { 1, 2, 15, 16, 17, 50, 127, 128, 129, 256, 512 };

        for (size_t num_pts : test_sizes) {
            ASSERT_LE(num_pts, num_points);

            std::vector<ScalarField> test_scalars(num_pts);
            for (size_t i = 0; i < num_pts; ++i) {
                test_scalars[i] = scalars[i];
            }

            std::span<const AffineElement> points(&generators[0], num_pts);
            PolynomialSpan<ScalarField> scalar_span(0, test_scalars);

            AffineElement result = scalar_multiplication::MSM<Curve>::msm(points, scalar_span);
            AffineElement expected = naive_msm(test_scalars, points);

            EXPECT_EQ(result, expected) << "Failed for size " << num_pts;
        }
    }

    void test_duplicate_points()
    {
        const size_t num_pts = 10;
        AffineElement base_point = generators[0];

        std::vector<AffineElement> points(num_pts, base_point);
        std::vector<ScalarField> test_scalars(num_pts);
        ScalarField scalar_sum = ScalarField::zero();

        for (size_t i = 0; i < num_pts; ++i) {
            test_scalars[i] = scalars[i];
            scalar_sum += test_scalars[i];
        }

        PolynomialSpan<ScalarField> scalar_span(0, test_scalars);
        AffineElement result = scalar_multiplication::MSM<Curve>::msm(points, scalar_span);

        AffineElement expected(base_point * scalar_sum);
        EXPECT_EQ(result, expected);
    }

    void test_mixed_zero_scalars()
    {
        const size_t num_pts = 100;
        std::vector<ScalarField> test_scalars(num_pts);
        Element expected;
        expected.self_set_infinity();

        for (size_t i = 0; i < num_pts; ++i) {
            if (i % 2 == 0) {
                test_scalars[i] = ScalarField::zero();
            } else {
                test_scalars[i] = scalars[i];
                expected += generators[i] * test_scalars[i];
            }
        }

        std::span<const AffineElement> points(&generators[0], num_pts);
        PolynomialSpan<ScalarField> scalar_span(0, test_scalars);

        AffineElement result = scalar_multiplication::MSM<Curve>::msm(points, scalar_span);
        EXPECT_EQ(result, AffineElement(expected));
    }

    void test_pippenger_free_function()
    {
        const size_t num_pts = 200;
        std::vector<ScalarField> test_scalars(num_pts);
        for (size_t i = 0; i < num_pts; ++i) {
            test_scalars[i] = scalars[i];
        }

        std::span<const AffineElement> points(&generators[0], num_pts);
        PolynomialSpan<ScalarField> scalar_span(0, test_scalars);

        auto result = scalar_multiplication::pippenger<Curve>(scalar_span, points);

        AffineElement expected = naive_msm(test_scalars, points);
        EXPECT_EQ(AffineElement(result), expected);
    }

    void test_pippenger_unsafe_free_function()
    {
        const size_t num_pts = 200;
        std::vector<ScalarField> test_scalars(num_pts);
        for (size_t i = 0; i < num_pts; ++i) {
            test_scalars[i] = scalars[i];
        }

        std::span<const AffineElement> points(&generators[0], num_pts);
        PolynomialSpan<ScalarField> scalar_span(0, test_scalars);

        auto result = scalar_multiplication::pippenger_unsafe<Curve>(scalar_span, points);

        AffineElement expected = naive_msm(test_scalars, points);
        EXPECT_EQ(AffineElement(result), expected);
    }
};

using CurveTypes = ::testing::Types<bb::curve::BN254, bb::curve::Grumpkin>;
TYPED_TEST_SUITE(ScalarMultiplicationTest, CurveTypes);

// ======================= Test Wrappers =======================

TYPED_TEST(ScalarMultiplicationTest, GetScalarSlice)
{
    this->test_get_scalar_slice();
}
TYPED_TEST(ScalarMultiplicationTest, ConsumePointBatch)
{
    this->test_consume_point_batch();
}
TYPED_TEST(ScalarMultiplicationTest, ConsumePointBatchAndAccumulate)
{
    this->test_consume_point_batch_and_accumulate();
}
TYPED_TEST(ScalarMultiplicationTest, RadixSortCountZeroEntries)
{
    this->test_radix_sort_count_zero_entries();
}
TYPED_TEST(ScalarMultiplicationTest, EvaluatePippengerRound)
{
    this->test_evaluate_pippenger_round();
}
TYPED_TEST(ScalarMultiplicationTest, PippengerLowMemory)
{
    this->test_pippenger_low_memory();
}
TYPED_TEST(ScalarMultiplicationTest, BatchMultiScalarMul)
{
    this->test_batch_multi_scalar_mul();
}
TYPED_TEST(ScalarMultiplicationTest, BatchMultiScalarMulSparse)
{
    this->test_batch_multi_scalar_mul_sparse();
}
TYPED_TEST(ScalarMultiplicationTest, MSM)
{
    this->test_msm();
}
TYPED_TEST(ScalarMultiplicationTest, MSMAllZeroes)
{
    this->test_msm_all_zeroes();
}
TYPED_TEST(ScalarMultiplicationTest, MSMEmptyPolynomial)
{
    this->test_msm_empty_polynomial();
}
TYPED_TEST(ScalarMultiplicationTest, ScalarsUnchangedAfterMSM)
{
    this->test_scalars_unchanged_after_msm();
}
TYPED_TEST(ScalarMultiplicationTest, ScalarOne)
{
    this->test_scalar_one();
}
TYPED_TEST(ScalarMultiplicationTest, ScalarMinusOne)
{
    this->test_scalar_minus_one();
}
TYPED_TEST(ScalarMultiplicationTest, SinglePoint)
{
    this->test_single_point();
}
TYPED_TEST(ScalarMultiplicationTest, SizeThresholds)
{
    this->test_size_thresholds();
}
TYPED_TEST(ScalarMultiplicationTest, DuplicatePoints)
{
    this->test_duplicate_points();
}
TYPED_TEST(ScalarMultiplicationTest, MixedZeroScalars)
{
    this->test_mixed_zero_scalars();
}
TYPED_TEST(ScalarMultiplicationTest, PippengerFreeFunction)
{
    this->test_pippenger_free_function();
}
TYPED_TEST(ScalarMultiplicationTest, PippengerUnsafeFreeFunction)
{
    this->test_pippenger_unsafe_free_function();
}

// Non-templated test for explicit small inputs
TEST(ScalarMultiplication, SmallInputsExplicit)
{
    uint256_t x0(0x68df84429941826a, 0xeb08934ed806781c, 0xc14b6a2e4f796a73, 0x08dc1a9a11a3c8db);
    uint256_t y0(0x8ae5c31aa997f141, 0xe85f20c504f2c11b, 0x81a94193f3b1ce2b, 0x26f2c37372adb5b7);
    uint256_t x1(0x80f5a592d919d32f, 0x1362652b984e51ca, 0xa0b26666f770c2a1, 0x142c6e1964e5c3c5);
    uint256_t y1(0xb6c322ebb5ae4bc5, 0xf9fef6c7909c00f8, 0xb37ca1cc9af3b421, 0x1e331c7fa73d6a59);
    uint256_t s0(0xe48bf12a24272e08, 0xf8dd0182577f3567, 0xec8fd222b8a6becb, 0x102d76b945612c9b);
    uint256_t s1(0x098ae8d69f1e4e9e, 0xb5c8313c0f6040ed, 0xf78041e30cc46c44, 0x1d1e6e0c21892e13);

    std::vector<grumpkin::fr> scalars{ s0, s1 };

    std::vector<grumpkin::g1::affine_element> points{ grumpkin::g1::affine_element(x0, y0),
                                                      grumpkin::g1::affine_element(x1, y1) };

    PolynomialSpan<grumpkin::fr> scalar_span = PolynomialSpan<grumpkin::fr>(0, scalars);

    auto result = scalar_multiplication::MSM<curve::Grumpkin>::msm(points, scalar_span);

    grumpkin::g1::element expected = (points[0] * scalars[0]) + (points[1] * scalars[1]);

    EXPECT_EQ(result, grumpkin::g1::affine_element(expected));
}
