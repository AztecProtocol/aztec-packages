#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include <benchmark/benchmark.h>

using namespace benchmark;

namespace {
auto& engine = bb::numeric::get_debug_randomness();
}

using FF = bb::fr;
using bb::BarycentricData;
using bb::Univariate;

namespace bb::benchmark {

void extend_2_to_11(State& state) noexcept
{
    auto univariate = Univariate<FF, 2>::get_random();
    for (auto _ : state) {
        DoNotOptimize(univariate.extend_to<11>());
    }
}

// 93.9s goes down to 62.7
// Theoretical min: 1 sub, 9 additions at about 3.8ns each, 38ns
void fake_extend_2_to_11(State& state) noexcept
{
    std::array<FF, 11> univariate;
    std::generate(univariate.begin(), univariate.end(), [&]() { return FF::random_element(); });

    const auto extend_to_11 = [](auto& arr) {
        FF tmp = arr[1];
        const FF delta = tmp - arr[0];
        for (size_t idx = 2; idx < 10; idx++) {
            arr[idx] = (tmp += delta); // fused ~> 62.9ns; non-fused ~>69.5ns
        }
        arr[10] = tmp; // save one +=;
        return arr;
    };

    for (auto _ : state) {
        DoNotOptimize(extend_to_11(univariate));
    }
}

// 93.9s goes down to 62.7
// Theoretical min: 1 sub, 9 additions at about 3.8ns each, 38ns
void self_extend_2_to_11(State& state) noexcept
{
    auto univariate = Univariate<FF, 11>::get_random();

    for (auto _ : state) {
        univariate.self_extend_from<2>();
    }
}

BENCHMARK(extend_2_to_11);
BENCHMARK(fake_extend_2_to_11);
BENCHMARK(self_extend_2_to_11);

} // namespace bb::benchmark

BENCHMARK_MAIN();