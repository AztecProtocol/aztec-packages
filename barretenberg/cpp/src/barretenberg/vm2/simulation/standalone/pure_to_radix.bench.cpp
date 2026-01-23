#include <benchmark/benchmark.h>

#include "barretenberg/vm2/simulation/standalone/pure_memory.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_to_radix.hpp"

namespace bb::avm2::simulation {

using namespace benchmark;
using namespace bb::avm2;

namespace {

void BM_pure_to_radix(State& state)
{
    PureToRadix pure_to_radix;

    for (auto _ : state) {
        state.PauseTiming();
        auto value = fr::random_element();
        uint32_t num_limbs = static_cast<uint32_t>(state.range(0));
        uint32_t radix = static_cast<uint32_t>(state.range(1));
        state.ResumeTiming();
        benchmark::DoNotOptimize(pure_to_radix.to_le_radix(value, num_limbs, radix));
    }
}

void BM_pure_to_bits(State& state)
{
    PureToRadix pure_to_radix;

    for (auto _ : state) {
        state.PauseTiming();
        auto value = fr::random_element();
        uint32_t num_limbs = static_cast<uint32_t>(state.range(0));
        state.ResumeTiming();
        benchmark::DoNotOptimize(pure_to_radix.to_le_bits(value, num_limbs));
    }
}

void BM_pure_to_radix_memory(State& state)
{
    PureToRadix pure_to_radix;

    for (auto _ : state) {
        state.PauseTiming();
        MemoryStore memory;
        uint32_t num_limbs = static_cast<uint32_t>(state.range(0));
        uint32_t radix = static_cast<uint32_t>(state.range(1));
        // Compute a random value that fits in the limbs to avoid truncation errors
        uint256_t value = 0;
        for (uint32_t i = 0; i < num_limbs; i++) {
            value = value * radix + static_cast<uint32_t>(rand()) % radix;
        }
        state.ResumeTiming();
        pure_to_radix.to_be_radix(memory, value, radix, num_limbs, false, /*dst_addr*/ 0);
    }
}

BENCHMARK(BM_pure_to_radix)->Ranges({ { 2, 256 }, { 2, 256 } })->Unit(benchmark::kMillisecond);
BENCHMARK(BM_pure_to_bits)->Ranges({ { 2, 256 } })->Unit(benchmark::kMillisecond);
BENCHMARK(BM_pure_to_radix_memory)->Ranges({ { 2, 256 }, { 2, 256 } })->Unit(benchmark::kMillisecond);

} // namespace

} // namespace bb::avm2::simulation

BENCHMARK_MAIN();
