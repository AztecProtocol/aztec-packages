
#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/ultra_bench/mock_proofs.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
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
    using Builder = GoblinUltraCircuitBuilder;
    using VerifierFoldData = GoblinMockCircuits::VerifierFoldData;

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
     * the generation of two circuits, two folding proofs and two Merge proofs. To match the sizes called out in the
     * spec
     * (https://github.com/AztecProtocol/aztec-packages/blob/master/yellow-paper/docs/cryptography/performance-targets.md)
     * we set the size of the function circuit to be 2^17. The first one should be 2^19 but we can't currently support
     * folding circuits of unequal size.
     *
     */
    static void perform_ivc_accumulation_rounds(State& state, ClientIVC& ivc)
    {

        const size_t num_cpus = get_num_cpus();
        const auto num_total_functions_circuits = static_cast<size_t>(state.range(0));
        constexpr size_t num_initial_circuits = 2;
        // We need the number of simultaneous circuits be at least 2.They will just execute sequentially, if the number
        // of cpus is 1
        const size_t num_simultaneous_circuits =
            std::min(std::max(num_cpus, num_initial_circuits), num_total_functions_circuits);
        std::vector<Builder> function_circuits(num_simultaneous_circuits);
        // Execute circuits in parallel
        parallel_for(num_simultaneous_circuits, [&](size_t i) {
            function_circuits[i] = Builder();
            GoblinMockCircuits::construct_mock_function_circuit(function_circuits[i]);
        });

        // Initialze IVC with a function circuit
        // Prepend existing EccOpQueue to the circuit queue
        function_circuits[0].op_queue->prepend_previous_queue(*ivc.goblin.op_queue);
        ivc.initialize(function_circuits[0]);
        // Take the queue back from the circuit
        ivc.goblin.op_queue.swap(function_circuits[0].op_queue);

        auto kernel_verifier_accumulator = std::make_shared<ClientIVC::VerifierInstance>();
        kernel_verifier_accumulator->verification_key = ivc.vks.first_func_vk;

        // Accumulate another function circuit
        function_circuits[1].op_queue->prepend_previous_queue(*ivc.goblin.op_queue);
        auto function_fold_proof = ivc.accumulate(function_circuits[1]);
        ivc.goblin.op_queue.swap(function_circuits[1].op_queue);
        VerifierFoldData function_fold_output = { function_fold_proof, ivc.vks.func_vk };

        // Create and accumulate the first folding kernel which only verifies the accumulation of a function circuit
        Builder kernel_circuit{ ivc.goblin.op_queue };
        kernel_verifier_accumulator = GoblinMockCircuits::construct_mock_folding_kernel(
            kernel_circuit, function_fold_output, {}, kernel_verifier_accumulator);
        auto kernel_fold_proof = ivc.accumulate(kernel_circuit);
        VerifierFoldData kernel_fold_output = { kernel_fold_proof, ivc.vks.first_kernel_vk };

        auto NUM_CIRCUITS = static_cast<size_t>(state.range(0));
        // Subtract two to account for the "initialization" round above i.e. we have already folded two function
        // circuits
        NUM_CIRCUITS -= 2;
        for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
            // If we've used all the function circuits we've created, time to construct newo nes
            if ((circuit_idx + num_initial_circuits) % num_simultaneous_circuits == 0) {
                parallel_for(std::min(num_simultaneous_circuits, NUM_CIRCUITS - circuit_idx), [&](size_t i) {
                    function_circuits[i] = Builder();
                    GoblinMockCircuits::construct_mock_function_circuit(function_circuits[i]);
                });
            }
            // Accumulate function circuit

            function_circuits[(circuit_idx + num_initial_circuits) % num_simultaneous_circuits]
                .op_queue->prepend_previous_queue(*ivc.goblin.op_queue);
            auto function_fold_proof =
                ivc.accumulate(function_circuits[(circuit_idx + num_initial_circuits) % num_simultaneous_circuits]);

            function_circuits[(circuit_idx + num_initial_circuits) % num_simultaneous_circuits].op_queue.swap(
                ivc.goblin.op_queue);
            function_fold_output = { function_fold_proof, ivc.vks.func_vk };

            // Create kernel circuit containing the recursive folding verification of a function circuit and a kernel
            // circuit and accumulate it
            Builder kernel_circuit{ ivc.goblin.op_queue };
            kernel_verifier_accumulator = GoblinMockCircuits::construct_mock_folding_kernel(
                kernel_circuit, function_fold_output, kernel_fold_output, kernel_verifier_accumulator);

            kernel_fold_proof = ivc.accumulate(kernel_circuit);
            kernel_fold_output = { kernel_fold_proof, ivc.vks.kernel_vk };
        }
    }
};

/**
 * @brief Benchmark the prover work for the full PG-Goblin IVC protocol
 *
 */
BENCHMARK_DEFINE_F(IvcBench, Full)(benchmark::State& state)
{
    ClientIVC ivc;
    ivc.precompute_folding_verification_keys();
    for (auto _ : state) {
        BB_REPORT_OP_COUNT_IN_BENCH(state);
        // Perform a specified number of iterations of function/kernel accumulation
        perform_ivc_accumulation_rounds(state, ivc);

        // Construct IVC scheme proof (fold, decider, merge, eccvm, translator)
        ivc.prove();
    }
}

/**
 * @brief Benchmark only the accumulation rounds
 *
 */
BENCHMARK_DEFINE_F(IvcBench, Accumulate)(benchmark::State& state)
{
    ClientIVC ivc;
    ivc.precompute_folding_verification_keys();
    // Perform a specified number of iterations of function/kernel accumulation
    for (auto _ : state) {
        BB_REPORT_OP_COUNT_IN_BENCH(state);
        perform_ivc_accumulation_rounds(state, ivc);
    }
}

/**
 * @brief Benchmark only the Decider component
 *
 */
BENCHMARK_DEFINE_F(IvcBench, Decide)(benchmark::State& state)
{
    ClientIVC ivc;
    // Perform a specified number of iterations of function/kernel accumulation
    perform_ivc_accumulation_rounds(state, ivc);

    // Construct eccvm proof, measure only translator proof construction
    for (auto _ : state) {
        BB_REPORT_OP_COUNT_IN_BENCH(state);
        ivc.decider_prove();
    }
}

/**
 * @brief Benchmark only the ECCVM component
 *
 */
BENCHMARK_DEFINE_F(IvcBench, ECCVM)(benchmark::State& state)
{
    ClientIVC ivc;
    // Perform a specified number of iterations of function/kernel accumulation
    perform_ivc_accumulation_rounds(state, ivc);

    // Construct and measure eccvm only
    for (auto _ : state) {
        BB_REPORT_OP_COUNT_IN_BENCH(state);
        ivc.goblin.prove_eccvm();
    }
}

/**
 * @brief Benchmark only the Translator component
 *
 */
BENCHMARK_DEFINE_F(IvcBench, Translator)(benchmark::State& state)
{
    ClientIVC ivc;
    ivc.precompute_folding_verification_keys();
    BB_REPORT_OP_COUNT_IN_BENCH(state);
    // Perform a specified number of iterations of function/kernel accumulation
    perform_ivc_accumulation_rounds(state, ivc);

    // Construct eccvm proof, measure only translator proof construction
    ivc.goblin.prove_eccvm();
    for (auto _ : state) {
        ivc.goblin.prove_translator();
    }
}

#define ARGS                                                                                                           \
    Arg(IvcBench::NUM_ITERATIONS_MEDIUM_COMPLEXITY)                                                                    \
        ->Arg(1 << 1)                                                                                                  \
        ->Arg(1 << 2)                                                                                                  \
        ->Arg(1 << 3)                                                                                                  \
        ->Arg(1 << 4)                                                                                                  \
        ->Arg(1 << 5)                                                                                                  \
        ->Arg(1 << 6)

BENCHMARK_REGISTER_F(IvcBench, Full)->Unit(benchmark::kMillisecond)->ARGS;
BENCHMARK_REGISTER_F(IvcBench, Accumulate)->Unit(benchmark::kMillisecond)->ARGS;
BENCHMARK_REGISTER_F(IvcBench, Decide)->Unit(benchmark::kMillisecond)->ARGS;
BENCHMARK_REGISTER_F(IvcBench, ECCVM)->Unit(benchmark::kMillisecond)->ARGS;
BENCHMARK_REGISTER_F(IvcBench, Translator)->Unit(benchmark::kMillisecond)->ARGS;

} // namespace

BENCHMARK_MAIN();
