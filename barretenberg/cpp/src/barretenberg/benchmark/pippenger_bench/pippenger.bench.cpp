#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/polynomials/polynomial_arithmetic.hpp"

#include "barretenberg/srs/global_crs.hpp"
#include <benchmark/benchmark.h>

#include "barretenberg/common/op_count_google_bench.hpp"

#include <chrono>
#include <cstdlib>

// #include <valgrind/callgrind.h>
//  CALLGRIND_START_INSTRUMENTATION;
//  CALLGRIND_STOP_INSTRUMENTATION;
//  CALLGRIND_DUMP_STATS;

using namespace bb;
using namespace benchmark;

// constexpr size_t NUM_POINTS = 1 << 16;
// std::vector<fr> scalars;
// static bb::evaluation_domain small_domain;
// static bb::evaluation_domain large_domain;

using Curve = bb::curve::BN254;
using Fr = Curve::ScalarField;
using G1 = Curve::AffineElement;
using Element = Curve::Element;
namespace {
/**
 * @brief Benchmark suite for the aztec client PG-Goblin IVC scheme
 */
class PippengerBench : public benchmark::Fixture {
  public:
    // Number of function circuits to accumulate (based on Zac's target numbers)
    static constexpr size_t MAX_POINTS = 1 << 22;
    std::shared_ptr<srs::factories::Crs<Curve>> srs;
    std::vector<Fr> scalars;
    // scalar_multiplication::pippenger_runtime_state<curve::BN254> runtime_state =
    //     scalar_multiplication::pippenger_runtime_state<curve::BN254>(1 << 22);
    numeric::RNG& engine = numeric::get_debug_randomness();

    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
        srs = srs::get_crs_factory<Curve>()->get_crs(MAX_POINTS);

        scalars.resize(MAX_POINTS);
        for (auto& x : scalars) {
            x = Fr::random_element(&engine);
        }
    }
};

/**
 * @brief Benchmark the prover work for the full PG-Goblin IVC protocol
 */
BENCHMARK_DEFINE_F(PippengerBench, Full)(benchmark::State& state)
{
    std::span<const G1> points =
        PippengerBench::srs->get_monomial_points().subspan(0, static_cast<size_t>(state.range(0)));
    std::span<Fr> span(&PippengerBench::scalars[0], static_cast<size_t>(state.range(0)));
    PolynomialSpan<Fr> scalars = PolynomialSpan<Fr>(0, span);

    for (auto _ : state) {
        BB_REPORT_OP_COUNT_IN_BENCH(state);
        (scalar_multiplication::pippenger_unsafe<Curve>(scalars, points));
    }
}

#define ARGS RangeMultiplier(4)->Range(1 << 11, 1 << 21);

BENCHMARK_REGISTER_F(PippengerBench, Full)->Unit(benchmark::kMillisecond)->ARGS;

} // namespace

BENCHMARK_MAIN();
