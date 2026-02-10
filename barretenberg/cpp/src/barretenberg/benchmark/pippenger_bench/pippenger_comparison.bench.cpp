/**
 * @brief Comparison benchmark: current vs pre-131d3ef pippenger implementations
 *
 * Benchmarks both pippenger_unsafe (single MSM) and batch_multi_scalar_mul
 * for the current and old (pre-regression) scalar_multiplication code.
 */
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/ecc/scalar_multiplication_old/scalar_multiplication.hpp"
#include "barretenberg/polynomials/polynomial_arithmetic.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <benchmark/benchmark.h>

#include "barretenberg/common/google_bb_bench.hpp"

using namespace benchmark;

using Curve = bb::curve::BN254;
using Fr = Curve::ScalarField;
using G1 = Curve::AffineElement;

namespace {

class PippengerComparisonBench : public benchmark::Fixture {
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

// ===================== pippenger_unsafe: current =====================

BENCHMARK_DEFINE_F(PippengerComparisonBench, Current_PippengerUnsafe)(benchmark::State& state)
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

// ===================== pippenger_unsafe: old =====================

BENCHMARK_DEFINE_F(PippengerComparisonBench, Old_PippengerUnsafe)(benchmark::State& state)
{
    const size_t num_points = static_cast<size_t>(state.range(0));
    std::span<const G1> points = srs->get_monomial_points().subspan(0, num_points);
    std::span<Fr> span(&scalars[0], num_points);
    bb::PolynomialSpan<Fr> poly_scalars(0, span);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication_old::pippenger_unsafe<Curve>(poly_scalars, points);
    }
}

// ===================== batch_multi_scalar_mul: current =====================

BENCHMARK_DEFINE_F(PippengerComparisonBench, Current_BatchMSM)(benchmark::State& state)
{
    const size_t num_polys = static_cast<size_t>(state.range(0));
    const size_t poly_size = static_cast<size_t>(state.range(1));

    // Prepare spans for batch MSM
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

// ===================== batch_multi_scalar_mul: old =====================

BENCHMARK_DEFINE_F(PippengerComparisonBench, Old_BatchMSM)(benchmark::State& state)
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
        bb::scalar_multiplication_old::MSM<Curve>::batch_multi_scalar_mul(point_spans, scalar_spans, false);
    }
}

// ===================== Registration =====================

// Single MSM: 2^14 to 2^20 (focused on the range where regression is visible)
#define PIPPENGER_ARGS RangeMultiplier(4)->Range(1 << 14, 1 << 20)

BENCHMARK_REGISTER_F(PippengerComparisonBench, Current_PippengerUnsafe)->Unit(benchmark::kMillisecond)->PIPPENGER_ARGS;
BENCHMARK_REGISTER_F(PippengerComparisonBench, Old_PippengerUnsafe)->Unit(benchmark::kMillisecond)->PIPPENGER_ARGS;

// Batch MSM: simulate commit scenarios (sized for ~16-core machine)
// Args: {num_polynomials, polynomial_size}
#define BATCH_ARGS Args({ 8, 1 << 16 })->Args({ 16, 1 << 16 })->Args({ 8, 1 << 17 })

BENCHMARK_REGISTER_F(PippengerComparisonBench, Current_BatchMSM)->Unit(benchmark::kMillisecond)->BATCH_ARGS;
BENCHMARK_REGISTER_F(PippengerComparisonBench, Old_BatchMSM)->Unit(benchmark::kMillisecond)->BATCH_ARGS;

} // namespace

BENCHMARK_MAIN();
