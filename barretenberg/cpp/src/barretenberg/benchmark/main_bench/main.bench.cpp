
#include <benchmark/benchmark.h>

#include "barretenberg/bb/cli.hpp"

/**
 * @brief Benchmark the prover work for the full PG-Goblin IVC protocol
 * @details Processes "dense" circuits of size 2^17 in a size 2^20 structured trace
 */
BENCHMARK_DEFINE_F(ClientIVCBench, Ambient_17_in_20)(benchmark::State& state)
{
    ClientIVC ivc{ { E2E_FULL_TEST_STRUCTURE } };

    auto total_num_circuits = 2 * static_cast<size_t>(state.range(0)); // 2x accounts for kernel circuits
    auto mocked_vkeys = mock_verification_keys(total_num_circuits);

    for (auto _ : state) {
        BB_REPORT_OP_COUNT_IN_BENCH(state);
        perform_ivc_accumulation_rounds(
            total_num_circuits, ivc, mocked_vkeys, /* mock_vk */ true, /* large_first_app */ false);
        ivc.prove();
    }
}

#define ARGS Arg(ClientIVCBench::NUM_ITERATIONS_MEDIUM_COMPLEXITY)->Arg(2)

BENCHMARK_REGISTER_F(ClientIVCBench, Full)->Unit(benchmark::kMillisecond)->ARGS;
BENCHMARK_REGISTER_F(ClientIVCBench, Ambient_17_in_20)->Unit(benchmark::kMillisecond)->ARGS;

} // namespace

BENCHMARK_MAIN();
