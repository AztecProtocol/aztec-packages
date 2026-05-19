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

    static constexpr size_t num_points = 31013;

    // Bounds used by test_batch_multi_scalar_mul. Kept small so num_points (and therefore
    // SetUpTestSuite, which builds num_points random EC points) stays cheap — especially under wasm,
    // where the fixture build previously dominated the whole ecc_tests run.
    static constexpr size_t kMaxBatchMSMs = 32;
    static constexpr size_t kMaxBatchPointsPerMSM = 400;

    // Pinning invariants: these tests walk generators[]/scalars[] without bounds checks beyond an
    // occasional runtime ASSERT_LT. Pin the relationships at compile time so changing any one of
    // these constants in isolation cannot regress into an out-of-bounds walk.
    static_assert(kMaxBatchMSMs * kMaxBatchPointsPerMSM < num_points,
                  "test_batch_multi_scalar_mul can exceed num_points; "
                  "raise num_points or lower kMaxBatchMSMs / kMaxBatchPointsPerMSM");

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

    static std::vector<AffineElement> make_repeated_test_points(size_t num_pts)
    {
        std::vector<AffineElement> points(num_pts);
        for (size_t i = 0; i < num_pts; ++i) {
            points[i] = generators[i % generators.size()];
        }
        return points;
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

        const size_t num_msms = static_cast<size_t>(engine.get_random_uint8()) % kMaxBatchMSMs;
        std::vector<AffineElement> expected(num_msms);

        std::vector<std::vector<ScalarField>> batch_scalars_copies(num_msms);
        std::vector<size_t> start_indices(num_msms);
        std::vector<PolynomialSpan<ScalarField>> batch_scalars_spans;

        size_t vector_offset = 0;
        for (size_t k = 0; k < num_msms; ++k) {
            const size_t num_pts = static_cast<size_t>(engine.get_random_uint16()) % kMaxBatchPointsPerMSM;

            ASSERT_LT(vector_offset + num_pts, num_points);

            batch_scalars_copies[k].resize(num_pts);
            for (size_t i = 0; i < num_pts; ++i) {
                batch_scalars_copies[k][i] = scalars[vector_offset + i];
            }

            start_indices[k] = vector_offset;
            batch_scalars_spans.emplace_back(vector_offset, std::span<ScalarField>(batch_scalars_copies[k]));
            vector_offset += num_pts;

            std::span<const AffineElement> batch_points(&generators[start_indices[k]], num_pts);
            expected[k] = naive_msm(batch_scalars_copies[k], batch_points);
        }

        std::vector<AffineElement> result =
            scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(generators, batch_scalars_spans);

        EXPECT_EQ(result, expected);
    }

    void test_batch_multi_scalar_mul_sparse()
    {
        const size_t num_msms = 10;
        std::vector<AffineElement> expected(num_msms);

        std::vector<std::vector<ScalarField>> batch_scalars(num_msms);
        std::vector<PolynomialSpan<ScalarField>> batch_scalars_spans;

        for (size_t k = 0; k < num_msms; ++k) {
            const size_t num_pts = 33;
            auto& test_scalars = batch_scalars[k];

            test_scalars.resize(num_pts);

            size_t fixture_offset = k * num_pts;

            std::span<const AffineElement> batch_points(&generators[fixture_offset], num_pts);
            for (size_t i = 0; i < 13; ++i) {
                test_scalars[i] = 0;
            }
            for (size_t i = 13; i < 23; ++i) {
                test_scalars[i] = scalars[fixture_offset + i + 13];
            }
            for (size_t i = 23; i < num_pts; ++i) {
                test_scalars[i] = 0;
            }
            batch_scalars_spans.emplace_back(fixture_offset, std::span<ScalarField>(batch_scalars[k]));

            expected[k] = naive_msm(batch_scalars[k], batch_points);
        }

        std::vector<AffineElement> result =
            scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(generators, batch_scalars_spans);

        EXPECT_EQ(result, expected);
    }

    // Larger workload that crosses the batched dispatcher's `total_nonzero > 4096` eligibility
    // threshold so the multi-MSM Phases 1-6b pipeline (REBALANCE path) is exercised, not the
    // per-MSM delegation fallback.
    void test_batch_multi_scalar_mul_large_dense()
    {
        constexpr size_t num_msms = 4;
        constexpr size_t per_msm_n = 1 << 13; // 8192 points per MSM, total = 32768

        std::vector<AffineElement> expected(num_msms);
        std::vector<std::vector<ScalarField>> batch_scalars(num_msms);
        std::vector<PolynomialSpan<ScalarField>> batch_scalars_spans;

        for (size_t k = 0; k < num_msms; ++k) {
            batch_scalars[k].resize(per_msm_n);
            for (size_t i = 0; i < per_msm_n; ++i) {
                batch_scalars[k][i] = scalars[k * per_msm_n + i];
            }
            std::span<const AffineElement> pts(&generators[0], per_msm_n);
            batch_scalars_spans.emplace_back(0, std::span<ScalarField>(batch_scalars[k]));
            expected[k] = naive_msm(batch_scalars[k], pts);
        }

        std::vector<AffineElement> result =
            scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(generators, batch_scalars_spans);

        for (size_t k = 0; k < num_msms; ++k) {
            EXPECT_EQ(result[k], expected[k]) << "MSM " << k << " mismatched";
        }
    }

    // Ragged batch with mixed densities — the workload pattern for translator wires + databus.
    // K=5 MSMs of varying sizes, varying zero density, all sharing the same SRS prefix.
    void test_batch_multi_scalar_mul_ragged()
    {
        const std::vector<size_t> sizes = { 16384, 4096, 8192, 1024, 12000 };
        const size_t num_msms = sizes.size();

        std::vector<AffineElement> expected(num_msms);
        std::vector<std::vector<ScalarField>> batch_scalars(num_msms);
        std::vector<PolynomialSpan<ScalarField>> batch_scalars_spans;

        for (size_t k = 0; k < num_msms; ++k) {
            const size_t n = sizes[k];
            batch_scalars[k].resize(n);
            for (size_t i = 0; i < n; ++i) {
                if ((k == 1 || k == 3) && (i % 4 != 0)) {
                    batch_scalars[k][i] = ScalarField::zero();
                } else {
                    batch_scalars[k][i] = scalars[(k * 17 + i) % num_points];
                }
            }
            std::span<const AffineElement> pts(&generators[0], n);
            batch_scalars_spans.emplace_back(0, std::span<ScalarField>(batch_scalars[k]));
            expected[k] = naive_msm(batch_scalars[k], pts);
        }

        std::vector<AffineElement> result =
            scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(generators, batch_scalars_spans);

        for (size_t k = 0; k < num_msms; ++k) {
            EXPECT_EQ(result[k], expected[k]) << "MSM " << k << " (n=" << sizes[k] << ") mismatched";
        }
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

    void test_scalars_unchanged_after_batch_multi_scalar_mul()
    {
        const size_t num_msms = 3;
        const size_t num_pts = 100;

        std::vector<std::vector<ScalarField>> batch_scalars(num_msms);
        std::vector<std::vector<ScalarField>> scalars_copies(num_msms);
        std::vector<PolynomialSpan<ScalarField>> batch_scalar_spans;

        for (size_t k = 0; k < num_msms; ++k) {
            batch_scalars[k].resize(num_pts);
            scalars_copies[k].resize(num_pts);

            for (size_t i = 0; i < num_pts; ++i) {
                batch_scalars[k][i] = scalars[k * num_pts + i];
                scalars_copies[k][i] = batch_scalars[k][i];
            }

            batch_scalar_spans.emplace_back(k * num_pts, std::span<ScalarField>(batch_scalars[k]));
        }

        scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(generators, batch_scalar_spans);

        for (size_t k = 0; k < num_msms; ++k) {
            for (size_t i = 0; i < num_pts; ++i) {
                EXPECT_EQ(batch_scalars[k][i], scalars_copies[k][i])
                    << "Scalar at MSM " << k << ", index " << i << " was modified";
            }
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
        // Use enough points to trigger Pippenger (> PIPPENGER_THRESHOLD = 16)
        const size_t num_pts = 32;
        AffineElement base_point = generators[0];

        std::vector<AffineElement> points(num_pts, base_point);
        std::vector<ScalarField> test_scalars(num_pts);
        ScalarField scalar_sum = ScalarField::zero();

        for (size_t i = 0; i < num_pts; ++i) {
            test_scalars[i] = scalars[i];
            scalar_sum += test_scalars[i];
        }

        PolynomialSpan<ScalarField> scalar_span(0, test_scalars);
        // Duplicate points are an edge case (P + P requires doubling, not addition).
        // Must use handle_edge_cases=true for correctness with Pippenger.
        AffineElement result = scalar_multiplication::MSM<Curve>::msm(points, scalar_span, /*handle_edge_cases=*/true);

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

    /**
     * @brief Validate that a non-zero start_index in the PolynomialSpan is honoured.
     *
     * `pippenger`/`pippenger_unsafe` index the `points` argument from `start_index`,
     * so `points.size()` must cover `[start_index, start_index + n_used)`. The
     * scalars span starts at `start_index` with `n_used` elements.
     */
    void test_offset_span(size_t n_total, size_t start_index, size_t n_used, uint64_t seed)
    {
        auto& rng = numeric::get_debug_randomness(true, seed);
        std::vector<ScalarField> test_scalars(n_total);
        std::vector<AffineElement> input_points(start_index + n_used);
        for (size_t i = 0; i < n_total; ++i) {
            test_scalars[i] = ScalarField::random_element(&rng);
        }
        for (size_t i = 0; i < input_points.size(); ++i) {
            input_points[i] = AffineElement(Element::random_element(&rng));
        }

        PolynomialSpan<const ScalarField> scalar_span{
            start_index, std::span<const ScalarField>{ test_scalars.data() + start_index, n_used }
        };

        Element actual = scalar_multiplication::pippenger_unsafe<Curve>(scalar_span, input_points);

        Element expected;
        expected.self_set_infinity();
        for (size_t i = 0; i < n_used; ++i) {
            expected += input_points[start_index + i] * test_scalars[start_index + i];
        }
        EXPECT_EQ(AffineElement(actual), AffineElement(expected))
            << "Offset MSM mismatch at n_total=" << n_total << " start_index=" << start_index << " n_used=" << n_used;
    }

    /**
     * @brief Coverage at very large N (exercises the non-GLV path on WASM, where
     *        n_input > 2^16 disables the GLV decomposition).
     */
    void test_large_n_non_glv()
    {
        // n_input > 2^16 disables GLV → exercises NUM_BITS=254 path.
        const size_t num_pts = (size_t{ 1 } << 17) + 31;
        ASSERT_LE(num_pts, num_points);
        std::span<const AffineElement> points(&generators[0], num_pts);
        std::span<ScalarField> scalar_subspan(&scalars[0], num_pts);
        PolynomialSpan<ScalarField> scalar_span(0, scalar_subspan);

        AffineElement result = scalar_multiplication::MSM<Curve>::msm(points, scalar_span);
        AffineElement expected = naive_msm(scalar_subspan, points);
        EXPECT_EQ(result, expected);
    }

    /**
     * @brief Force every Pippenger window to contain a single mega-run of one digit.
     *
     *        Setting every input scalar to the same value means each window's signed-digit
     *        recoding is the same for all points. The Stage 6a schedule for any window is
     *        therefore a single contiguous run of that digit across all N entries — far
     *        longer than SUBCHUNK_ENTRIES_CAP, so each thread's slice gets split into many
     *        sub-chunks all targeting the same bucket slot. This exercises the
     *        seam-overflow merge path: the first sub-chunk writes the dense slot and every
     *        subsequent sub-chunk routes its partial through the per-window overflow buffer,
     *        which is folded back into the slot at end-of-window.
     */
    void test_msm_single_digit_mega_run()
    {
        const size_t num_pts = 100000;
        ASSERT_LE(num_pts, num_points);
        std::vector<ScalarField> uniform_scalars(num_pts, ScalarField(7));
        std::span<const AffineElement> points(&generators[0], num_pts);
        PolynomialSpan<ScalarField> scalar_span(0, uniform_scalars);

        AffineElement result = scalar_multiplication::MSM<Curve>::msm(points, scalar_span);
        AffineElement expected = naive_msm(std::span<ScalarField>(uniform_scalars), points);
        EXPECT_EQ(result, expected);
    }

    /**
     * @brief Stress-test the dedup pass's worst-case caps and the split-cluster carry.
     *
     *        Inputs: `num_pts` (default 50 000) scalars all equal to a single
     *        dedup-eligible value (`msb >= c`) — i.e. one mega-cluster. With the dedup
     *        caps `MAX_CLUSTERS = 16 384`, `MAX_MEMBERS = 32 768`, `MAX_CHUNK_MEMBERS = 8 192`,
     *        this exercises:
     *          1. The MAX_MEMBERS cap: only the first 32 K duplicates are recorded; the
     *             remaining ~17.5 K fall through to the standard pippenger path.
     *          2. The split-cluster carry in the chunked tree-reduce: the 32 K-member
     *             cluster is split across 4 chunks of 8 K, with the partial sum carried
     *             into the next chunk as that cluster's first member.
     *
     *        Activation is forced via the explicit `dedup_hint` parameter on
     *        `MSM<Curve>::msm`. Validation: result equals the naive MSM regardless
     *        of which scalars dedup picked up.
     */
    void test_msm_dedup_cap_and_carry()
    {
        const size_t num_pts = 50000;
        // Pick a dedup-eligible scalar: msb >= c (c ≈ 11 for n ≈ 50 000), so any value
        // ≥ 2^11 works. Use 2^200 so msb is firmly large for any c the dispatch picks.
        const ScalarField val = ScalarField(uint256_t(0, 0, 0, uint64_t{ 1 } << (200 - 192))); // 2^200
        std::vector<ScalarField> uniform_scalars(num_pts, val);
        std::vector<AffineElement> points = make_repeated_test_points(num_pts);
        PolynomialSpan<ScalarField> scalar_span(0, uniform_scalars);

        AffineElement result = scalar_multiplication::MSM<Curve>::msm(
            points, scalar_span, /*handle_edge_cases=*/false, /*dedup_hint=*/true);

        AffineElement expected =
            naive_msm(std::span<ScalarField>(uniform_scalars), std::span<const AffineElement>(points));
        EXPECT_EQ(result, expected);
    }

    /**
     * @brief Stress-test dedup cap fallback across many small clusters.
     *
     *        This shape opens more clusters than can fit in the flattened member slab:
     *        12K distinct scalar values, each repeated 3 times, produce 36K potential
     *        cluster members against the 32K member cap. Clusters that do not fit must
     *        remain unpublished and fall through the ordinary Pippenger path.
     */
    void test_msm_dedup_many_small_clusters_cap()
    {
        constexpr size_t NUM_CLUSTERS = 12000;
        constexpr size_t CLUSTER_SIZE = 3;
        const size_t num_pts = NUM_CLUSTERS * CLUSTER_SIZE;

        std::vector<ScalarField> scalars;
        scalars.reserve(num_pts);
        const uint256_t high_bit(0, 0, 0, uint64_t{ 1 } << (200 - 192));
        for (size_t i = 0; i < NUM_CLUSTERS; ++i) {
            const ScalarField val = ScalarField(high_bit + uint256_t(i + 1));
            for (size_t j = 0; j < CLUSTER_SIZE; ++j) {
                scalars.push_back(val);
            }
        }

        std::vector<AffineElement> points = make_repeated_test_points(num_pts);
        PolynomialSpan<ScalarField> scalar_span(0, scalars);

        AffineElement result =
            scalar_multiplication::MSM<Curve>::msm(points, scalar_span, /*handle_edge_cases=*/false, true);
        AffineElement expected = naive_msm(std::span<ScalarField>(scalars), std::span<const AffineElement>(points));
        EXPECT_EQ(result, expected);
    }

    // ============================================================================
    // Dispatch-coverage tests for `pippenger_round_parallel`.
    //
    // The function has several branches that need to all be exercised:
    //   * `n_input == 0` → infinity
    //   * `pts_per_thread < MIN_PTS_PER_THREAD_FOR_PIPPENGER` → trivial_msm_threaded
    //         (single-thread → trivial_msm, otherwise straus_msm per worker)
    //   * Otherwise → main pippenger pipeline
    //         - use_glv=true (n_input ≤ GLV_SMALL_N_THRESHOLD)
    //         - use_glv=false (n_input > GLV_SMALL_N_THRESHOLD; only on huge N)
    //   * `external_glv_doubled` provided vs not (drives one of the GLV-split branches)
    //
    // Each test below restores `bb::set_parallel_for_concurrency` to its original
    // value before returning, even if the assertion fails, so subsequent tests are
    // unaffected.
    // ============================================================================

    /// RAII helper to scope a `bb::set_parallel_for_concurrency` change to one test.
    class ConcurrencyScope {
        size_t prev_;

      public:
        explicit ConcurrencyScope(size_t n)
            : prev_(bb::get_num_cpus())
        {
            bb::set_parallel_for_concurrency(n);
        }
        ~ConcurrencyScope() { bb::set_parallel_for_concurrency(prev_); }
        ConcurrencyScope(const ConcurrencyScope&) = delete;
        ConcurrencyScope& operator=(const ConcurrencyScope&) = delete;
        ConcurrencyScope(ConcurrencyScope&&) = delete;
        ConcurrencyScope& operator=(ConcurrencyScope&&) = delete;
    };

    /// Run pippenger_round_parallel at the given size and validate it equals
    /// the naive MSM. `start_index` shifts the (scalars, points) slice in the input
    /// arrays. This is the workhorse used by all dispatch tests below.
    void check_internal_against_naive(size_t n, size_t start_index, const char* label)
    {
        ASSERT_LE(start_index + n, num_points) << label;

        std::span<ScalarField> scalar_subspan(&scalars[start_index], n);
        std::span<const AffineElement> point_subspan(&generators[0], start_index + n);
        PolynomialSpan<const ScalarField> scalar_span{ start_index, scalar_subspan };

        Element actual = scalar_multiplication::pippenger_round_parallel<Curve>(scalar_span, point_subspan);

        Element expected;
        expected.self_set_infinity();
        for (size_t i = 0; i < n; ++i) {
            expected += point_subspan[start_index + i] * scalar_subspan[i];
        }

        EXPECT_EQ(AffineElement(actual), AffineElement(expected))
            << label << " (n=" << n << ", start_index=" << start_index << ")";
    }

    /// Single-thread (`bb::set_parallel_for_concurrency(1)`) — every dispatch path
    /// must still produce a correct answer. Tests across N from 1 up past
    /// MIN_PTS_PER_THREAD_FOR_PIPPENGER and into the affine pippenger range.
    void test_pippenger_internal_single_thread()
    {
        ConcurrencyScope scope(1);
        // n_input == 0: infinity short-circuit.
        {
            std::span<const AffineElement> empty_points;
            std::span<ScalarField> empty_scalars;
            PolynomialSpan<const ScalarField> empty_span{ 0, empty_scalars };
            Element r = scalar_multiplication::pippenger_round_parallel<Curve>(empty_span, empty_points);
            EXPECT_TRUE(r.is_point_at_infinity());
        }
        // Walk N across all dispatch boundaries with a single thread. With 1 thread,
        // pts_per_thread == n; the trivial dispatch fires up to N=23, falls through
        // at N=24+. The fall-through path then runs the affine pippenger with
        // num_threads=1.
        for (size_t n : { size_t{ 1 },
                          size_t{ 2 },
                          size_t{ 3 },
                          size_t{ 4 },
                          size_t{ 23 },
                          size_t{ 24 },
                          size_t{ 25 },
                          size_t{ 32 },
                          size_t{ 64 },
                          size_t{ 100 },
                          size_t{ 192 },
                          size_t{ 1000 } }) {
            check_internal_against_naive(n, 0, "single_thread");
        }
    }

    /// Specifically the case the user called out: single thread,
    /// n = MIN_PTS_PER_THREAD_FOR_PIPPENGER + 1. Was where the old assert tripped.
    void test_pippenger_internal_single_thread_at_dispatch_threshold_plus_one()
    {
        ConcurrencyScope scope(1);
        constexpr size_t kThreshold = scalar_multiplication::MIN_PTS_PER_THREAD_FOR_PIPPENGER;
        check_internal_against_naive(kThreshold + 1, 0, "single_thread n=Threshold+1");
        // Also exercise N just below where `chunk_len = n / num_threads = n / 1 = n`
        // approaches MIN_BATCH_CAPACITY=32 — the (now-removed) brittle fallback used
        // to fire here; we want the affine path to still run and produce correct
        // output even with very small chunks.
        for (size_t n : { kThreshold + 1, size_t{ 32 }, size_t{ 33 }, size_t{ 50 }, size_t{ 100 } }) {
            check_internal_against_naive(n, 0, "single_thread small-chunk");
        }
    }

    /// Walk N across the dispatch threshold for HARDWARE_CONCURRENCY=2,4,8,16. At
    /// each thread count the dispatch fires when `pts_per_thread < 24`; we test
    /// just-below, exactly-at, and just-above the boundary, plus a midrange value.
    void test_pippenger_internal_dispatch_threshold_per_thread_count()
    {
        constexpr size_t kThreshold = scalar_multiplication::MIN_PTS_PER_THREAD_FOR_PIPPENGER;
        for (size_t threads : { size_t{ 2 }, size_t{ 4 }, size_t{ 8 }, size_t{ 16 } }) {
            ConcurrencyScope scope(threads);
            // Dispatch boundary is at n = threads * kThreshold (= pts_per_thread = 24).
            const size_t boundary = threads * kThreshold;
            for (size_t n : { boundary - 1, boundary, boundary + 1 }) {
                check_internal_against_naive(n, 0, "dispatch_boundary");
            }
        }
    }

    /// Same dispatch coverage but with a non-zero start_index — make sure the
    /// PolynomialSpan offset is honoured in both the dispatch (small-N → trivial)
    /// and fall-through (affine pippenger) paths.
    void test_pippenger_internal_offset_span_dispatch()
    {
        ConcurrencyScope scope(8);
        // Small N (will dispatch to trivial_msm_threaded).
        check_internal_against_naive(/*n=*/64, /*start_index=*/17, "offset small-N");
        // Just above dispatch threshold (8 threads → boundary at 192).
        check_internal_against_naive(/*n=*/200, /*start_index=*/13, "offset just-above-boundary");
        // Mid-N falls through into pippenger.
        check_internal_against_naive(/*n=*/1024, /*start_index=*/41, "offset mid-N");
    }

    /// Test a scalar layout that is sometimes problematic: all-zero scalars.
    /// The result must be infinity. Exercises both the trivial path (small N) and
    /// the affine path (mid N).
    void test_pippenger_internal_all_zero_scalars()
    {
        ConcurrencyScope scope(8);
        // Save and restore the global scalars buffer.
        std::vector<ScalarField> saved(scalars.begin(), scalars.begin() + 1024);
        for (size_t i = 0; i < saved.size(); ++i) {
            scalars[i] = ScalarField::zero();
        }
        for (size_t n : { size_t{ 1 }, size_t{ 24 }, size_t{ 100 }, size_t{ 1000 } }) {
            std::span<ScalarField> sub(&scalars[0], n);
            std::span<const AffineElement> pts(&generators[0], n);
            PolynomialSpan<const ScalarField> sp{ 0, sub };
            Element r = scalar_multiplication::pippenger_round_parallel<Curve>(sp, pts);
            EXPECT_TRUE(r.is_point_at_infinity()) << "all-zero n=" << n;
        }
        // Restore.
        for (size_t i = 0; i < saved.size(); ++i) {
            scalars[i] = saved[i];
        }
    }

    /// Mix of zero and non-zero scalars. The result should equal the naive sum
    /// excluding the zero terms. Tests the trivial path (small N) and affine path.
    void test_pippenger_internal_mixed_zero_scalars()
    {
        ConcurrencyScope scope(8);
        std::vector<ScalarField> saved(scalars.begin(), scalars.begin() + 1024);
        // Zero out every other scalar.
        for (size_t i = 0; i < 1024; i += 2) {
            scalars[i] = ScalarField::zero();
        }
        for (size_t n : { size_t{ 24 }, size_t{ 100 }, size_t{ 1024 } }) {
            check_internal_against_naive(n, 0, "mixed-zero");
        }
        // Restore.
        for (size_t i = 0; i < saved.size(); ++i) {
            scalars[i] = saved[i];
        }
    }

    /// Test scalars that exercise the endomorphism k2-overflow fix (k2 + r path).
    /// Picking scalar = 1 and scalar = -1 ensures we hit at least one of the
    /// boundary corrections. Plus randoms at fixed seeds.
    void test_pippenger_internal_extreme_scalars()
    {
        ConcurrencyScope scope(8);
        std::vector<ScalarField> saved(scalars.begin(), scalars.begin() + 256);

        // Scalar = 1
        for (auto& s : saved) {
            (void)s;
        }
        for (size_t i = 0; i < 256; ++i) {
            scalars[i] = ScalarField::one();
        }
        check_internal_against_naive(256, 0, "scalar=1");

        // Scalar = -1
        for (size_t i = 0; i < 256; ++i) {
            scalars[i] = -ScalarField::one();
        }
        check_internal_against_naive(256, 0, "scalar=-1");

        // Restore.
        for (size_t i = 0; i < saved.size(); ++i) {
            scalars[i] = saved[i];
        }
    }

    /// Direct calls to `trivial_msm_threaded` at a range of (thread_count, n) pairs.
    /// Verifies the per-worker straus split produces the same result as a naive sum
    /// regardless of slice_n. n=1 hits the `num_threads <= 1 → trivial_msm` early-out.
    void test_trivial_msm_threaded_per_worker_paths()
    {
        for (size_t threads : { size_t{ 1 }, size_t{ 2 }, size_t{ 4 }, size_t{ 8 } }) {
            ConcurrencyScope scope(threads);
            for (size_t n : { size_t{ 1 }, size_t{ 2 }, size_t{ 8 }, size_t{ 32 }, size_t{ 80 }, size_t{ 160 } }) {
                std::span<ScalarField> sub(&scalars[0], n);
                std::span<const AffineElement> pts(&generators[0], n);
                PolynomialSpan<const ScalarField> sp{ 0, sub };
                Element actual = scalar_multiplication::trivial_msm_threaded<Curve>(sp, pts);
                Element expected;
                expected.self_set_infinity();
                for (size_t i = 0; i < n; ++i) {
                    expected += pts[i] * sub[i];
                }
                EXPECT_EQ(AffineElement(actual), AffineElement(expected))
                    << "trivial_msm_threaded threads=" << threads << " n=" << n;
            }
        }
    }

    /// Large-N coverage: GLV boundary on WASM is 2^16; on native 2^13. Test crossing
    /// the boundary in both directions to exercise the use_glv=true and use_glv=false
    /// pipelines. Native already has `LargeNNonGLV` for the false case; we add the
    /// just-above and just-below GLV-boundary tests here.
    void test_pippenger_internal_glv_boundary()
    {
        ConcurrencyScope scope(8);
#ifdef __wasm__
        constexpr size_t glv_threshold = size_t{ 1 } << 16;
#else
        constexpr size_t glv_threshold = size_t{ 1 } << 13;
#endif
        if (glv_threshold >= num_points) {
            GTEST_SKIP() << "GLV threshold " << glv_threshold << " not exercisable with " << num_points
                         << " precomputed points";
        }
        // Just below threshold: use_glv=true.
        check_internal_against_naive(glv_threshold - 1, 0, "glv-boundary minus-1 (use_glv=true)");
        // Exactly at threshold: use_glv=true (≤ comparison).
        check_internal_against_naive(glv_threshold, 0, "glv-boundary exact (use_glv=true)");
        // Just above: use_glv=false.
        check_internal_against_naive(glv_threshold + 1, 0, "glv-boundary plus-1 (use_glv=false)");
    }

    /// Regression test for the arena allocator's alignment handling.
    /// `make_unique_for_overwrite<std::byte[]>` returns a buffer at default-new
    /// alignment (16 on x86_64); Element is alignas(32) and AffineElement is
    /// alignas(64). If the arena allocator only aligns the byte offset rather
    /// than the absolute address, allocations land on a 16-byte-aligned but
    /// 32-byte-misaligned address, and the AVX `vmovdqa` clang lowers
    /// `std::fill_n(window_partial_sums, …, point_at_infinity)` into raises
    /// #GP -> SIGSEGV. This test deliberately passes an external arena whose
    /// base is 16-byte aligned but not 32-byte aligned to make the failure
    /// mode reproducible regardless of system allocator behaviour.
    void test_pippenger_internal_misaligned_external_arena()
    {
        ConcurrencyScope scope(1);
        constexpr size_t kThreshold = scalar_multiplication::MIN_PTS_PER_THREAD_FOR_PIPPENGER;
        for (size_t n : { kThreshold + 1, size_t{ 50 }, size_t{ 100 }, size_t{ 256 } }) {
            std::span<ScalarField> scalar_subspan(&scalars[0], n);
            std::span<const AffineElement> point_subspan(&generators[0], n);
            PolynomialSpan<const ScalarField> scalar_span{ 0, scalar_subspan };

            constexpr size_t kArenaCapacity = size_t{ 64 } * 1024 * 1024;
            std::vector<std::byte> raw(kArenaCapacity + 64);
            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast)
            const auto base = reinterpret_cast<uintptr_t>(raw.data());
            const uintptr_t aligned32 = (base + 31) & ~uintptr_t{ 31 };
            std::byte* misaligned = raw.data() + (aligned32 - base) + 16;
            ASSERT_EQ(reinterpret_cast<uintptr_t>(misaligned) % 32, size_t{ 16 });
            std::span<std::byte> external_arena(misaligned, kArenaCapacity);

            Element actual = scalar_multiplication::pippenger_round_parallel<Curve>(
                scalar_span, point_subspan, /*dedup_hint=*/false, {}, external_arena);

            Element expected;
            expected.self_set_infinity();
            for (size_t i = 0; i < n; ++i) {
                expected += point_subspan[i] * scalar_subspan[i];
            }
            EXPECT_EQ(AffineElement(actual), AffineElement(expected)) << "misaligned external arena (n=" << n << ")";
        }
    }
};

using CurveTypes = ::testing::Types<bb::curve::BN254, bb::curve::Grumpkin>;
TYPED_TEST_SUITE(ScalarMultiplicationTest, CurveTypes);

// ======================= Test Wrappers =======================

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
TYPED_TEST(ScalarMultiplicationTest, BatchMultiScalarMulLargeDense)
{
    this->test_batch_multi_scalar_mul_large_dense();
}
TYPED_TEST(ScalarMultiplicationTest, BatchMultiScalarMulRagged)
{
    this->test_batch_multi_scalar_mul_ragged();
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
TYPED_TEST(ScalarMultiplicationTest, ScalarsUnchangedAfterBatchMultiScalarMul)
{
    this->test_scalars_unchanged_after_batch_multi_scalar_mul();
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
TYPED_TEST(ScalarMultiplicationTest, OffsetSpan)
{
    this->test_offset_span(/*n_total=*/4096, /*start_index=*/7, /*n_used=*/512, 0x5eedu + 33);
    this->test_offset_span(/*n_total=*/8192, /*start_index=*/4097, /*n_used=*/2048, 0x5eedu + 34);
}
TYPED_TEST(ScalarMultiplicationTest, LargeNNonGLV)
{
    this->test_large_n_non_glv();
}
TYPED_TEST(ScalarMultiplicationTest, MSMSingleDigitMegaRun)
{
    this->test_msm_single_digit_mega_run();
}
TYPED_TEST(ScalarMultiplicationTest, MSMDedupCapAndCarry)
{
    this->test_msm_dedup_cap_and_carry();
}
TYPED_TEST(ScalarMultiplicationTest, MSMDedupManySmallClustersCap)
{
    this->test_msm_dedup_many_small_clusters_cap();
}

// Dispatch-coverage tests for `pippenger_round_parallel`.
TYPED_TEST(ScalarMultiplicationTest, PippengerInternalSingleThread)
{
    this->test_pippenger_internal_single_thread();
}
TYPED_TEST(ScalarMultiplicationTest, PippengerInternalSingleThreadAtDispatchThresholdPlusOne)
{
    this->test_pippenger_internal_single_thread_at_dispatch_threshold_plus_one();
}
TYPED_TEST(ScalarMultiplicationTest, PippengerInternalDispatchThresholdPerThreadCount)
{
    this->test_pippenger_internal_dispatch_threshold_per_thread_count();
}
TYPED_TEST(ScalarMultiplicationTest, PippengerInternalOffsetSpanDispatch)
{
    this->test_pippenger_internal_offset_span_dispatch();
}
TYPED_TEST(ScalarMultiplicationTest, PippengerInternalAllZeroScalars)
{
    this->test_pippenger_internal_all_zero_scalars();
}
TYPED_TEST(ScalarMultiplicationTest, PippengerInternalMixedZeroScalars)
{
    this->test_pippenger_internal_mixed_zero_scalars();
}
TYPED_TEST(ScalarMultiplicationTest, PippengerInternalExtremeScalars)
{
    this->test_pippenger_internal_extreme_scalars();
}
TYPED_TEST(ScalarMultiplicationTest, TrivialMsmThreadedPerWorkerPaths)
{
    this->test_trivial_msm_threaded_per_worker_paths();
}
TYPED_TEST(ScalarMultiplicationTest, PippengerInternalGlvBoundary)
{
    this->test_pippenger_internal_glv_boundary();
}
TYPED_TEST(ScalarMultiplicationTest, PippengerInternalMisalignedExternalArena)
{
    this->test_pippenger_internal_misaligned_external_arena();
}

// NOTE: the curve-independent `PartitionByWeight` unit tests that previously lived here
// exercised `MSM<>::MSMWorkUnit` / `MSM<>::partition_by_weight` from the OLD radix-sort +
// bucket-accumulator pippenger. Both were removed in the round-parallel refactor; the
// equivalent multi-MSM work-unit balancing logic has not yet been built (will live in
// `pippenger_round_parallel_batched` once Phases 1-6b are complete). The tests are left
// out for now and will be rewritten against the batched dispatcher's partitioner.

// Variable-c (split-c) Pippenger dispatch — synthetic distributions per spec §"Validation".
// These force SPLIT to fire (cliff / decaying / half-zero / all-large) or to fall through
// (uniform-random / all-zero) and validate the result against `naive_msm`.
template <class Curve> class VariableWindowSplitDispatchTest : public ::testing::Test {
  public:
    using Group = typename Curve::Group;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using ScalarField = typename Curve::ScalarField;

    static AffineElement naive_msm(std::span<ScalarField> input_scalars, std::span<const AffineElement> input_points)
    {
        return ScalarMultiplicationTest<Curve>::naive_msm(input_scalars, input_points);
    }

    static std::vector<AffineElement> make_points(size_t n)
    {
        std::vector<AffineElement> pts(n);
        parallel_for_range(n, [&](size_t s, size_t e) {
            for (size_t i = s; i < e; ++i) {
                pts[i] = Group::one * Curve::ScalarField::random_element(&engine);
            }
        });
        return pts;
    }

    static ScalarField scalar_below_2pow(size_t bits)
    {
        // Random scalar with canonical-form msb < `bits`. We pull a random ScalarField
        // (Montgomery), reduce to canonical, mask the canonical representation, and
        // reconstruct via the canonical-uint256_t constructor (which re-Montgomery-encodes).
        // Masking the .data field directly would mask the Montgomery form, producing garbage.
        if (bits >= 254) {
            return ScalarField::random_element(&engine);
        }
        ScalarField r = ScalarField::random_element(&engine);
        ScalarField canonical = r.from_montgomery_form_reduced();
        auto& d = canonical.data;
        size_t bits_remaining = bits;
        for (size_t l = 0; l < 4; ++l) {
            const size_t take = std::min<size_t>(64, bits_remaining);
            const uint64_t mask = (take == 64)  ? ~uint64_t{ 0 }
                                  : (take == 0) ? uint64_t{ 0 }
                                                : ((uint64_t{ 1 } << take) - 1);
            d[l] &= mask;
            if (bits_remaining > take) {
                bits_remaining -= take;
            } else {
                bits_remaining = 0;
            }
        }
        return ScalarField(uint256_t(d[0], d[1], d[2], d[3]));
    }

    static void check_against_naive(std::span<ScalarField> scalars, std::span<const AffineElement> points)
    {
        AffineElement expected = naive_msm(scalars, points);
        AffineElement actual = scalar_multiplication::MSM<Curve>::msm(points, PolynomialSpan<ScalarField>(0, scalars));
        EXPECT_EQ(actual, expected);
    }

    static constexpr size_t kN = 131072;

    void test_cliff()
    {
        // All scalars < 2^30 plus 16 large scalars (full 254-bit). SPLIT must fire.
        constexpr size_t large_count = 16;
        auto pts = make_points(kN);
        std::vector<ScalarField> ss(kN);
        for (size_t i = 0; i < kN - large_count; ++i) {
            ss[i] = scalar_below_2pow(30);
        }
        for (size_t i = kN - large_count; i < kN; ++i) {
            ss[i] = ScalarField::random_element(&engine);
        }
        check_against_naive(ss, pts);
    }

    void test_decaying()
    {
        // Half below-128 + half below-160.
        auto pts = make_points(kN);
        std::vector<ScalarField> ss(kN);
        for (size_t k = 0; k < kN / 2; ++k) {
            ss[k] = scalar_below_2pow(128);
        }
        for (size_t k = kN / 2; k < kN; ++k) {
            ss[k] = scalar_below_2pow(160);
        }
        check_against_naive(ss, pts);
    }

    void test_uniform_random()
    {
        // Standard random scalars — must hit the NO_SPLIT fall-through.
        auto pts = make_points(kN);
        std::vector<ScalarField> ss(kN);
        for (size_t k = 0; k < kN; ++k) {
            ss[k] = ScalarField::random_element(&engine);
        }
        check_against_naive(ss, pts);
    }

    void test_all_zero()
    {
        auto pts = make_points(kN);
        std::vector<ScalarField> ss(kN, ScalarField::zero());
        AffineElement actual =
            scalar_multiplication::MSM<Curve>::msm(pts, PolynomialSpan<ScalarField>(0, std::span<ScalarField>(ss)));
        EXPECT_TRUE(actual.is_point_at_infinity());
    }

    void test_half_zero()
    {
        // Half zero, half full-random.
        auto pts = make_points(kN);
        std::vector<ScalarField> ss(kN, ScalarField::zero());
        for (size_t k = 0; k < kN / 2; ++k) {
            ss[k] = ScalarField::random_element(&engine);
        }
        check_against_naive(ss, pts);
    }

    void test_all_large()
    {
        // Every scalar full-range — NO_SPLIT (Guard A rejects).
        auto pts = make_points(kN);
        std::vector<ScalarField> ss(kN);
        for (size_t k = 0; k < kN; ++k) {
            ss[k] = ScalarField::random_element(&engine);
        }
        check_against_naive(ss, pts);
    }

    // Synthetic minimal repro for the SPLIT bookkeeping bug:
    // half scalars with msb < 64, half full-range. SPLIT may fire (set VAR_WINDOW_FORCE_SPLIT to be sure).
    void test_mid_distribution()
    {
        auto pts = make_points(kN);
        std::vector<ScalarField> ss(kN);
        for (size_t k = 0; k < kN / 2; ++k) {
            ss[k] = scalar_below_2pow(60);
        }
        for (size_t k = kN / 2; k < kN; ++k) {
            ss[k] = ScalarField::random_element(&engine);
        }
        check_against_naive(ss, pts);
    }

    // All scalars with canonical msb < 192. Triggers GLV path's regular (non-shortcut) lattice
    // reduction for inputs that fit in 192 bits but not 128 — exposing whether scalars
    // strictly below the 128-bit shortcut threshold but with non-trivial msb cause a SPLIT
    // bookkeeping bug.
    void test_below_192()
    {
        auto pts = make_points(kN);
        std::vector<ScalarField> ss(kN);
        for (size_t k = 0; k < kN; ++k) {
            ss[k] = scalar_below_2pow(192);
        }
        check_against_naive(ss, pts);
    }

    // Pin-style bitwise-identity check: with VAR_WINDOW_FORCE_SPLIT setting window_bits_lo == window_bits_hi ==
    // window_bits_unsplit and b_star at a clean multiple of window_bits_unsplit, the SPLIT path's window decomposition
    // is structurally identical to NO_SPLIT. Any divergence in the resulting MSM points to a bookkeeping bug
    // (per-region driver, schedule layout, idx_large gating in upper region).
    void test_force_split_bitwise_identity()
    {
        auto pts = make_points(kN);
        std::vector<ScalarField> ss(kN);
        for (size_t k = 0; k < kN; ++k) {
            ss[k] = scalar_below_2pow(160);
        }
        check_against_naive(ss, pts);
    }
};

using VariableWindowCurveTypes = ::testing::Types<bb::curve::BN254, bb::curve::Grumpkin>;
TYPED_TEST_SUITE(VariableWindowSplitDispatchTest, VariableWindowCurveTypes);

TYPED_TEST(VariableWindowSplitDispatchTest, Cliff)
{
    this->test_cliff();
}
TYPED_TEST(VariableWindowSplitDispatchTest, Decaying)
{
    this->test_decaying();
}
TYPED_TEST(VariableWindowSplitDispatchTest, UniformRandom)
{
    this->test_uniform_random();
}
TYPED_TEST(VariableWindowSplitDispatchTest, AllZero)
{
    this->test_all_zero();
}
TYPED_TEST(VariableWindowSplitDispatchTest, HalfZero)
{
    this->test_half_zero();
}
TYPED_TEST(VariableWindowSplitDispatchTest, AllLarge)
{
    this->test_all_large();
}
TYPED_TEST(VariableWindowSplitDispatchTest, MidDistribution)
{
    this->test_mid_distribution();
}
TYPED_TEST(VariableWindowSplitDispatchTest, Below192)
{
    this->test_below_192();
}
TYPED_TEST(VariableWindowSplitDispatchTest, ForceSplitBitwiseIdentity)
{
    this->test_force_split_bitwise_identity();
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
