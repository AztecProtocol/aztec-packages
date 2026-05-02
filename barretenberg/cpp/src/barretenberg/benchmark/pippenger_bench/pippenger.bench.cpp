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

// ===================== Batch MSM =====================

BENCHMARK_DEFINE_F(PippengerBench, BatchMSM)(benchmark::State& state)
{
    const size_t num_polys = static_cast<size_t>(state.range(0));
    const size_t poly_size = static_cast<size_t>(state.range(1));

    std::vector<std::vector<Fr>> all_scalars(num_polys);
    std::vector<std::span<Fr>> scalar_spans;
    std::vector<std::span<const G1>> point_spans;

    for (size_t i = 0; i < num_polys; ++i) {
        all_scalars[i].resize(poly_size);
        for (auto& s : all_scalars[i]) {
            s = Fr::random_element(&engine);
        }
        scalar_spans.emplace_back(all_scalars[i]);
        point_spans.emplace_back(srs->get_monomial_points().subspan(0, poly_size));
    }

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(point_spans, scalar_spans, false);
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

    std::vector<std::span<Fr>> scalar_spans;
    std::vector<std::span<const G1>> point_spans;
    scalar_spans.emplace_back(msm_scalars);
    point_spans.emplace_back(srs->get_monomial_points().subspan(0, msm_size));

    // This is thread-local: restore after the benchmark so other cases in this binary are unaffected.
    const size_t original_concurrency = bb::get_num_cpus();
    bb::set_parallel_for_concurrency(num_threads);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(point_spans, scalar_spans, false);
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

} // namespace

BENCHMARK_MAIN();
