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

void VM_pure_to_radix_memory(State& state)
{
    PureToRadix pure_to_radix;

    for (auto _ : state) {
        state.PauseTiming();
        MemoryStore memory;
        auto value = fr::random_element();
        uint32_t num_limbs = static_cast<uint32_t>(state.range(0));
        uint32_t radix = static_cast<uint32_t>(state.range(1));
        state.ResumeTiming();
        pure_to_radix.to_be_radix(memory, value, num_limbs, radix, false, /*dst_addr*/ 0);
    }
}

BENCHMARK(BM_pure_to_radix)->Ranges({ { 2, 256 }, { 2, 256 } })->Unit(benchmark::kMillisecond);
BENCHMARK(BM_pure_to_bits)->Ranges({ { 2, 256 } })->Unit(benchmark::kMillisecond);
BENCHMARK(VM_pure_to_radix_memory)->Ranges({ { 2, 256 }, { 2, 256 } })->Unit(benchmark::kMillisecond);

} // namespace

} // namespace bb::avm2::simulation

BENCHMARK_MAIN();
