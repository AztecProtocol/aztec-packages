/**
 * @warning These benchmarks use functions that are tested elsewhere to guard against regressions in the benchmark.
 * Please do not anything that is untested.
 */

#include <benchmark/benchmark.h>

#include "barretenberg/client_ivc/test_bench_shared.hpp"
#include "barretenberg/common/op_count_google_bench.hpp"

using namespace benchmark;
using namespace bb;

namespace {

/**
 * @brief Benchmark suite for the aztec client PG-Goblin IVC scheme
 */
class ClientIVCBench : public benchmark::Fixture {
  public:
    // Number of function circuits to accumulate (based on Zac's target numbers)
    static constexpr size_t NUM_ITERATIONS_MEDIUM_COMPLEXITY = 6;

    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    }
};

/**
 * @brief Benchmark only the verification work for the PG-Goblin IVC protocol
 */
BENCHMARK_DEFINE_F(ClientIVCBench, VerificationOnly)(benchmark::State& state)
{
    PrivateFunctionExecutionMockCircuitProducer circuit_producer{ /*num_app_circuits=*/1 };
    ClientIVC ivc{ circuit_producer.total_num_circuits, { AZTEC_TRACE_STRUCTURE } };

    for (size_t idx = 0; idx < 4; ++idx) {
        circuit_producer.construct_and_accumulate_next_circuit(ivc);
    }

    auto proof = ivc.prove();

    for (auto _ : state) {
        benchmark::DoNotOptimize(ivc.verify(proof));
    }
}

/**
 * @brief Benchmark the prover work for the full PG-Goblin IVC protocol
 */
BENCHMARK_DEFINE_F(ClientIVCBench, Full)(benchmark::State& state)
{
    size_t NUM_APP_CIRCUITS = static_cast<size_t>(state.range(0));
    PrivateFunctionExecutionMockCircuitProducer circuit_producer{ NUM_APP_CIRCUITS };
    auto total_num_circuits = circuit_producer.total_num_circuits;
    ClientIVC ivc{ total_num_circuits, { AZTEC_TRACE_STRUCTURE } };
    auto mocked_vks = mock_vks(total_num_circuits);

    for (auto _ : state) {
        BB_REPORT_OP_COUNT_IN_BENCH(state);
        perform_ivc_accumulation_rounds(total_num_circuits, ivc, mocked_vks);
        ivc.prove();
    }
}
/**
 * @brief Benchmark the prover work for the full PG-Goblin IVC protocol
 * @details Processes "dense" circuits of size 2^17 in a size 2^20 structured trace
 */
BENCHMARK_DEFINE_F(ClientIVCBench, Ambient_17_in_20)(benchmark::State& state)
{
    size_t NUM_APP_CIRCUITS = static_cast<size_t>(state.range(0));
    PrivateFunctionExecutionMockCircuitProducer circuit_producer{ NUM_APP_CIRCUITS };
    auto total_num_circuits = circuit_producer.total_num_circuits;
    ClientIVC ivc{ total_num_circuits, { AZTEC_TRACE_STRUCTURE } };
    const bool large_first_app = false;
    auto mocked_vks = mock_vks(total_num_circuits, large_first_app);

    for (auto _ : state) {
        BB_REPORT_OP_COUNT_IN_BENCH(state);
        perform_ivc_accumulation_rounds(total_num_circuits, ivc, mocked_vks, large_first_app);
        ivc.prove();
    }
}

#define ARGS Arg(ClientIVCBench::NUM_ITERATIONS_MEDIUM_COMPLEXITY)->Arg(2)

BENCHMARK_REGISTER_F(ClientIVCBench, Full)->Unit(benchmark::kMillisecond)->ARGS;
BENCHMARK_REGISTER_F(ClientIVCBench, Ambient_17_in_20)->Unit(benchmark::kMillisecond)->ARGS;
BENCHMARK_REGISTER_F(ClientIVCBench, VerificationOnly)->Unit(benchmark::kMillisecond);

} // namespace

BENCHMARK_MAIN();
