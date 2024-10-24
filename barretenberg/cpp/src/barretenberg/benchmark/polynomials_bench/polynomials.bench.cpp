#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include <barretenberg/polynomials/polynomial.hpp>
#include <benchmark/benchmark.h>

using namespace benchmark;
using namespace bb;

template <typename Curve> void construct_random_polynomial(State& state)
{
    using Fr = typename Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;
    for (auto _ : state) {
        state.PauseTiming();
        size_t size = 1 << state.range(0);
        state.ResumeTiming();
        Polynomial p = Polynomial::random(size, 0, 0);
    }
}

BENCHMARK(construct_random_polynomial<curve::BN254>)->DenseRange(18, 20)->Unit(kMillisecond);
BENCHMARK(construct_random_polynomial<curve::Grumpkin>)->DenseRange(18, 20)->Unit(kMillisecond);

BENCHMARK_MAIN();
