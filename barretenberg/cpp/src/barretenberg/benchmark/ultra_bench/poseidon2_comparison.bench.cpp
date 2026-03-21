#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/ultra_bench/mock_circuits.hpp"
#include "barretenberg/flavor/mega_v2_flavor.hpp"
#include "barretenberg/flavor/poseidon2_single_row_flavor.hpp"
#include "barretenberg/op_queue/poseidon2_op_queue.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

using namespace benchmark;
using namespace bb;

using Poseidon2SingleRowProver = UltraProver_<Poseidon2SingleRowFlavor>;
using MegaV2Prover = UltraProver_<MegaV2Flavor>;

// ==================== Circuit builders ====================

/**
 * @brief Build a circuit with N Poseidon2 hashes using the standard multi-row approach (64 gates/hash).
 */
static void generate_mega_poseidon2_circuit(MegaCircuitBuilder& builder, size_t num_hashes)
{
    stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>::add_default(builder);
    for (size_t i = 0; i < num_hashes; i++) {
        auto a = stdlib::field_t(stdlib::witness_t(&builder, fr::random_element()));
        auto b = stdlib::field_t(stdlib::witness_t(&builder, fr::random_element()));
        stdlib::poseidon2<MegaCircuitBuilder>::hash({ a, b });
    }
}

/**
 * @brief Build a circuit with N Poseidon2 hashes using the single-row approach (1 gate/hash).
 */
static void generate_single_row_poseidon2_circuit(MegaCircuitBuilder& builder, size_t num_hashes)
{
    stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>::add_default(builder);
    for (size_t i = 0; i < num_hashes; i++) {
        std::array<fr, 4> input = {
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        builder.create_poseidon2_single_row_gate(input);
    }
}

/**
 * @brief Build a circuit with N deferred Poseidon2 hashes (MegaV2: 2 op rows/hash, 0 poseidon2 gates).
 */
static void generate_mega_v2_poseidon2_circuit(MegaCircuitBuilder& builder, size_t num_hashes)
{
    stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>::add_default(builder);
    // Initialize poseidon2_op_queue if not already done
    if (!builder.poseidon2_op_queue) {
        builder.poseidon2_op_queue = std::make_shared<Poseidon2OpQueue>();
    }
    for (size_t i = 0; i < num_hashes; i++) {
        std::array<fr, 4> sponge_state = {
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        builder.queue_poseidon2_permutation(sponge_state);
    }
}

// ==================== Benchmarks ====================

static void mega_poseidon2_prove(State& state) noexcept
{
    auto num_hashes = static_cast<size_t>(state.range(0));
    bb::mock_circuits::construct_proof_with_specified_num_iterations<MegaProver>(
        state, &generate_mega_poseidon2_circuit, num_hashes);
}

static void single_row_poseidon2_prove(State& state) noexcept
{
    auto num_hashes = static_cast<size_t>(state.range(0));
    bb::mock_circuits::construct_proof_with_specified_num_iterations<Poseidon2SingleRowProver>(
        state, &generate_single_row_poseidon2_circuit, num_hashes);
}

/**
 * @brief MegaV2 circuit proof + final Poseidon2SingleRow proof to verify all deferred hashes.
 * @details In an IVC setting, the MegaV2 proof defers hash verification. The accumulated
 * hashes must then be proven correct by a Poseidon2SingleRowFlavor proof. The total cost
 * is the sum of both proofs.
 */
static void mega_v2_poseidon2_prove_total(State& state) noexcept
{
    auto num_hashes = static_cast<size_t>(state.range(0));
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

    for (auto _ : state) {
        state.PauseTiming();

        // 1. Build and prove the MegaV2 circuit (deferred hashes)
        auto mega_v2_prover =
            bb::mock_circuits::get_prover<MegaV2Prover>(&generate_mega_v2_poseidon2_circuit, num_hashes);

        // 2. Build the SingleRow circuit that verifies all deferred hashes
        auto single_row_prover =
            bb::mock_circuits::get_prover<Poseidon2SingleRowProver>(&generate_single_row_poseidon2_circuit, num_hashes);

        state.ResumeTiming();

        // Time both proofs together
        auto mega_v2_proof = mega_v2_prover.construct_proof();
        auto single_row_proof = single_row_prover.construct_proof();
    }
}

BENCHMARK(mega_poseidon2_prove)->Arg(100)->Arg(1000)->Arg(10000)->Unit(kMillisecond);
BENCHMARK(single_row_poseidon2_prove)->Arg(100)->Arg(1000)->Arg(10000)->Unit(kMillisecond);
BENCHMARK(mega_v2_poseidon2_prove_total)->Arg(100)->Arg(1000)->Arg(10000)->Unit(kMillisecond);

BENCHMARK_MAIN();
