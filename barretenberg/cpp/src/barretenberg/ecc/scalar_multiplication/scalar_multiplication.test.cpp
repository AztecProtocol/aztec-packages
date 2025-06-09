#include "scalar_multiplication.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/types.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/srs/factories/mem_bn254_crs_factory.hpp"
#include <filesystem>
#include <gtest/gtest.h>

using namespace bb;

// using Curve = curve::BN254;
// using Element = Curve::Element;
// using ScalarField = Curve::ScalarField;
// using AffineElement = Curve::AffineElement;

// using ScalarSpan = std::span<ScalarField>;

namespace {
auto& engine = numeric::get_debug_randomness();
// auto& random_engine = numeric::get_randomness();
} // namespace

template <class Curve> class ScalarMultiplicationTest : public ::testing::Test {
  public:
    using Group = typename Curve::Group;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using ScalarField = typename Curve::ScalarField;

    static constexpr size_t num_points = 101123;
    static inline std::vector<AffineElement> generators{};
    static inline std::vector<ScalarField> scalars{};

    static AffineElement naive_msm(std::span<ScalarField> input_scalars, std::span<const AffineElement> input_points)
    {
        size_t total_points = input_scalars.size();
        size_t num_threads = get_num_cpus();
        std::vector<Element> expected_accs(num_threads);
        size_t range_per_thread = (total_points + num_threads - 1) / num_threads;
        // for (size_t thread_idx = 0; thread_idx < num_threads; ++thread_idx) {
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
            // }
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
    scalar_multiplication::MSM<Curve>::consume_point_batch(
        input_point_schedule, TestFixture::generators, affine_data, bucket_data, 0, 0);

    std::vector<typename Curve::Element> expected_buckets(num_buckets);
    for (auto& e : expected_buckets) {
        e.self_set_infinity();
    }
    // std::cout << "computing expected" << std::endl;
    for (size_t i = 0; i < total_points; ++i) {
        uint64_t bucket = input_point_schedule[i] & 0xFFFFFFFF;
        EXPECT_LT(bucket, num_buckets);
        expected_buckets[bucket] += TestFixture::generators[i];
    }
    for (size_t i = 0; i < num_buckets; ++i) {
        if (!expected_buckets[i].is_point_at_infinity()) {
            AffineElement expected(expected_buckets[i]);
            EXPECT_EQ(expected, bucket_data.buckets[i]);
        } else {
            EXPECT_FALSE(bucket_data.bucket_exists.get(i));
        }
    }

    // how do I test more thoroughly?
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
    scalar_multiplication::MSM<Curve>::consume_point_batch(
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
        scalar_multiplication::transform_scalar_and_get_nonzero_scalar_indices<ScalarField>(scalars, indices);

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

    const size_t num_msms = 10; // static_cast<size_t>(engine.get_random_uint8());
    std::vector<AffineElement> expected(num_msms);

    std::vector<std::vector<ScalarField>> batch_scalars(num_msms);
    std::vector<std::vector<AffineElement>> batch_input_points(num_msms);
    std::vector<std::span<const AffineElement>> batch_points_span;
    std::vector<std::span<ScalarField>> batch_scalars_spans;

    for (size_t k = 0; k < num_msms; ++k) {
        const size_t num_points = 33; // static_cast<size_t>(engine.get_random_uint16()) % 1000;
        // size_t zero_offset = 13;
        // size_t num_nonzero = 10;
        auto& scalars = batch_scalars[k];

        scalars.resize(num_points);

        size_t fixture_offset = k * num_points;

        std::span<AffineElement> batch_points(&TestFixture::generators[fixture_offset], num_points);
        for (size_t i = 0; i < 13; ++i) {
            scalars[i] = 0; // fr::random_element(&engine);
        }
        for (size_t i = 13; i < 23; ++i) {
            scalars[i] = TestFixture::scalars[fixture_offset + i + 13];
        }
        for (size_t i = 23; i < num_points; ++i) {
            scalars[i] = 0; // fr::random_element(&engine);
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

    const size_t start_index = 0;
    const size_t num_points = TestFixture::num_points - start_index;

    // span is size 101123 but entries from 0 to 1023 are all zero

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

// std::filesystem::path get_crs_path_base()
// {
//     char* crs_path = std::getenv("CRS_PATH");
//     if (crs_path != nullptr) {
//         return std::filesystem::path(crs_path);
//     }
//     // Detect home directory for default CRS path
//     char* home = std::getenv("HOME");
//     std::filesystem::path base = home != nullptr ? std::filesystem::path(home) : "./";
//     return base / .bb
// }

// TEST(ScalarMultiplication, Write)
// {
//     size_t num_points = 1000;
//     std::vector<fr> scalars(num_points);
//     std::vector<AffineElement> points(num_points);

//     std::filesystem::path bb_crs_path = get_bb_crs_path();
//     for (size_t i = 0; i < num_points; ++i) {
//         const g1::affine_element point = g1::one * fr::random_element(&engine);
//         points[i] = (point);
//         scalars[i] = fr::random_element(&engine);
//     }

//     write_file(bb_crs_path / "testpoints.dat", to_buffer(points));
//     write_file(bb_crs_path / "testscalars.dat", to_buffer(scalars));

//     auto point_data = read_file(bb_crs_path / "testpoints.dat", num_points * sizeof(g1::affine_element));
//     auto read_points = std::vector<g1::affine_element>(num_points);
//     for (size_t i = 0; i < num_points; ++i) {
//         read_points[i] = from_buffer<g1::affine_element>(point_data, i * sizeof(g1::affine_element));
//     }
//     auto scalar_data = read_file(bb_crs_path / "testscalars.dat", num_points * sizeof(fr));
//     auto read_scalars = std::vector<fr>(num_points);
//     for (size_t i = 0; i < num_points; ++i) {
//         read_scalars[i] = from_buffer<fr>(scalar_data, i * sizeof(fr));
//     }

//     for (size_t i = 0; i < num_points; ++i) {
//         EXPECT_EQ(points[i], read_points[i]);
//         EXPECT_EQ(scalars[i], read_scalars[i]);
//     }
// }

// TEST(ScalarMultiplication, Repro)
// {
//     size_t poly_size = 4194303;
//     size_t table_size = 4194305;
//     // size_t poly_offset = 1;

//     std::filesystem::path bb_crs_path = get_bb_crs_path();

//     auto point_data = read_file(bb_crs_path / "testpoints.dat", table_size * sizeof(g1::affine_element));
//     auto points = std::vector<g1::affine_element>(table_size);
//     for (size_t i = 0; i < table_size; ++i) {
//         points[i] = from_buffer<g1::affine_element>(point_data, i * sizeof(g1::affine_element));
//     }
//     auto scalar_data = read_file(bb_crs_path / "testscalars.dat", poly_size * sizeof(fr));
//     auto scalars = std::vector<fr>(poly_size);
//     for (size_t i = 0; i < poly_size; ++i) {
//         scalars[i] = from_buffer<fr>(scalar_data, i * sizeof(fr));
//     }
//     scalar_multiplication::pippenger_runtime_state<Curve> pippenger_runtime_state(
//         numeric::round_up_power_2(table_size + 1));

//     size_t start_index = 1;
//     PolynomialSpan<fr> polynomial(start_index, std::span<fr>(scalars));

//     std::span<const g1::affine_element> point_table(points);

//     std::span<const g1::affine_element> mod_points(point_table.begin() + 0, point_table.end());
//     PolynomialSpan<fr> mod_scalars(start_index, std::span<fr>(scalars.begin() + 0, scalars.end()));

//     g1::affine_element result = scalar_multiplication::MSM<Curve>::msm(mod_points, { start_index,
//     mod_scalars.span
//     });

//     // Call the version of pippenger which assumes all points are distinct
//     g1::affine_element expected = scalar_multiplication::pippenger_without_endomorphism_basis_points(
//         { start_index, mod_scalars.span }, mod_points, pippenger_runtime_state);

//     //           expected  : { 0x136f18dc6fe02473d89dc4b29ab17be75f2594d768addaa6f33757250af3e7fb,
//     //           0x2e624821ad5a7618034644d35f9829f603fe9ba3ad08d0f69d8acf40ee24f58a }
//     //   result: { 0x124b7994d9beaba3826b62915f87bf2a71630a2cf7d4a19cb46f1ca31ec189de,
//     //   0x124e296946c4f53ce224dcaadf07f0539a49b94c34433973a31169d1003fd609 }
//     EXPECT_EQ(result, expected);
// }

/*
   const size_t num_points = 1;
    std::vector<fr> scalars(num_points);
    std::vector<AffineElement> input_points(num_points);

    for (size_t i = 0; i < num_points; ++i) {
        const g1::affine_element point = g1::one * fr::random_element(&engine);
        input_points[i] = (point);
        scalars[i] = fr::random_element(&engine);
    }

    const size_t num_rounds = (254 + 11) / 12;
    fr foo = scalars[0].from_montgomery_form();
    std::vector<Element> test(num_rounds);
    for (size_t i = 0; i < num_rounds; ++i) {
        uint64_t slice = scalar_multiplication::MSM<Curve, true, 1>::get_scalar_slice(foo, i, 12);
        test[i] = input_points[0] * slice;
        std::cout << "slice value = " << slice << std::endl;
        std::cout << "EXPECTED ROUND OUTPUT[" << i << "] = " << AffineElement(test[i]) << std::endl;
    }

    Element acc;
    acc.self_set_infinity();
    for (size_t i = 0; i < num_rounds; ++i) {
        const size_t num_doublings = (i == num_rounds - 1) ? 254 % 12 : 12;
        for (size_t j = 0; j < num_doublings; ++j) {
            acc.self_dbl();
        }
        acc += test[i];
    }
    AffineElement expected2(acc);
    AffineElement result = scalar_multiplication::MSM<Curve, true, 1>::pippenger_low_memory(scalars, input_points);

    Element expected;
    expected.self_set_infinity();
    for (size_t i = 0; i < num_points; ++i) {
        expected += (input_points[i] * scalars[i]);
    }
    std::cout << "RECOVERED COMP: " << expected2 << " : " << AffineElement(expected) << std::endl;
    EXPECT_EQ(expected2, AffineElement(expected));
    //      for (size_t i = 0; i < num_rounds; ++i) {
    //     round_schedule[i] = get_scalar_slice(scalars[i], round_index, bits_per_slice);
    //     std::cout << "slice = " << round_schedule[i] << std::endl;
    //     round_schedule[i] += (static_cast<uint64_t>(i) << 32);
    // }

    EXPECT_EQ(result, AffineElement(expected));
}

*/
