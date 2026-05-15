/**
 * @brief Pippenger MSM benchmarks
 *
 * Single MSM (pippenger_unsafe) and batch MSM (batch_multi_scalar_mul).
 * Batch config modeled after AVM: ~2618 wire polys of size 2^21, committed in batches of 32.
 */
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/polynomials/polynomial_arithmetic.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <benchmark/benchmark.h>

#include "barretenberg/common/google_bb_bench.hpp"

using namespace benchmark;

using Curve = bb::curve::BN254;
using Fr = Curve::ScalarField;
using G1 = Curve::AffineElement;

namespace {

class PippengerBench : public benchmark::Fixture {
  public:
    static constexpr size_t MAX_POINTS = 1 << 22;
    std::shared_ptr<bb::srs::factories::Crs<Curve>> srs;
    std::vector<Fr> scalars;
    bb::numeric::RNG& engine = bb::numeric::get_debug_randomness();

    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
        srs = bb::srs::get_crs_factory<Curve>()->get_crs(MAX_POINTS);

        scalars.resize(MAX_POINTS);
        for (auto& x : scalars) {
            x = Fr::random_element(&engine);
        }
    }
};

// ===================== Single MSM =====================

BENCHMARK_DEFINE_F(PippengerBench, PippengerUnsafe)(benchmark::State& state)
{
    const size_t num_points = static_cast<size_t>(state.range(0));
    std::span<const G1> points = srs->get_monomial_points().subspan(0, num_points);
    std::span<Fr> span(&scalars[0], num_points);
    bb::PolynomialSpan<Fr> poly_scalars(0, span);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication::pippenger_unsafe<Curve>(poly_scalars, points);
    }
}

// ===== Round-parallel MSM (A) — window-partitioned, independent of pippenger_unsafe =====

BENCHMARK_DEFINE_F(PippengerBench, PippengerRoundParallel)(benchmark::State& state)
{
    const size_t num_threads = static_cast<size_t>(state.range(0));
    const size_t num_points = static_cast<size_t>(state.range(1));
    std::span<const G1> points = srs->get_monomial_points().subspan(0, num_points);
    std::span<Fr> span(&scalars[0], num_points);
    bb::PolynomialSpan<Fr> poly_scalars(0, span);

    const size_t original_concurrency = bb::get_num_cpus();
    bb::set_parallel_for_concurrency(num_threads);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication::pippenger_round_parallel<Curve>(poly_scalars, points);
    }

    bb::set_parallel_for_concurrency(original_concurrency);
}

BENCHMARK_DEFINE_F(PippengerBench, PippengerUnsafeThreads)(benchmark::State& state)
{
    const size_t num_threads = static_cast<size_t>(state.range(0));
    const size_t num_points = static_cast<size_t>(state.range(1));
    std::span<const G1> points = srs->get_monomial_points().subspan(0, num_points);
    std::span<Fr> span(&scalars[0], num_points);
    bb::PolynomialSpan<Fr> poly_scalars(0, span);

    const size_t original_concurrency = bb::get_num_cpus();
    bb::set_parallel_for_concurrency(num_threads);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication::pippenger_unsafe<Curve>(poly_scalars, points);
    }

    bb::set_parallel_for_concurrency(original_concurrency);
}

// ===================== Batch MSM =====================

BENCHMARK_DEFINE_F(PippengerBench, BatchMSM)(benchmark::State& state)
{
    const size_t num_polys = static_cast<size_t>(state.range(0));
    const size_t poly_size = static_cast<size_t>(state.range(1));

    std::vector<std::vector<Fr>> all_scalars(num_polys);
    std::vector<bb::PolynomialSpan<Fr>> scalar_spans;
    std::span<const G1> points = srs->get_monomial_points().subspan(0, poly_size);

    for (size_t i = 0; i < num_polys; ++i) {
        all_scalars[i].resize(poly_size);
        for (auto& s : all_scalars[i]) {
            s = Fr::random_element(&engine);
        }
        scalar_spans.emplace_back(0, std::span<Fr>(all_scalars[i]));
    }

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(points, scalar_spans, false);
    }
}

// ===================== Batched MSM — Chonk-representative workloads =====================
//
// Two paths are benchmarked side-by-side for each scenario:
//   - "Batched" calls MSM::batch_multi_scalar_mul (new multi-MSM Phases 1-6b pipeline).
//   - "PerMsm" calls pippenger_round_parallel(...) once per MSM (the legacy fallback —
//     equivalent to what MSM::batch_multi_scalar_mul did before the multi-MSM dispatcher).
//
// The Batched/PerMsm ratio is the metric of interest: it shows the lift from batching
// the round-parallel scaffolding (GLV doubling, Constantine recoding, schedule build)
// once per batch_commit instead of K times.
//
// Scenarios are picked to mirror the workloads observed in chonk profiles:
//   - TranslatorWires_2_17 / 2_14: K=4 dense BN254, the regression case from the
//     translator-wire batch_commit hot path.
//   - MegaOink_K11: simulates a full Mega oink wire commit (K=11, all same SRS prefix,
//     all dense) — the headline target for batching.
//   - ECCVMSparse_half: K=4 with ~50% zero scalars, the ECCVM-wire pattern that the
//     OLD MSM optimised via non-zero work-unit weighting.
//   - DatabusSparse_mostly0: K=8 short polys (n=16384) with ~75% zero scalars —
//     the databus-inverse pattern.

namespace {
struct BatchScenario {
    const char* name;
    size_t k;            // number of MSMs
    size_t n;            // points per MSM (uniform within each scenario)
    double zero_density; // probability of a scalar being zero (0.0 = dense)
};

std::vector<std::vector<Fr>> build_batch_scalars(
    size_t k, size_t n, double zero_density, bb::numeric::RNG& engine, std::span<const Fr> scalar_pool)
{
    std::vector<std::vector<Fr>> out(k);
    for (size_t m = 0; m < k; ++m) {
        out[m].resize(n);
        for (size_t i = 0; i < n; ++i) {
            const bool zero = zero_density > 0.0 && (static_cast<double>(engine.get_random_uint32() & 0xFFFFFU) /
                                                     static_cast<double>(0x100000U)) < zero_density;
            out[m][i] = zero ? Fr::zero() : scalar_pool[(m * n + i) % scalar_pool.size()];
        }
    }
    return out;
}
} // namespace

BENCHMARK_DEFINE_F(PippengerBench, BatchedChonk)(benchmark::State& state)
{
    // TODO: these are NOT representative benchmarks. For TranslatorWires_2_17, TranslatorWires_2_14, ECCVMSparse_half:
    // k should be 100
    const size_t scenario_idx = static_cast<size_t>(state.range(0));
    static const std::array<BatchScenario, 7> scenarios{ {
        { "TranslatorWires_2_17", 4, 1U << 17, 0.0 },
        { "TranslatorWires_2_14", 4, 1U << 14, 0.0 },
        { "MegaOink_K11", 11, 1U << 17, 0.0 },
        { "ECCVMSparse_half", 4, 1U << 17, 0.5 },
        { "DatabusSparse_mostly0", 8, 1U << 14, 0.75 },
        // K >= T scenarios — exercise the threadsplit fast path.
        { "ECCVM_K100_2_14_half", 100, 1U << 14, 0.5 },
        { "DatabusLikeMany_K20", 20, 1U << 12, 0.75 },
    } };
    const auto& sc = scenarios[scenario_idx];
    state.SetLabel(sc.name);

    auto all_scalars = build_batch_scalars(sc.k, sc.n, sc.zero_density, engine, scalars);
    std::vector<bb::PolynomialSpan<Fr>> scalar_spans;
    std::span<const G1> points = srs->get_monomial_points().subspan(0, sc.n);
    for (size_t m = 0; m < sc.k; ++m) {
        scalar_spans.emplace_back(0, std::span<Fr>(all_scalars[m]));
    }

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(points, scalar_spans, false);
    }
}

BENCHMARK_DEFINE_F(PippengerBench, PerMsmChonk)(benchmark::State& state)
{
    const size_t scenario_idx = static_cast<size_t>(state.range(0));
    static const std::array<BatchScenario, 7> scenarios{ {
        { "TranslatorWires_2_17", 4, 1U << 17, 0.0 },
        { "TranslatorWires_2_14", 4, 1U << 14, 0.0 },
        { "MegaOink_K11", 11, 1U << 17, 0.0 },
        { "ECCVMSparse_half", 4, 1U << 17, 0.5 },
        { "DatabusSparse_mostly0", 8, 1U << 14, 0.75 },
        // K >= T scenarios — exercise the threadsplit fast path.
        { "ECCVM_K100_2_14_half", 100, 1U << 14, 0.5 },
        { "DatabusLikeMany_K20", 20, 1U << 12, 0.75 },
    } };
    const auto& sc = scenarios[scenario_idx];
    state.SetLabel(sc.name);

    auto all_scalars = build_batch_scalars(sc.k, sc.n, sc.zero_density, engine, scalars);
    std::span<const G1> points = srs->get_monomial_points().subspan(0, sc.n);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        for (size_t m = 0; m < sc.k; ++m) {
            bb::PolynomialSpan<const Fr> sp(0, std::span<const Fr>(all_scalars[m].data(), sc.n));
            (void)bb::scalar_multiplication::pippenger_round_parallel<Curve>(sp, points);
        }
    }
}

/**
 * @brief Batch MSM benchmark variant added to investigate `AztecProtocol/barretenberg#1656`.
 *
 * The issue is concerned about the single-threaded final reduction step in
 * `MSM::batch_multi_scalar_mul(...)` when the work is split across a large number of threads,
 * e.g. `2^16` points with `256` threads.
 *
 * We run a single MSM (num_polys = 1) and sweep thread counts and MSM sizes to make the
 * final reduction overhead visible in the phase breakdown reported via `BB_BENCH` counters.
 */
BENCHMARK_DEFINE_F(PippengerBench, BatchMSM_1656)(benchmark::State& state)
{
    const size_t num_threads = static_cast<size_t>(state.range(0));
    const size_t msm_size = static_cast<size_t>(state.range(1));

    std::vector<Fr> msm_scalars(msm_size);
    for (auto& s : msm_scalars) {
        s = Fr::random_element(&engine);
    }

    std::vector<bb::PolynomialSpan<Fr>> scalar_spans;
    scalar_spans.emplace_back(0, std::span<Fr>(msm_scalars));
    std::span<const G1> points = srs->get_monomial_points().subspan(0, msm_size);

    // This is thread-local: restore after the benchmark so other cases in this binary are unaffected.
    const size_t original_concurrency = bb::get_num_cpus();
    bb::set_parallel_for_concurrency(num_threads);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(points, scalar_spans, false);
    }

    bb::set_parallel_for_concurrency(original_concurrency);
}

// ===================== Registration =====================

// Single MSM: 2^14 to 2^20
BENCHMARK_REGISTER_F(PippengerBench, PippengerUnsafe)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(4)
    ->Range(1 << 14, 1 << 20);

// Batch MSM: {num_polynomials, polynomial_size}
// AVM-like: 32 polys of size 2^21 (one batch from ~2618 wire polys committed in batches of 32)
BENCHMARK_REGISTER_F(PippengerBench, BatchMSM)
    ->Unit(benchmark::kMillisecond)
    ->Args({ 32, 1 << 19 })
    ->Args({ 32, 1 << 21 });

// Issue #1656 target: {threads=256, msm_size}
BENCHMARK_REGISTER_F(PippengerBench, BatchMSM_1656)
    ->Unit(benchmark::kMillisecond)
    ->Args({ 256, 1 << 16 })
    ->Args({ 256, 1 << 20 });

// Chonk-representative batched MSM workloads. Scenario index 0..6 indexes into the
// scenario table above. Run "Batched" and "PerMsm" with matching indices and compare.
BENCHMARK_REGISTER_F(PippengerBench, BatchedChonk)->Unit(benchmark::kMillisecond)->DenseRange(0, 6, 1);
BENCHMARK_REGISTER_F(PippengerBench, PerMsmChonk)->Unit(benchmark::kMillisecond)->DenseRange(0, 6, 1);

// Grid sweep for A vs B: {threads, size}. N covers 2^7..2^21 (with extra in-between
// points around the GLV crossover).
BENCHMARK_REGISTER_F(PippengerBench, PippengerRoundParallel)
    ->Unit(benchmark::kMillisecond)
    ->ArgsProduct({ { 1, 4, 8, 12, 16, 32, 64, 128 },
                    { 1 << 7,
                      1 << 8,
                      1 << 9,
                      1 << 10,
                      1 << 11,
                      1 << 12,
                      1 << 13,
                      1 << 14,
                      1 << 15,
                      3 << 14,
                      1 << 16,
                      3 << 15,
                      1 << 17,
                      3 << 16,
                      1 << 18,
                      1 << 19,
                      1 << 20,
                      1 << 21 } });

BENCHMARK_REGISTER_F(PippengerBench, PippengerUnsafeThreads)
    ->Unit(benchmark::kMillisecond)
    ->ArgsProduct({ { 1, 4, 8, 12, 16, 32, 64, 128 },
                    { 1 << 9,
                      1 << 10,
                      1 << 11,
                      1 << 12,
                      1 << 13,
                      1 << 14,
                      1 << 15,
                      1 << 16,
                      1 << 17,
                      1 << 18,
                      1 << 19,
                      1 << 20 } });

} // namespace

BENCHMARK_MAIN();
