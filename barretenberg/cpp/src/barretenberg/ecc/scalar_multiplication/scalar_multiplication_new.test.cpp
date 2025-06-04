#include "scalar_multiplication_new.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <gtest/gtest.h>

using namespace bb;

using Curve = curve::BN254;
using Element = Curve::Element;
using ScalarField = Curve::ScalarField;
using AffineElement = Curve::AffineElement;

using ScalarSpan = std::span<ScalarField>;

namespace {
auto& engine = numeric::get_debug_randomness();
// auto& random_engine = numeric::get_randomness();
} // namespace

TEST(ScalarMultiplication, TestWorkSchedule)
{
    const size_t BATCH_MSM_SIZE = 2;
    const size_t INNER_MSM_SIZE = 100;
    std::vector<std::vector<g1::affine_element>> batch_points;
    std::vector<std::vector<fr>> batch_scalars;
    for (size_t j = 0; j < BATCH_MSM_SIZE; ++j) {
        std::vector<fr> scalars(INNER_MSM_SIZE);
        std::vector<g1::affine_element> points(INNER_MSM_SIZE);
        scalars[0] = 1;
        points[0] = g1::affine_one;
        for (size_t i = 1; i < INNER_MSM_SIZE; ++i) {
            if (i != 56) {
                scalars[i] = 1;
                points[i] = g1::affine_element(g1::element(points[i - 1]) + g1::affine_one);
            } else {
                scalars[i] = 0;
                points[i] = points[i - 1];
            }
        }
        if (j == 0) {
            scalars[56] = 1;
            scalars[50] = 0; // see what happens if one of our threads starts with an empty mul
        }
        batch_scalars.push_back(scalars);
        batch_points.push_back(points);
    }

    std::vector<ScalarSpan> scalar_in;
    std::vector<std::span<const g1::affine_element>> point_in;
    for (size_t i = 0; i < BATCH_MSM_SIZE; ++i) {
        scalar_in.push_back(ScalarSpan(batch_scalars[i]));
        point_in.push_back(batch_points[i]);
    }
    constexpr size_t NUM_THREADS = 4;
    using MSMWorkUnit = scalar_multiplication::MSM<Curve, true, NUM_THREADS>::MSMWorkUnit;
    const std::vector<std::vector<MSMWorkUnit>> result =
        scalar_multiplication::MSM<Curve, true, NUM_THREADS>::compute_batch_msm_work_units(scalar_in, point_in);

    EXPECT_EQ(result.size(), 4);
    EXPECT_EQ(result[0].size(), 1);
    EXPECT_EQ(result[1].size(), 2);
    EXPECT_EQ(result[2].size(), 1);
    EXPECT_EQ(result[3].size(), 1);

    EXPECT_EQ(result[0][0].points.size(), 50);
    EXPECT_EQ(result[1][0].points.size(),
              49); // msm size is 49, row 50 is empty so starts on 51
    EXPECT_EQ(result[1][1].points.size(),
              1);                              // msm size is 1 - each thread has 50 mul capacity
    EXPECT_EQ(result[2][0].points.size(), 50); // msm size is 50
    EXPECT_EQ(result[3][0].points.size(),
              49); // msm size is 48 but row 56 is empty

    // 100 points
    // start at points[51] = [0], 52 = [1], 53 = [2], 54 = [3], 55 = [4]
    // points[0] = input[52]?
    std::vector<MSMWorkUnit> work = result[3];
    // std::cout << "printing points" << std::endl;
    // for (size_t i = 0; i < 10; ++i) {
    //     std::cout << work[0].points[i] << std::endl;
    // }
    EXPECT_EQ(work[0].points[5], work[0].points[4]);
    EXPECT_EQ(work[0].points[6], g1::affine_element(g1::element(work[0].points[5]) + g1::affine_one));

    // hmm we need a much more comprehensive test here

    // step 1: get some random values (points, scalars)
    // step 2: set a random subset of scalars to 0
    // step 3: create a random number of threads
    // step 4: get the work units out and evaluate that the result is what one
    // would expect
}

TEST(ScalarMultiplication, TestWorkSchedule2)
{

    const size_t TOTAL_NUM_MSMS = engine.get_random_uint8() % 10;

    std::vector<std::vector<g1::affine_element>> batch_points(TOTAL_NUM_MSMS);
    std::vector<std::vector<fr>> batch_scalars(TOTAL_NUM_MSMS);
    for (size_t i = 0; i < TOTAL_NUM_MSMS; ++i) {
        const size_t POINTS_IN_MSM = engine.get_random_uint16() % 1000;
        batch_points[i].reserve(POINTS_IN_MSM);
        batch_scalars[i].reserve(POINTS_IN_MSM);

        for (size_t j = 0; j < POINTS_IN_MSM; ++j) {
            const g1::affine_element point = g1::one * fr::random_element(&engine);
            fr scalar = fr::random_element(&engine);

            // roughly 10% chance of being 0
            if (engine.get_random_uint8() < 25) {
                scalar = 0;
            }
            batch_points[i].push_back(point);
            batch_scalars[i].push_back(scalar);
        }
    }
    std::vector<ScalarSpan> scalar_in;
    std::vector<std::span<const g1::affine_element>> point_in;
    for (size_t i = 0; i < TOTAL_NUM_MSMS; ++i) {
        scalar_in.push_back(ScalarSpan(batch_scalars[i]));
        point_in.push_back(batch_points[i]);
    }
    constexpr size_t NUM_THREADS = 13;
    using MSMWorkUnit = scalar_multiplication::MSM<Curve, true, NUM_THREADS>::MSMWorkUnit;
    const std::vector<std::vector<MSMWorkUnit>> work_result =
        scalar_multiplication::MSM<Curve, true, NUM_THREADS>::compute_batch_msm_work_units(scalar_in, point_in);

    std::vector<g1::affine_element> result(TOTAL_NUM_MSMS);
    std::vector<g1::affine_element> expected(TOTAL_NUM_MSMS);
    for (size_t i = 0; i < TOTAL_NUM_MSMS; ++i) {
        result[i] = g1::affine_point_at_infinity;
        expected[i] = g1::affine_point_at_infinity;
    }
    for (const auto& work_units : work_result) {
        for (MSMWorkUnit work_unit : work_units) {

            g1::element msm_result = g1::point_at_infinity;
            for (size_t i = 0; i < work_unit.scalars.size(); ++i) {
                msm_result += (g1::element(work_unit.points[i]) * work_unit.scalars[i]);
            }
            result[work_unit.batch_msm_index] =
                g1::affine_element(g1::element(result[work_unit.batch_msm_index]) + msm_result);
        }
    }
    for (size_t i = 0; i < TOTAL_NUM_MSMS; ++i) {
        g1::element msm_result = g1::point_at_infinity;
        for (size_t j = 0; j < batch_scalars[i].size(); ++j) {
            msm_result += (g1::element(batch_points[i][j]) * batch_scalars[i][j]);
        }
        expected[i] = g1::affine_element(g1::element(expected[i]) + msm_result);
    }

    ASSERT_EQ(result, expected);
}

TEST(ScalarMultiplication, GetScalarSlice)
{

    const size_t fr_size = 254;
    const size_t slice_bits = 7;
    size_t num_slices = (fr_size + 6) / 7;
    size_t last_slice_bits = fr_size - ((num_slices - 1) * slice_bits);

    for (size_t x = 0; x < 100; ++x) {

        uint256_t input_u256 = engine.get_random_uint256();
        input_u256.data[3] = input_u256.data[3] & 0x3FFFFFFFFFFFFFFF; // 254 bits
        while (input_u256 > fr::modulus) {
            input_u256 -= fr::modulus;
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
        fr input(input_u256);
        input.self_from_montgomery_form();

        ASSERT_EQ(input.data[0], input_u256.data[0]);
        ASSERT_EQ(input.data[1], input_u256.data[1]);
        ASSERT_EQ(input.data[2], input_u256.data[2]);
        ASSERT_EQ(input.data[3], input_u256.data[3]);

        for (size_t i = 0; i < num_slices; ++i) {

            uint32_t result = scalar_multiplication::MSM<Curve, true, 4>::get_scalar_slice(input, i, slice_bits);
            EXPECT_EQ(result, slices[i]);
        }
    }
    //   fr test = 0;
    // test.data[0] = 0b;
    // test.data[1] = 0b010101
}

TEST(ScalarMultiplication, GetScalarSlice2)
{

    const size_t fr_size = 254;
    for (size_t slice_bits = 7; slice_bits < 20; ++slice_bits) {
        size_t num_slices = (fr_size + slice_bits - 1) / slice_bits;
        size_t last_slice_bits = fr_size - ((num_slices - 1) * slice_bits);

        for (size_t x = 0; x < 100; ++x) {

            uint256_t input_u256 = engine.get_random_uint256();
            input_u256.data[3] = input_u256.data[3] & 0x3FFFFFFFFFFFFFFF; // 254 bits
            while (input_u256 > fr::modulus) {
                input_u256 -= fr::modulus;
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

            fr input(input_u256);
            input.self_from_montgomery_form();

            ASSERT_EQ(input.data[0], input_u256.data[0]);
            ASSERT_EQ(input.data[1], input_u256.data[1]);
            ASSERT_EQ(input.data[2], input_u256.data[2]);
            ASSERT_EQ(input.data[3], input_u256.data[3]);

            for (size_t i = 0; i < num_slices; ++i) {

                uint32_t result = scalar_multiplication::MSM<Curve, true, 4>::get_scalar_slice(input, i, slice_bits);
                EXPECT_EQ(result, slices[i]);
            }
        }
    }
    //   fr test = 0;
    // test.data[0] = 0b;
    // test.data[1] = 0b010101
}

// TEST(ScalarMultiplication, ConsumePointBatchSmall)
// {

//     // todo make this not a multiple of 10k
//     const size_t total_points = 4;
//     const size_t num_buckets = 128;
//     std::vector<AffineElement> input_points;

//     std::vector<uint64_t> input_point_schedule;
//     for (size_t i = 0; i < total_points; ++i) {
//         const g1::affine_element point = g1::one * fr::random_element(&engine);
//         input_points.push_back(point);

//         uint64_t bucket = i + 1; // eh

//         uint64_t schedule = bucket + (static_cast<uint64_t>(i) << 32);
//         input_point_schedule.push_back(schedule);
//     }
//     input_point_schedule[3] = (3 + (static_cast<uint64_t>(3) << 32));
//     std::vector<AffineElement> point_scratch_space(total_points);
//     std::vector<fq> scalar_scratch_space(total_points);
//     std::vector<AffineElement> overflow_scratch_space(num_buckets);
//     std::vector<uint64_t> output_point_schedule(total_points);
//     std::vector<bool> overflow_exists(num_buckets);

//     scalar_multiplication::MSM<Curve, true, 1>::consume_point_batch(&input_point_schedule[0],
//                                                                     &input_points[0],
//                                                                     &point_scratch_space[0],
//                                                                     &scalar_scratch_space[0],
//                                                                     &overflow_scratch_space[0],
//                                                                     (overflow_exists),
//                                                                     &output_point_schedule[0],
//                                                                     total_points,
//                                                                     0,
//                                                                     0,
//                                                                     0);
//     EXPECT_EQ(overflow_scratch_space[1], input_points[0]);
//     EXPECT_EQ(overflow_scratch_space[2], input_points[1]);
//     EXPECT_EQ(overflow_scratch_space[3], AffineElement(Element(input_points[2]) + input_points[3]));

//     // how do I test more thoroughly?
// }

TEST(ScalarMultiplication, ConsumePointBatch)
{

    // todo make this not a multiple of 10k
    const size_t total_points = 30071;
    const size_t num_buckets = 128;
    std::vector<AffineElement> input_points;

    std::vector<uint64_t> input_point_schedule;
    for (size_t i = 0; i < total_points; ++i) {
        const g1::affine_element point = g1::one * fr::random_element(&engine);
        input_points.push_back(point);

        uint64_t bucket = static_cast<uint64_t>(engine.get_random_uint8()) & 0x7f;

        uint64_t schedule = static_cast<uint64_t>(bucket) + (static_cast<uint64_t>(i) << 32);
        input_point_schedule.push_back(schedule);
    }
    scalar_multiplication::MSM<Curve, true, 1>::AffineAdditionData affine_data =
        scalar_multiplication::MSM<Curve, true, 1>::AffineAdditionData();
    scalar_multiplication::MSM<Curve, true, 1>::BucketAccumulators bucket_data(num_buckets);
    scalar_multiplication::MSM<Curve, true, 1>::consume_point_batch(
        input_point_schedule, input_points, affine_data, bucket_data, 0, 0);

    std::vector<Element> expected_buckets(num_buckets);
    for (auto& e : expected_buckets) {
        e.self_set_infinity();
    }
    // std::cout << "computing expected" << std::endl;
    for (size_t i = 0; i < total_points; ++i) {
        uint64_t bucket = input_point_schedule[i] & 0xFFFFFFFF;
        // if (bucket == 37) {
        //     std::cout << "bucket " << bucket << std::endl;
        //     std::cout << "input_points[i]" << input_points[i] << std::endl;
        // }
        expected_buckets[bucket] += input_points[i];
        // if (bucket == 37) {
        //     std::cout << "output bucket " << expected_buckets[bucket] << std::endl;
        // }
    }
    // std::cout << "checking expectations" << std::endl;
    for (size_t i = 0; i < num_buckets; ++i) {
        // std::cout << "i = " << i << std::endl;
        if (!expected_buckets[i].is_point_at_infinity()) {
            AffineElement expected(expected_buckets[i]);
            // if (expected != bucket_data.buckets[i]) {
            //     std::cout << "failure at i = " << i << std::endl;
            // }
            EXPECT_EQ(expected, bucket_data.buckets[i]);
        } else {
            EXPECT_FALSE(bucket_data.bucket_exists.get(i));
        }
    }

    // how do I test more thoroughly?
}

TEST(ScalarMultiplication, ConsumePointBatchAndAccumulate)
{

    // todo make this not a multiple of 10k
    const size_t total_points = 30071;
    const size_t num_buckets = 128;
    std::vector<AffineElement> input_points;

    std::vector<uint64_t> input_point_schedule;
    for (size_t i = 0; i < total_points; ++i) {
        const g1::affine_element point = g1::one * fr::random_element(&engine);
        input_points.push_back(point);

        uint64_t bucket = static_cast<uint64_t>(engine.get_random_uint8()) & 0x7f;

        uint64_t schedule = static_cast<uint64_t>(bucket) + (static_cast<uint64_t>(i) << 32);
        input_point_schedule.push_back(schedule);
    }
    scalar_multiplication::MSM<Curve, true, 1>::AffineAdditionData affine_data =
        scalar_multiplication::MSM<Curve, true, 1>::AffineAdditionData();
    scalar_multiplication::MSM<Curve, true, 1>::BucketAccumulators bucket_data(num_buckets);
    scalar_multiplication::MSM<Curve, true, 1>::consume_point_batch(
        input_point_schedule, input_points, affine_data, bucket_data, 0, 0);

    Element result = scalar_multiplication::MSM<Curve, true, 1>::accumulate_buckets(bucket_data);

    Element expected_acc = Element();
    expected_acc.self_set_infinity();
    std::vector<fr> scalars(total_points);
    for (size_t i = 0; i < total_points; ++i) {
        scalars[i] = input_point_schedule[i] & 0xFFFFFFFF;
    }
    // std::cout << "c" << std::endl;
    for (size_t i = 0; i < total_points; ++i) {
        expected_acc += input_points[i] * scalars[i];
    }
    // std::cout << "d" << std::endl;
    AffineElement expected(expected_acc);
    // std::cout << "e" << std::endl;
    EXPECT_EQ(AffineElement(result), expected);

    // how do I test more thoroughly?
}

TEST(ScalarMultiplication, RadixSortCountZeroEntries)
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
        expected += ((input_point_schedule[i] & 0xFFFFFFFF) == 0);
    }
    EXPECT_EQ(result, expected);
}

TEST(ScalarMultiplication, EvaluatePippengerRound)
{
    const size_t num_points = 10113;
    std::vector<fr> scalars(num_points);
    std::vector<AffineElement> input_points(num_points);
    constexpr size_t NUM_BITS_IN_FIELD = fr::modulus.get_msb() + 1;
    const size_t normal_slice_size = 7; // stop hardcoding
    const size_t num_buckets = 1 << normal_slice_size;

    const size_t num_rounds = (NUM_BITS_IN_FIELD + normal_slice_size - 1) / normal_slice_size;
    scalar_multiplication::MSM<Curve, true, 1>::AffineAdditionData affine_data =
        scalar_multiplication::MSM<Curve, true, 1>::AffineAdditionData();
    scalar_multiplication::MSM<Curve, true, 1>::BucketAccumulators bucket_data(num_buckets);

    for (size_t i = 0; i < num_points; ++i) {
        const g1::affine_element point = g1::one * fr::random_element(&engine);
        input_points[i] = (point);
    }

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
        }

        Element previous_round_output;
        previous_round_output.self_set_infinity();
        Element result = scalar_multiplication::MSM<Curve, true, 1>::evaluate_pippenger_round(
            scalars, input_points, num_points, round_index, affine_data, bucket_data, previous_round_output, 7);
        Element expected;
        expected.self_set_infinity();
        for (size_t i = 0; i < num_points; ++i) {
            fr baz = scalars[i].to_montgomery_form();
            expected += (input_points[i] * baz);
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

TEST(ScalarMultiplication, PippengerLowMemory)
{
    const size_t num_points = 101123;
    std::vector<fr> scalars(num_points);
    std::vector<AffineElement> input_points(num_points);

    for (size_t i = 0; i < num_points; ++i) {
        const g1::affine_element point = g1::one * fr::random_element(&engine);
        input_points[i] = (point);
        scalars[i] = fr::random_element(&engine);
    }

    AffineElement result = scalar_multiplication::MSM<Curve, true, 1>::pippenger_low_memory(scalars, input_points);

    Element expected;
    expected.self_set_infinity();
    for (size_t i = 0; i < num_points; ++i) {
        expected += (input_points[i] * scalars[i]);
    }

    AffineElement expected_affine(expected);
    EXPECT_EQ(result, expected_affine);
}

TEST(ScalarMultiplication, BatchMultiScalarMul)
{
    const size_t num_msms = 10; // static_cast<size_t>(engine.get_random_uint8());
    std::vector<AffineElement> expected(num_msms);

    std::vector<std::vector<fr>> batch_scalars(num_msms);
    std::vector<std::vector<AffineElement>> batch_input_points(num_msms);
    std::vector<std::span<const AffineElement>> batch_points_span;
    std::vector<ScalarSpan> batch_scalars_spans;

    for (size_t k = 0; k < num_msms; ++k) {
        const size_t num_points = static_cast<size_t>(engine.get_random_uint16()) % 1000;

        auto& scalars = batch_scalars[k];
        auto& input_points = batch_input_points[k];

        input_points.resize(num_points);
        scalars.resize(num_points);

        for (size_t i = 0; i < num_points; ++i) {
            const g1::affine_element point = g1::one * fr::random_element(&engine);
            input_points[i] = (point);
            scalars[i] = fr::random_element(&engine);
        }

        batch_points_span.push_back(batch_input_points[k]);
        batch_scalars_spans.push_back(batch_scalars[k]);

        Element single_expected;
        single_expected.self_set_infinity();
        for (size_t i = 0; i < num_points; ++i) {
            single_expected += (input_points[i] * scalars[i]);
        }
        expected[k] = single_expected;
    }

    std::vector<AffineElement> result =
        scalar_multiplication::MSM<Curve, false, 1>::batch_multi_scalar_mul(batch_points_span, batch_scalars_spans);

    EXPECT_EQ(result, expected);
}

TEST(ScalarMultiplication, BatchMultiScalarMulSparse)
{
    const size_t num_msms = 10; // static_cast<size_t>(engine.get_random_uint8());
    std::vector<AffineElement> expected(num_msms);

    std::vector<std::vector<fr>> batch_scalars(num_msms);
    std::vector<std::vector<AffineElement>> batch_input_points(num_msms);
    std::vector<std::span<const AffineElement>> batch_points_span;
    std::vector<ScalarSpan> batch_scalars_spans;

    for (size_t k = 0; k < num_msms; ++k) {
        const size_t num_points = 33; // static_cast<size_t>(engine.get_random_uint16()) % 1000;
        // size_t zero_offset = 13;
        // size_t num_nonzero = 10;
        auto& scalars = batch_scalars[k];
        auto& input_points = batch_input_points[k];

        input_points.resize(num_points);
        scalars.resize(num_points);

        for (size_t i = 0; i < 13; ++i) {
            const g1::affine_element point = g1::one * fr::random_element(&engine);
            input_points[i] = (point);
            scalars[i] = 0; // fr::random_element(&engine);
        }
        for (size_t i = 13; i < 23; ++i) {
            const g1::affine_element point = g1::one * fr::random_element(&engine);
            input_points[i] = (point);
            scalars[i] = fr::random_element(&engine);
        }
        for (size_t i = 23; i < num_points; ++i) {
            const g1::affine_element point = g1::one * fr::random_element(&engine);
            input_points[i] = (point);
            scalars[i] = 0; // fr::random_element(&engine);
        }
        batch_points_span.push_back(batch_input_points[k]);
        batch_scalars_spans.push_back(batch_scalars[k]);

        Element single_expected;
        single_expected.self_set_infinity();
        for (size_t i = 0; i < num_points; ++i) {
            single_expected += (input_points[i] * scalars[i]);
        }
        expected[k] = single_expected;
    }

    std::vector<AffineElement> result =
        scalar_multiplication::MSM<Curve, false, 1>::batch_multi_scalar_mul(batch_points_span, batch_scalars_spans);

    EXPECT_EQ(result, expected);
}

TEST(ScalarMultiplication, MSM)
{
    const size_t start_index = 1234;
    const size_t num_points = 101123;
    std::vector<fr> scalars(num_points);
    std::vector<AffineElement> input_points(num_points + start_index);

    for (size_t i = 0; i < num_points; ++i) {
        const g1::affine_element point = g1::one * fr::random_element(&engine);
        input_points[i] = (point);
        scalars[i] = fr::random_element(&engine);
    }
    for (size_t i = 0; i < start_index; ++i) {
        const g1::affine_element point = g1::one * fr::random_element(&engine);
        input_points[i + num_points] = (point);
    }

    // span is size 101123 but entries from 0 to 1023 are all zero
    PolynomialSpan<fr> scalar_span = PolynomialSpan<fr>(start_index, scalars);
    AffineElement result = scalar_multiplication::MSM<Curve, true, 1>::msm(input_points, scalar_span);

    Element expected;
    expected.self_set_infinity();
    for (size_t i = 0; i < num_points; ++i) {
        expected += (input_points[i + start_index] * scalars[i]);
    }

    AffineElement expected_affine(expected);
    EXPECT_EQ(result, expected_affine);
}

TEST(ScalarMultiplication, MSMAllZeroes)
{
    const size_t start_index = 1234;
    const size_t num_points = 101123;
    std::vector<fr> scalars(num_points);
    std::vector<AffineElement> input_points(num_points + start_index);

    for (size_t i = 0; i < num_points; ++i) {
        const g1::affine_element point = g1::one * fr::random_element(&engine);
        input_points[i] = (point);
        scalars[i] = 0;
    }
    for (size_t i = 0; i < start_index; ++i) {
        const g1::affine_element point = g1::one * fr::random_element(&engine);
        input_points[i + num_points] = (point);
    }
    PolynomialSpan<fr> scalar_span = PolynomialSpan<fr>(start_index, scalars);
    AffineElement result = scalar_multiplication::MSM<Curve, true, 1>::msm(input_points, scalar_span);

    EXPECT_EQ(result, Curve::Group::affine_point_at_infinity);
}

TEST(ScalarMultiplication, MSMEmptyPolynomial)
{
    const size_t num_points = 0;
    std::vector<fr> scalars(num_points);
    std::vector<AffineElement> input_points(num_points);
    PolynomialSpan<fr> scalar_span = PolynomialSpan<fr>(0, scalars);
    AffineElement result = scalar_multiplication::MSM<Curve, true, 1>::msm(input_points, scalar_span);

    EXPECT_EQ(result, Curve::Group::affine_point_at_infinity);
}
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
