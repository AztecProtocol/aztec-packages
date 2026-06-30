// Diagnostic benchmark for polynomial_arithmetic::compute_sum (reduction
// over a contiguous Fr array). Two variants, same inputs:
//
//   compute_sum_scalar — raw scalar for-loop accumulator. No vectorized_for,
//                         no Accumulator. Single-thread.
//   compute_sum_full   — polynomial_arithmetic::compute_sum, which routes
//                         through vectorized_for<VECTOR_FIELD_WIDTH> +
//                         Accumulator<Fr>.
//
// The full/scalar ratio is the speedup the reduction abstraction earns on
// the target platform. CorrectnessGuard at startup compares the two paths
// bit-exactly on 65k random elements.

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/polynomials/polynomial_arithmetic.hpp"

#include <benchmark/benchmark.h>

using namespace benchmark;
using bb::fr;

constexpr size_t N = 1 << 16;

namespace {

struct SumFixture {
    std::vector<fr> src;

    SumFixture()
        : src(N)
    {
        for (size_t i = 0; i < N; ++i) {
            src[i] = fr::random_element();
        }
    }
};

struct CorrectnessGuard {
    CorrectnessGuard()
    {
        SumFixture f;
        // Reference scalar path.
        fr ref = 0;
        for (size_t i = 0; i < N; ++i) {
            ref = ref + f.src[i];
        }
        // Production (vectorized) path.
        const fr got = bb::polynomial_arithmetic::compute_sum<fr>(f.src.data(), N);
        if (!(ref == got)) {
            std::fprintf(stderr, "[COMPUTE_SUM CORRECTNESS] scalar != vectorized\n");
            std::abort();
        }
    }
};
static const CorrectnessGuard correctness_guard;

} // namespace

static void bench_compute_sum_scalar(State& state)
{
    SumFixture f;
    for (auto _ : state) {
        fr result = 0;
        for (size_t i = 0; i < N; ++i) {
            result = result + f.src[i];
        }
        DoNotOptimize(result);
    }
}
BENCHMARK(bench_compute_sum_scalar);

static void bench_compute_sum_full(State& state)
{
    SumFixture f;
    for (auto _ : state) {
        fr result = bb::polynomial_arithmetic::compute_sum<fr>(f.src.data(), N);
        DoNotOptimize(result);
    }
}
BENCHMARK(bench_compute_sum_full);

BENCHMARK_MAIN();
