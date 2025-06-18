#include "scalar_multiplication.hpp"
#include "barretenberg/api/file_io.hpp"
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
            BB_ASSERT_EQ(generators[i].x == generators[i + 1].x, false);
        }
    };
};

using CurveTypes = ::testing::Types<bb::curve::BN254, bb::curve::Grumpkin>;
TYPED_TEST_SUITE(ScalarMultiplicationTest, CurveTypes);

#define SCALAR_MULTIPLICATION_TYPE_ALIASES                                                                             \
    using Curve = TypeParam;                                                                                           \
    using ScalarField = typename Curve::ScalarField;                                                                   \
    // using AffineElement = typename Curve::AffineEleent;

TYPED_TEST(ScalarMultiplicationTest, GetScalarSlice)
{
    SCALAR_MULTIPLICATION_TYPE_ALIASES
    const size_t fr_size = 254;
    const size_t slice_bits = 7;
    size_t num_slices = (fr_size + 6) / 7;
    size_t last_slice_bits = fr_size - ((num_slices - 1) * slice_bits);

    for (size_t x = 0; x < 100; ++x) {

        uint256_t input_u256 = engine.get_random_uint256();
        input_u256.data[3] = input_u256.data[3] & 0x3FFFFFFFFFFFFFFF; // 254 bits
        while (input_u256 > ScalarField::modulus) {
            input_u256 -= ScalarField::modulus;
        }
        std::vector<uint32_t> slices(num_slices);

        uint256_t acc = input_u256;
        for (size_t i = 0; i < num_slices; ++i) {
            size_t mask = ((1 << slice_bits) - 1);
            size_t shift = slice_bits;
            if (i == 0) {
                mask = ((1 << last_slice_bits) - 1);
                shift = last_slice_bits;
            }
            slices[num_slices - 1 - i] = static_cast<uint32_t>((acc & mask).data[0]);
            acc = acc >> shift;
        }
        // uint256_t input_u256 = 0;

        // for (size_t i = 0; i < num_slices; ++i) {
        //     bool valid_slice = false;
        //     while (!valid_slice) {
        //         size_t mask = ((1 << slice_bits) - 1);
        //         if (i == num_slices - 1) {
        //             mask = ((1 << last_slice_bits) - 1);
        //         }
        //         const uint32_t slice = engine.get_random_uint32() & mask;

        //         size_t shift = (fr_size - slice_bits - (i * slice_bits));
        //         if (i == num_slices - 1) {
        //             shift = 0;
        //         }

        //         const uint256_t new_input_u256 = input_u256 + (uint256_t(slice) << shift);
        //         //   ASSERT(new_input_u256 < fr::modulus);
        //         if (new_input_u256 < fr::modulus) {
        //             input_u256 = new_input_u256;
        //             slices[i] = slice;
        //             valid_slice = true;
        //         }
        //     }
        // }

        // ASSERT(input_u256 < fr::modulus);
        // while (input_u256 > fr::modulus) {
        //     input_u256 -= fr::modulus;
        // }
        ScalarField input(input_u256);
        input.self_from_montgomery_form();

        ASSERT_EQ(input.data[0], input_u256.data[0]);
        ASSERT_EQ(input.data[1], input_u256.data[1]);
        ASSERT_EQ(input.data[2], input_u256.data[2]);
        ASSERT_EQ(input.data[3], input_u256.data[3]);

        for (size_t i = 0; i < num_slices; ++i) {

            uint32_t result = scalar_multiplication::MSM<Curve>::get_scalar_slice(input, i, slice_bits);
            EXPECT_EQ(result, slices[i]);
        }
    }
    //   fr test = 0;
    // test.data[0] = 0b;
    // test.data[1] = 0b010101
}

TYPED_TEST(ScalarMultiplicationTest, ConsumePointBatch)
{
    using Curve = TypeParam;
    using AffineElement = typename Curve::AffineElement;
    // todo make this not a multiple of 10k
    const size_t total_points = 30071;
    const size_t num_buckets = 128;

    std::vector<uint64_t> input_point_schedule;
    for (size_t i = 0; i < total_points; ++i) {

        uint64_t bucket = static_cast<uint64_t>(engine.get_random_uint8()) & 0x7f;

        uint64_t schedule = static_cast<uint64_t>(bucket) + (static_cast<uint64_t>(i) << 32);
        input_point_schedule.push_back(schedule);
    }
    typename scalar_multiplication::MSM<Curve>::AffineAdditionData affine_data =
        typename scalar_multiplication::MSM<Curve>::AffineAdditionData();
    typename scalar_multiplication::MSM<Curve>::BucketAccumulators bucket_data(num_buckets);
    scalar_multiplication::MSM<Curve>::consume_point_schedule(
        input_point_schedule, TestFixture::generators, affine_data, bucket_data, 0, 0);

    std::vector<typename Curve::Element> expected_buckets(num_buckets);
    for (auto& e : expected_buckets) {
        e.self_set_infinity();
    }
    // std::cout << "computing expected" << std::endl;
    for (size_t i = 0; i < total_points; ++i) {
        uint64_t bucket = input_point_schedule[i] & 0xFFFFFFFF;
        EXPECT_LT(static_cast<size_t>(bucket), num_buckets);
        expected_buckets[static_cast<size_t>(bucket)] += TestFixture::generators[i];
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

TYPED_TEST(ScalarMultiplicationTest, ConsumePointBatchAndAccumulate)
{
    SCALAR_MULTIPLICATION_TYPE_ALIASES
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;

    // todo make this not a multiple of 10k
    const size_t total_points = 30071;
    const size_t num_buckets = 128;

    std::vector<uint64_t> input_point_schedule;
    for (size_t i = 0; i < total_points; ++i) {

        uint64_t bucket = static_cast<uint64_t>(engine.get_random_uint8()) & 0x7f;

        uint64_t schedule = static_cast<uint64_t>(bucket) + (static_cast<uint64_t>(i) << 32);
        input_point_schedule.push_back(schedule);
    }
    typename scalar_multiplication::MSM<Curve>::AffineAdditionData affine_data =
        typename scalar_multiplication::MSM<Curve>::AffineAdditionData();
    typename scalar_multiplication::MSM<Curve>::BucketAccumulators bucket_data(num_buckets);
    scalar_multiplication::MSM<Curve>::consume_point_schedule(
        input_point_schedule, TestFixture::generators, affine_data, bucket_data, 0, 0);

    Element result = scalar_multiplication::MSM<Curve>::accumulate_buckets(bucket_data);

    Element expected_acc = Element();
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
                expected_thread_acc += TestFixture::generators[i] * scalar;
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

TYPED_TEST(ScalarMultiplicationTest, RadixSortCountZeroEntries)
{
    const size_t total_points = 30071;

    std::vector<uint64_t> input_point_schedule;
    for (size_t i = 0; i < total_points; ++i) {

        uint64_t bucket = static_cast<uint64_t>(engine.get_random_uint8()) & 0x7f;

        uint64_t schedule = static_cast<uint64_t>(bucket) + (static_cast<uint64_t>(i) << 32);
        input_point_schedule.push_back(schedule);
    }

    size_t result = scalar_multiplication::process_buckets_count_zero_entries(
        &input_point_schedule[0], input_point_schedule.size(), 7);
    size_t expected = 0;
    for (size_t i = 0; i < total_points; ++i) {
        expected += static_cast<size_t>((input_point_schedule[i] & 0xFFFFFFFF) == 0);
    }
    EXPECT_EQ(result, expected);
}

TYPED_TEST(ScalarMultiplicationTest, EvaluatePippengerRound)
{
    SCALAR_MULTIPLICATION_TYPE_ALIASES
    using AffineElement = typename Curve::AffineElement;
    using Element = typename Curve::Element;

    const size_t num_points = 2;
    std::vector<ScalarField> scalars(num_points);
    constexpr size_t NUM_BITS_IN_FIELD = fr::modulus.get_msb() + 1;
    const size_t normal_slice_size = 7; // stop hardcoding
    const size_t num_buckets = 1 << normal_slice_size;

    const size_t num_rounds = (NUM_BITS_IN_FIELD + normal_slice_size - 1) / normal_slice_size;
    typename scalar_multiplication::MSM<Curve>::AffineAdditionData affine_data =
        typename scalar_multiplication::MSM<Curve>::AffineAdditionData();
    typename scalar_multiplication::MSM<Curve>::BucketAccumulators bucket_data(num_buckets);

    for (size_t round_index = num_rounds - 1; round_index < num_rounds; round_index++) {
        const size_t num_bits_in_slice =
            (round_index == (num_rounds - 1)) ? (NUM_BITS_IN_FIELD % normal_slice_size) : normal_slice_size;
        for (size_t i = 0; i < num_points; ++i) {

            size_t hi_bit = NUM_BITS_IN_FIELD - (round_index * normal_slice_size);
            size_t lo_bit = hi_bit - normal_slice_size;
            if (hi_bit < normal_slice_size) {
                lo_bit = 0;
            }
            uint64_t slice = engine.get_random_uint64() & ((1 << num_bits_in_slice) - 1);
            // at this point in the algo, scalars has been converted out of montgomery form
            uint256_t scalar = uint256_t(slice) << lo_bit;
            scalars[i].data[0] = scalar.data[0];
            scalars[i].data[1] = scalar.data[1];
            scalars[i].data[2] = scalar.data[2];
            scalars[i].data[3] = scalar.data[3];
            scalars[i].self_to_montgomery_form();
        }

        std::vector<uint32_t> indices;
        scalar_multiplication::MSM<Curve>::transform_scalar_and_get_nonzero_scalar_indices(scalars, indices);

        Element previous_round_output;
        previous_round_output.self_set_infinity();
        for (auto x : indices) {
            BB_ASSERT_LT(x, num_points);
        }
        std::vector<uint64_t> point_schedule(scalars.size());
        typename scalar_multiplication::MSM<Curve>::MSMData msm_data(
            scalars, TestFixture::generators, indices, point_schedule);
        Element result = scalar_multiplication::MSM<Curve>::evaluate_pippenger_round(
            msm_data, round_index, affine_data, bucket_data, previous_round_output, 7);
        Element expected;
        expected.self_set_infinity();
        for (size_t i = 0; i < num_points; ++i) {
            ScalarField baz = scalars[i].to_montgomery_form();
            expected += (TestFixture::generators[i] * baz);
        }
        size_t num_doublings = NUM_BITS_IN_FIELD - (normal_slice_size * (round_index + 1));
        if (round_index == num_rounds - 1) {
            num_doublings = 0;
        }
        for (size_t i = 0; i < num_doublings; ++i) {
            result.self_dbl();
        }
        EXPECT_EQ(AffineElement(result), AffineElement(expected));
    }
}

TYPED_TEST(ScalarMultiplicationTest, PippengerLowMemory)
{
    SCALAR_MULTIPLICATION_TYPE_ALIASES
    using AffineElement = typename Curve::AffineElement;

    const size_t num_points = TestFixture::num_points;

    std::span<ScalarField> scalars(&TestFixture::scalars[0], num_points);
    AffineElement result =
        scalar_multiplication::MSM<Curve>::msm(TestFixture::generators, PolynomialSpan<ScalarField>(0, scalars));

    AffineElement expected = TestFixture::naive_msm(scalars, TestFixture::generators);
    EXPECT_EQ(result, expected);
}

TYPED_TEST(ScalarMultiplicationTest, BatchMultiScalarMul)
{
    SCALAR_MULTIPLICATION_TYPE_ALIASES
    using AffineElement = typename Curve::AffineElement;

    const size_t num_msms = static_cast<size_t>(engine.get_random_uint8());
    std::vector<AffineElement> expected(num_msms);

    std::vector<std::span<const AffineElement>> batch_points_span;
    std::vector<std::span<ScalarField>> batch_scalars_spans;

    size_t vector_offset = 0;
    for (size_t k = 0; k < num_msms; ++k) {
        const size_t num_points = static_cast<size_t>(engine.get_random_uint16()) % 400;

        BB_ASSERT_LT(vector_offset + num_points, TestFixture::num_points);
        std::span<ScalarField> batch_scalars(&TestFixture::scalars[vector_offset], num_points);
        std::span<const AffineElement> batch_points(&TestFixture::generators[vector_offset], num_points);

        vector_offset += num_points;
        batch_points_span.push_back(batch_points);
        batch_scalars_spans.push_back(batch_scalars);

        expected[k] = TestFixture::naive_msm(batch_scalars_spans[k], batch_points_span[k]);
    }

    std::vector<AffineElement> result =
        scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(batch_points_span, batch_scalars_spans);

    EXPECT_EQ(result, expected);
}

TYPED_TEST(ScalarMultiplicationTest, BatchMultiScalarMulSparse)
{
    SCALAR_MULTIPLICATION_TYPE_ALIASES
    using AffineElement = typename Curve::AffineElement;

    const size_t num_msms = 10;
    std::vector<AffineElement> expected(num_msms);

    std::vector<std::vector<ScalarField>> batch_scalars(num_msms);
    std::vector<std::vector<AffineElement>> batch_input_points(num_msms);
    std::vector<std::span<const AffineElement>> batch_points_span;
    std::vector<std::span<ScalarField>> batch_scalars_spans;

    for (size_t k = 0; k < num_msms; ++k) {
        const size_t num_points = 33;
        auto& scalars = batch_scalars[k];

        scalars.resize(num_points);

        size_t fixture_offset = k * num_points;

        std::span<AffineElement> batch_points(&TestFixture::generators[fixture_offset], num_points);
        for (size_t i = 0; i < 13; ++i) {
            scalars[i] = 0;
        }
        for (size_t i = 13; i < 23; ++i) {
            scalars[i] = TestFixture::scalars[fixture_offset + i + 13];
        }
        for (size_t i = 23; i < num_points; ++i) {
            scalars[i] = 0;
        }
        batch_points_span.push_back(batch_points);
        batch_scalars_spans.push_back(batch_scalars[k]);

        expected[k] = TestFixture::naive_msm(batch_scalars[k], batch_points);
    }

    std::vector<AffineElement> result =
        scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(batch_points_span, batch_scalars_spans);

    EXPECT_EQ(result, expected);
}

TYPED_TEST(ScalarMultiplicationTest, MSM)
{
    SCALAR_MULTIPLICATION_TYPE_ALIASES
    using AffineElement = typename Curve::AffineElement;

    const size_t start_index = 1234;
    const size_t num_points = TestFixture::num_points - start_index;

    PolynomialSpan<ScalarField> scalar_span =
        PolynomialSpan<ScalarField>(start_index, std::span<ScalarField>(&TestFixture::scalars[0], num_points));
    AffineElement result = scalar_multiplication::MSM<Curve>::msm(TestFixture::generators, scalar_span);

    std::span<AffineElement> points(&TestFixture::generators[start_index], num_points);
    AffineElement expected = TestFixture::naive_msm(scalar_span.span, points);
    EXPECT_EQ(result, expected);
}

TYPED_TEST(ScalarMultiplicationTest, MSMAllZeroes)
{
    SCALAR_MULTIPLICATION_TYPE_ALIASES
    using AffineElement = typename Curve::AffineElement;

    const size_t start_index = 1234;
    const size_t num_points = TestFixture::num_points - start_index;
    std::vector<ScalarField> scalars(num_points);

    for (size_t i = 0; i < num_points; ++i) {
        scalars[i] = 0;
    }

    PolynomialSpan<ScalarField> scalar_span = PolynomialSpan<ScalarField>(start_index, scalars);
    AffineElement result = scalar_multiplication::MSM<Curve>::msm(TestFixture::generators, scalar_span);

    EXPECT_EQ(result, Curve::Group::affine_point_at_infinity);
}

TYPED_TEST(ScalarMultiplicationTest, MSMEmptyPolynomial)
{
    SCALAR_MULTIPLICATION_TYPE_ALIASES
    using AffineElement = typename Curve::AffineElement;

    const size_t num_points = 0;
    std::vector<ScalarField> scalars(num_points);
    std::vector<AffineElement> input_points(num_points);
    PolynomialSpan<ScalarField> scalar_span = PolynomialSpan<ScalarField>(0, scalars);
    AffineElement result = scalar_multiplication::MSM<Curve>::msm(input_points, scalar_span);

    EXPECT_EQ(result, Curve::Group::affine_point_at_infinity);
}

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
