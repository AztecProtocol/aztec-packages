
#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/ultra_bench/mock_proofs.hpp"
#include "barretenberg/common/op_count_google_bench.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

using namespace benchmark;
using namespace bb;

namespace {

/**
 * @brief Benchmark suite for the aztec client PG-Goblin IVC scheme
 *
 */
class IvcBench : public benchmark::Fixture {
  public:
    // Goblin::AccumulationOutput kernel_accum;
    using Builder = GoblinUltraCircuitBuilder;

    // Number of function circuits to accumulate(based on Zacs target numbers)
    static constexpr size_t NUM_ITERATIONS_MEDIUM_COMPLEXITY = 6;

    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_crs_factory("../srs_db/ignition");
        bb::srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    /**
     * @brief Perform a specified number of function circuit accumulation rounds
     * @details Each round "accumulates" a mock function circuit and a mock kernel circuit. Each round thus consists of
     * the generation of two circuits, two UGH proofs and two Merge proofs. To match the sizes called out in the spec
     * (https://github.com/AztecProtocol/aztec-packages/blob/master/yellow-paper/docs/cryptography/performance-targets.md)
     * we set the size of the function circuit to be 2^17 except for the first one which is 2^19.
     *
     * @param state
     */
    void perform_ivc_accumulation_rounds(State& state, ClientIVC& ivc)
    {
        auto NUM_CIRCUITS = static_cast<size_t>(state.range(0));
        for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {

            // Accumulate function circuit
            Builder function_circuit{ goblin.op_queue };
            GoblinMockCircuits::construct_mock_function_circuit(function_circuit);
            auto function_fold_proof = ivc.accumulate(function_circuit);

            // Accumulate kernel circuit
            Builder kernel_circuit{ ivc.goblin.op_queue };
            GoblinMockCircuits::construct_mock_folding_kernel(kernel_circuit, function_fold_proof, kernel_fold_proof);
            auto kernel_fold_proof = ivc.accumulate(kernel_circuit);
        }
    }
};

/**
 * @brief Benchmark the full PG-Goblin IVC protocol
 *
 */
BENCHMARK_DEFINE_F(IvcBench, GoblinFull)(benchmark::State& state)
{
    ClientIVC ivc;

    for (auto _ : state) {
        BB_REPORT_OP_COUNT_IN_BENCH(state);
        // Perform a specified number of iterations of function/kernel accumulation
        perform_ivc_accumulation_rounds(state, goblin);

        // Construct proofs for ECCVM and Translator
        goblin.prove();
    }
}

// /**
//  * @brief Benchmark only the accumulation rounds
//  *
//  */
// BENCHMARK_DEFINE_F(IvcBench, GoblinAccumulate)(benchmark::State& state)
// {
//     Goblin goblin;

//     // TODO(https://github.com/AztecProtocol/barretenberg/issues/723)
//     GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(goblin.op_queue);

//     // Perform a specified number of iterations of function/kernel accumulation
//     for (auto _ : state) {
//         perform_goblin_accumulation_rounds(state, goblin);
//     }
// }

// /**
//  * @brief Benchmark only the ECCVM component
//  *
//  */
// BENCHMARK_DEFINE_F(IvcBench, GoblinECCVMProve)(benchmark::State& state)
// {
//     Goblin goblin;

//     // TODO(https://github.com/AztecProtocol/barretenberg/issues/723)
//     GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(goblin.op_queue);

//     // Perform a specified number of iterations of function/kernel accumulation
//     perform_goblin_accumulation_rounds(state, goblin);

//     // Prove ECCVM only
//     for (auto _ : state) {
//         goblin.prove_eccvm();
//     }
// }

// /**
//  * @brief Benchmark only the Translator component
//  *
//  */
// BENCHMARK_DEFINE_F(IvcBench, GoblinTranslatorProve)(benchmark::State& state)
// {
//     Goblin goblin;

//     // TODO(https://github.com/AztecProtocol/barretenberg/issues/723)
//     GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(goblin.op_queue);

//     // Perform a specified number of iterations of function/kernel accumulation
//     perform_goblin_accumulation_rounds(state, goblin);

//     // Prove ECCVM (unmeasured) and Translator (measured)
//     goblin.prove_eccvm();
//     for (auto _ : state) {
//         goblin.prove_translator();
//     }
// }

#define ARGS                                                                                                           \
    Arg(IvcBench::NUM_ITERATIONS_MEDIUM_COMPLEXITY)                                                                    \
        ->Arg(1 << 0)                                                                                                  \
        ->Arg(1 << 1)                                                                                                  \
        ->Arg(1 << 2)                                                                                                  \
        ->Arg(1 << 3)                                                                                                  \
        ->Arg(1 << 4)                                                                                                  \
        ->Arg(1 << 5)                                                                                                  \
        ->Arg(1 << 6)

BENCHMARK_REGISTER_F(IvcBench, GoblinFull)->Unit(benchmark::kMillisecond)->ARGS;
// BENCHMARK_REGISTER_F(IvcBench, GoblinAccumulate)->Unit(benchmark::kMillisecond)->ARGS;
// BENCHMARK_REGISTER_F(IvcBench, GoblinECCVMProve)->Unit(benchmark::kMillisecond)->ARGS;
// BENCHMARK_REGISTER_F(IvcBench, GoblinTranslatorProve)->Unit(benchmark::kMillisecond)->ARGS;

} // namespace

BENCHMARK_MAIN();
