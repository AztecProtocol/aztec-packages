
#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/ultra_bench/mock_proofs.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

using namespace benchmark;
using namespace bb;

namespace {
void goblin_full(State& state) noexcept
{
    bb::srs::init_crs_factory("../srs_db/ignition");
    bb::srs::init_grumpkin_crs_factory("../srs_db/grumpkin");

    Goblin goblin;

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/723): Simply populate the OpQueue with some data and
    // corresponding commitments so the merge protocol has "prev" data into which it can accumulate
    GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(goblin.op_queue);

    // Initialize empty kernel accum; first pass of kernel circuit will have no previous kernel proof to verify
    Goblin::AccumulationOutput kernel_accum;

    Goblin::Proof proof;
    for (auto _ : state) {
        // Construct a series of simple Goblin circuits; generate and verify their proofs
        auto NUM_CIRCUITS = static_cast<size_t>(state.range(0));
        for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {

            // Construct and accumulate a mock function circuit
            GoblinUltraCircuitBuilder function_circuit{ goblin.op_queue };
            GoblinMockCircuits::construct_mock_function_circuit(function_circuit);
            auto function_accum = goblin.accumulate(function_circuit);

            // Construct and accumulate the mock kernel circuit
            GoblinUltraCircuitBuilder circuit_builder{ goblin.op_queue };
            GoblinMockCircuits::construct_mock_kernel_circuit(circuit_builder, function_accum, kernel_accum);
            kernel_accum = goblin.accumulate(circuit_builder);
        }

        // Construct proofs for ECCVM and Translator
        proof = goblin.prove();
    }
    // Verify the final UGH proof
    honk::GoblinUltraVerifier ultra_verifier{ kernel_accum.verification_key };
    ultra_verifier.verify_proof(kernel_accum.proof);
    // Verify the goblin proof (eccvm, translator, merge)
    goblin.verify(proof);
}

void goblin_accumulate(State& state) noexcept
{
    bb::srs::init_crs_factory("../srs_db/ignition");
    bb::srs::init_grumpkin_crs_factory("../srs_db/grumpkin");

    Goblin goblin;

    // Construct an initial circuit; its proof will be recursively verified by the first kernel
    GoblinUltraCircuitBuilder initial_circuit{ goblin.op_queue };
    GoblinMockCircuits::construct_simple_initial_circuit(initial_circuit);
    Goblin::AccumulationOutput kernel_input = goblin.accumulate(initial_circuit);

    // Construct a series of simple Goblin circuits; generate and verify their proofs
    size_t NUM_CIRCUITS = static_cast<size_t>(state.range(0));
    for (auto _ : state) {
        for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
            // Construct a circuit with logic resembling that of the "kernel circuit"
            GoblinUltraCircuitBuilder circuit_builder{ goblin.op_queue };
            GoblinMockCircuits::construct_mock_kernel_circuit(circuit_builder, kernel_input, kernel_input);

            // Construct proof of the current kernel circuit to be recursively verified by the next one
            kernel_input = goblin.accumulate(circuit_builder);
        }
    }
}

void goblin_eccvm_prove(State& state) noexcept
{
    bb::srs::init_crs_factory("../srs_db/ignition");
    bb::srs::init_grumpkin_crs_factory("../srs_db/grumpkin");

    Goblin goblin;

    // Construct an initial circuit; its proof will be recursively verified by the first kernel
    GoblinUltraCircuitBuilder initial_circuit{ goblin.op_queue };
    GoblinMockCircuits::construct_simple_initial_circuit(initial_circuit);
    Goblin::AccumulationOutput kernel_input = goblin.accumulate(initial_circuit);

    // Construct a series of simple Goblin circuits; generate and verify their proofs
    size_t NUM_CIRCUITS = 1 << static_cast<size_t>(state.range(0));
    for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
        // Construct a circuit with logic resembling that of the "kernel circuit"
        GoblinUltraCircuitBuilder circuit_builder{ goblin.op_queue };
        GoblinMockCircuits::construct_mock_kernel_circuit(circuit_builder, kernel_input, kernel_input);

        // Construct proof of the current kernel circuit to be recursively verified by the next one
        kernel_input = goblin.accumulate(circuit_builder);
    }

    for (auto _ : state) {
        goblin.prove_eccvm();
    }
}

void goblin_translator_prove(State& state) noexcept
{
    bb::srs::init_crs_factory("../srs_db/ignition");
    bb::srs::init_grumpkin_crs_factory("../srs_db/grumpkin");

    Goblin goblin;

    // Construct an initial circuit; its proof will be recursively verified by the first kernel
    GoblinUltraCircuitBuilder initial_circuit{ goblin.op_queue };
    GoblinMockCircuits::construct_simple_initial_circuit(initial_circuit);
    Goblin::AccumulationOutput kernel_input = goblin.accumulate(initial_circuit);

    // Construct a series of simple Goblin circuits; generate and verify their proofs
    size_t NUM_CIRCUITS = 1 << static_cast<size_t>(state.range(0));
    for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
        // Construct a circuit with logic resembling that of the "kernel circuit"
        GoblinUltraCircuitBuilder circuit_builder{ goblin.op_queue };
        GoblinMockCircuits::construct_mock_kernel_circuit(circuit_builder, kernel_input, kernel_input);

        // Construct proof of the current kernel circuit to be recursively verified by the next one
        kernel_input = goblin.accumulate(circuit_builder);
    }

    goblin.prove_eccvm();
    for (auto _ : state) {
        goblin.prove_translator();
    }
}

} // namespace

static constexpr size_t NUM_ITERATIONS_MEDIUM_COMPLEXITY = 12;

#define ARGS                                                                                                           \
    Arg(NUM_ITERATIONS_MEDIUM_COMPLEXITY)                                                                              \
        ->Arg(1 << 0)                                                                                                  \
        ->Arg(1 << 1)                                                                                                  \
        ->Arg(1 << 2)                                                                                                  \
        ->Arg(1 << 3)                                                                                                  \
        ->Arg(1 << 4)                                                                                                  \
        ->Arg(1 << 5)                                                                                                  \
        ->Arg(1 << 6)

BENCHMARK(goblin_full)->Unit(kMillisecond)->ARGS;
BENCHMARK(goblin_accumulate)->Unit(kMillisecond)->ARGS;
BENCHMARK(goblin_eccvm_prove)->Unit(kMillisecond)->ARGS;
BENCHMARK(goblin_translator_prove)->Unit(kMillisecond)->ARGS;