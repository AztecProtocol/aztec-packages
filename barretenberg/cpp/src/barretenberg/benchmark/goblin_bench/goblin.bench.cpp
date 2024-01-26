
#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/ultra_bench/mock_proofs.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

using namespace benchmark;
using namespace bb;

namespace {

class GoblinBench : public benchmark::Fixture {
  public:
    Goblin goblin;
    Goblin::AccumulationOutput kernel_accum;
    Goblin::Proof proof;

    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_crs_factory("../srs_db/ignition");
        bb::srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/723): Simply populate the OpQueue with some data
        // and corresponding commitments so the merge protocol has "prev" data into which it can accumulate
        GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(goblin.op_queue);
    }

    /**
     * @brief Perform a specified number of function circuit accumulation rounds
     * @details Each round "accumulates" a mock function circuit and a mock kernel circuit. Each round thus consists of
     * the generation of two circuits, two UGH proofs and two Merge proofs.
     *
     * @param state
     */
    void perform_goblin_accumulation_rounds(State& state)
    {
        auto NUM_CIRCUITS = static_cast<size_t>(state.range(0));
        for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {

            // Construct and accumulate a mock function circuit
            GoblinUltraCircuitBuilder function_circuit{ goblin.op_queue };
            GoblinMockCircuits::construct_mock_function_circuit(function_circuit);
            auto function_accum = goblin.accumulate(function_circuit);

            // Construct and accumulate the mock kernel circuit
            // Note: in first round, kernel_accum is empty since there is no previous kernel to recursively verify
            GoblinUltraCircuitBuilder circuit_builder{ goblin.op_queue };
            GoblinMockCircuits::construct_mock_kernel_circuit(circuit_builder, function_accum, kernel_accum);
            kernel_accum = goblin.accumulate(circuit_builder);
        }
    }

    /**
     * @brief Benchmark the full Goblin IVC protocol
     *
     */
    void goblin_full(State& state) noexcept
    {
        for (auto _ : state) {
            // perform a specified number of iterations of function/kernel accumulation
            perform_goblin_accumulation_rounds(state);

            // Construct proofs for ECCVM and Translator
            proof = goblin.prove();
        }

        // Verify the final UGH proof
        honk::GoblinUltraVerifier ultra_verifier{ kernel_accum.verification_key };
        ultra_verifier.verify_proof(kernel_accum.proof);
        // Verify the goblin proof (eccvm, translator, merge)
        goblin.verify(proof);
    }

    /**
     * @brief Benchmark only the accumulation rounds
     *
     */
    void goblin_accumulate(State& state) noexcept
    {
        // Construct a series of simple Goblin circuits; generate and verify their proofs
        for (auto _ : state) {
            perform_goblin_accumulation_rounds(state);
        }
    }

    /**
     * @brief Benchmark only the ECCVM component
     *
     */
    void goblin_eccvm_prove(State& state) noexcept
    {
        // Construct a series of simple Goblin circuits; generate and verify their proofs
        perform_goblin_accumulation_rounds(state);

        for (auto _ : state) {
            goblin.prove_eccvm();
        }
    }

    /**
     * @brief Benchmark only the Translator component
     *
     */
    void goblin_translator_prove(State& state) noexcept
    {
        // Construct a series of simple Goblin circuits; generate and verify their proofs
        perform_goblin_accumulation_rounds(state);

        goblin.prove_eccvm();
        for (auto _ : state) {
            goblin.prove_translator();
        }
    }
};
} // namespace

// Number of function circuits to accumulate (based on Zacs target numbers)
static constexpr size_t NUM_ITERATIONS_MEDIUM_COMPLEXITY = 6;

#define ARGS                                                                                                           \
    Arg(NUM_ITERATIONS_MEDIUM_COMPLEXITY)                                                                              \
        ->Arg(1 << 0)                                                                                                  \
        ->Arg(1 << 1)                                                                                                  \
        ->Arg(1 << 2)                                                                                                  \
        ->Arg(1 << 3)                                                                                                  \
        ->Arg(1 << 4)                                                                                                  \
        ->Arg(1 << 5)                                                                                                  \
        ->Arg(1 << 6)

// Define the benchmarks
BENCHMARK_DEFINE_F(GoblinBench, GoblinFull)(benchmark::State& state)
{
    goblin_full(state);
}
BENCHMARK_DEFINE_F(GoblinBench, GoblinAccumulate)(benchmark::State& state)
{
    goblin_accumulate(state);
}
BENCHMARK_DEFINE_F(GoblinBench, GoblinECCVMProve)(benchmark::State& state)
{
    goblin_eccvm_prove(state);
}
BENCHMARK_DEFINE_F(GoblinBench, GoblinTranslatorProve)(benchmark::State& state)
{
    goblin_translator_prove(state);
}

// Register the benchmark
BENCHMARK_REGISTER_F(GoblinBench, GoblinFull)->Unit(benchmark::kMillisecond)->ARGS;
BENCHMARK_REGISTER_F(GoblinBench, GoblinAccumulate)->Unit(benchmark::kMillisecond)->ARGS;
BENCHMARK_REGISTER_F(GoblinBench, GoblinECCVMProve)->Unit(benchmark::kMillisecond)->ARGS;
BENCHMARK_REGISTER_F(GoblinBench, GoblinTranslatorProve)->Unit(benchmark::kMillisecond)->ARGS;