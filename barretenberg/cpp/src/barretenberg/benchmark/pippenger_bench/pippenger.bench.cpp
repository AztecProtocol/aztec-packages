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

#include <cstdint>
#include <limits>
#include <vector>

using namespace benchmark;

using Curve = bb::curve::BN254;
using Fr = Curve::ScalarField;
using G1 = Curve::AffineElement;

namespace {

class PippengerBench : public benchmark::Fixture {
  public:
    static constexpr size_t MAX_POINTS = 1 << 21;
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

// ===== Per-stage scaling sweep (single MSM, native concurrency) =====
// A single round-parallel MSM at the runtime's native concurrency (bb::get_num_cpus()
// natively; HARDWARE_CONCURRENCY under wasmtime), swept over 2^15..2^19 — the MSM-size band
// the pinned Chonk tx flows actually exercise (light flows peak ~2^16, storage_7 ~2^18).
// 2^20/2^21 are an AVM/rollup workload and are intentionally not in this tx-flow sweep. Unlike
// PippengerRoundParallel this fixes a single thread axis, so the per-stage BB_BENCH
// breakdown is clean. Run with BB_BENCH=1 to dump the Stage1..Stage7 hierarchical timings
// per size; comparing native vs wasmtime per-stage scaling isolates which stage fails to
// scale natively. Under wasm the breakdown requires ENABLE_WASM_BENCH=ON at build time.
BENCHMARK_DEFINE_F(PippengerBench, PippengerRoundParallelScaling)(benchmark::State& state)
{
    const size_t num_points = static_cast<size_t>(state.range(0));
    std::span<const G1> points = srs->get_monomial_points().subspan(0, num_points);
    std::span<Fr> span(&scalars[0], num_points);
    bb::PolynomialSpan<Fr> poly_scalars(0, span);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication::pippenger_round_parallel<Curve>(poly_scalars, points);
    }
}

// Legacy counterpart of the scaling sweep: byte-identical merge-train MSM
// (legacy::pippenger_unsafe) over the same points/sizes, with the legacy stage markers
// (MSM::build_point_schedule / sort_point_schedule / batch_accumulate_into_buckets /
// accumulate_buckets) so its BB_BENCH breakdown maps onto the rewrite's stages.
BENCHMARK_DEFINE_F(PippengerBench, PippengerScalingLegacy)(benchmark::State& state)
{
    const size_t num_points = static_cast<size_t>(state.range(0));
    std::span<const G1> points = srs->get_monomial_points().subspan(0, num_points);
    std::span<Fr> span(&scalars[0], num_points);
    bb::PolynomialSpan<Fr> poly_scalars(0, span);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication::legacy::pippenger_unsafe<Curve>(poly_scalars, points);
    }
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

namespace {
// Uniform [0,1) draw from the deterministic debug RNG (used by the sparsity bench).
[[nodiscard]] double uniform01(bb::numeric::RNG& engine) noexcept
{
    return static_cast<double>(engine.get_random_uint32()) / static_cast<double>(std::numeric_limits<uint32_t>::max());
}

} // namespace

// ===================== Sparsity-profile single MSM =====================
//
// Single-MSM pippenger_round_parallel across dyadic sizes 2^15..2^19 under two scalar
// distributions, to A/B the thread-pool backend (new generation-counter pool vs the
// merge-train pool) at the workload shapes that stress the round-parallel scaffolding
// and the dedup pre-pass.
//
//   Dense80   — 80% uniformly-random nonzero scalars, 20% zero. Exercises the main
//               bucket-accumulation pipeline with light sparsity. dedup_hint=false.
//   DupHeavy  — 50% unique random, 25% all equal to one random scalar A, 5% all equal
//               to another random scalar B, 20% zero. Heavy duplication drives the
//               Phase A dedup pre-pass (the most thread-intensive stage), so this is
//               the case most sensitive to pool dispatch / oversubscription behavior.
//               dedup_hint=true.
//
// Scalars are drawn from the fixture's deterministic debug RNG so the A/B runs on the
// two pool backends see identical inputs.
namespace {
enum class SparsityProfile : uint8_t { Dense80 = 0, DupHeavy = 1 };

std::vector<Fr> build_sparsity_scalars(SparsityProfile profile, size_t n, bb::numeric::RNG& engine)
{
    std::vector<Fr> out(n);
    if (profile == SparsityProfile::Dense80) {
        for (size_t i = 0; i < n; ++i) {
            out[i] = (uniform01(engine) < 0.20) ? Fr::zero() : Fr::random_element(&engine);
        }
    } else {
        const Fr dup_a = Fr::random_element(&engine);
        const Fr dup_b = Fr::random_element(&engine);
        for (size_t i = 0; i < n; ++i) {
            const double r = uniform01(engine);
            if (r < 0.20) {
                out[i] = Fr::zero(); // 20% zero
            } else if (r < 0.45) {
                out[i] = dup_a; // 25% duplicate of A
            } else if (r < 0.50) {
                out[i] = dup_b; // 5% duplicate of B
            } else {
                out[i] = Fr::random_element(&engine); // 50% unique random
            }
        }
    }
    return out;
}
} // namespace

BENCHMARK_DEFINE_F(PippengerBench, PippengerSparsity)(benchmark::State& state)
{
    const auto profile = static_cast<SparsityProfile>(state.range(0));
    const size_t num_points = static_cast<size_t>(state.range(1));
    const bool dedup_hint = (profile == SparsityProfile::DupHeavy);
    state.SetLabel(profile == SparsityProfile::Dense80 ? "Dense80" : "DupHeavy");

    // Build the scalar set from a fresh RNG re-seeded deterministically per (profile, size)
    // rather than from the shared advancing engine. Two reasons:
    //   1. Every benchmark repetition (--benchmark_repetitions) reuses the SAME scalars, so the
    //      measured variance reflects pool/scheduler noise only, not input variation.
    //   2. The input is independent of benchmark execution order, so a filtered subset or a
    //      pool-toggled A/B run sees byte-identical scalars — the comparison is properly paired.
    // The scalar build is outside the timed `for (auto _ : state)` loop regardless, so RNG cost
    // never enters the measurement.
    const std::uint_fast64_t case_seed =
        0xC0FFEEULL + (static_cast<std::uint_fast64_t>(profile) << 32) + static_cast<std::uint_fast64_t>(num_points);
    bb::numeric::RNG& case_engine = bb::numeric::get_debug_randomness(/*reset=*/true, /*seed=*/case_seed);

    std::vector<Fr> msm_scalars = build_sparsity_scalars(profile, num_points, case_engine);
    std::span<const G1> points = srs->get_monomial_points().subspan(0, num_points);
    bb::PolynomialSpan<const Fr> poly_scalars(0, std::span<const Fr>(msm_scalars.data(), num_points));

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        (void)bb::scalar_multiplication::pippenger_round_parallel<Curve>(poly_scalars, points, dedup_hint);
    }
}

// ===================== Registration =====================

// Single MSM: 2^14 to 2^20
BENCHMARK_REGISTER_F(PippengerBench, PippengerUnsafe)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(4)
    ->Range(1 << 14, 1 << 20);

// Sparsity-profile single MSM: {profile (0=Dense80, 1=DupHeavy), size}, sizes 2^15..2^19.
BENCHMARK_REGISTER_F(PippengerBench, PippengerSparsity)
    ->Unit(benchmark::kMillisecond)
    ->ArgsProduct({ { 0, 1 }, { 1 << 15, 1 << 16, 1 << 17, 1 << 18, 1 << 19 } });

// Batch MSM: {num_polynomials, polynomial_size}
// AVM-like: 32 polys of size 2^21 (one batch from ~2618 wire polys committed in batches of 32)
BENCHMARK_REGISTER_F(PippengerBench, BatchMSM)
    ->Unit(benchmark::kMillisecond)
    ->Args({ 32, 1 << 19 })
    ->Args({ 32, 1 << 21 });

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

// Focused per-stage scaling sweep at native concurrency. Run with BB_BENCH=1 for the
// Stage1..Stage7 hierarchical breakdown; filter with --benchmark_filter=PippengerRoundParallelScaling.
BENCHMARK_REGISTER_F(PippengerBench, PippengerRoundParallelScaling)
    ->Unit(benchmark::kMillisecond)
    ->Arg(1 << 15)
    ->Arg(1 << 16)
    ->Arg(1 << 17)
    ->Arg(1 << 18)
    ->Arg(1 << 19);

BENCHMARK_REGISTER_F(PippengerBench, PippengerScalingLegacy)
    ->Unit(benchmark::kMillisecond)
    ->Arg(1 << 15)
    ->Arg(1 << 16)
    ->Arg(1 << 17)
    ->Arg(1 << 18)
    ->Arg(1 << 19);

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
