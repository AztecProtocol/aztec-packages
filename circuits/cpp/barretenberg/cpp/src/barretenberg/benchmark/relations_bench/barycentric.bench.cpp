#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/honk/sumcheck/polynomials/barycentric_data.hpp"
#include <benchmark/benchmark.h>

using namespace benchmark;

namespace {
auto& engine = numeric::random::get_debug_engine();
}

using FF = barretenberg::fr;

namespace proof_system::honk::sumcheck::relations_bench {

void extend_2_to_6(State& state) noexcept
{
    auto univariate = Univariate<FF, 2>::get_random();
    BarycentricData<FF, 2, 6> barycentric_2_to_6;
    for (auto _ : state)
    {
        DoNotOptimize(barycentric_2_to_6.extend(univariate));
    }
}
BENCHMARK(extend_2_to_6);

} // namespace proof_system::honk::sumcheck::relations_bench