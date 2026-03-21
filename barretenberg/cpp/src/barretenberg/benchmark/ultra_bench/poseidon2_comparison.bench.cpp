#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/ultra_bench/mock_circuits.hpp"
#include "barretenberg/flavor/mega_v2_flavor.hpp"
#include "barretenberg/flavor/poseidon2_single_row_flavor.hpp"
#include "barretenberg/op_queue/poseidon2_op_queue.hpp"
#include "barretenberg/poseidon2_final/poseidon2_final_prover.hpp"
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
 * @brief MegaV2 circuit proof + final Poseidon2 proof to verify all deferred hashes.
 * @details In an IVC setting, the MegaV2 proof defers hash verification. The accumulated
 * hashes must then be proven correct by a Poseidon2FinalProver (standalone, modeled after
 * TranslatorProver — no OinkProver/ProverInstance overhead). The total cost is both proofs.
 */
static void mega_v2_poseidon2_prove_total(State& state) noexcept
{
    auto num_hashes = static_cast<size_t>(state.range(0));
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

    for (auto _ : state) {
        state.PauseTiming();

        auto mega_v2_prover =
            bb::mock_circuits::get_prover<MegaV2Prover>(&generate_mega_v2_poseidon2_circuit, num_hashes);

        // Use UltraProver<Poseidon2SingleRowFlavor> for the final proof (well-optimized pipeline)
        auto single_row_prover = bb::mock_circuits::get_prover<Poseidon2SingleRowProver>(
            &generate_single_row_poseidon2_circuit, num_hashes);

        state.ResumeTiming();

        auto mega_v2_proof = mega_v2_prover.construct_proof();
        auto single_row_proof = single_row_prover.construct_proof();
    }
}

// Split benchmarks to identify the bottleneck
static void mega_v2_circuit_only(State& state) noexcept
{
    auto num_hashes = static_cast<size_t>(state.range(0));
    bb::mock_circuits::construct_proof_with_specified_num_iterations<MegaV2Prover>(
        state, &generate_mega_v2_poseidon2_circuit, num_hashes);
}

static void poseidon2_final_only(State& state) noexcept
{
    auto num_hashes = static_cast<size_t>(state.range(0));
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

    for (auto _ : state) {
        state.PauseTiming();
        std::vector<Poseidon2OpQueue::Poseidon2Op> ops;
        ops.reserve(num_hashes);
        for (size_t i = 0; i < num_hashes; i++) {
            std::array<fr, 4> input = {
                fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
            };
            auto output = crypto::Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams>::permutation(input);
            ops.push_back(Poseidon2OpQueue::Poseidon2Op{ .input = input, .output = output[0] });
        }
        Poseidon2FinalProver final_prover(ops);
        state.ResumeTiming();

        auto proof = final_prover.construct_proof();
    }
}

static void report_circuit_sizes(State& state) noexcept
{
    auto num_hashes = static_cast<size_t>(state.range(0));
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

    // MegaV2 circuit size
    MegaCircuitBuilder builder;
    stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>::add_default(builder);
    builder.poseidon2_op_queue = std::make_shared<Poseidon2OpQueue>();
    for (size_t i = 0; i < num_hashes; i++) {
        std::array<fr, 4> s = { fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element() };
        builder.queue_poseidon2_permutation(s);
    }
    builder.finalize_circuit(true);
    builder.blocks.compute_offsets();
    auto total = builder.blocks.get_total_size();
    auto dyadic = builder.get_circuit_subgroup_size(total);
    state.counters["megav2_dyadic"] = static_cast<double>(dyadic);

    // SingleRow circuit size (via ProverInstance)
    MegaCircuitBuilder sr_builder;
    stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>::add_default(sr_builder);
    for (size_t i = 0; i < num_hashes; i++) {
        std::array<fr, 4> input = { fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element() };
        sr_builder.create_poseidon2_single_row_gate(input);
    }
    auto sr_instance = std::make_shared<ProverInstance_<Poseidon2SingleRowFlavor>>(sr_builder);
    state.counters["singlerow_dyadic"] = static_cast<double>(sr_instance->dyadic_size());

    // Poseidon2Final circuit size
    auto final_dyadic = numeric::round_up_power_2(num_hashes + 1);
    state.counters["final_dyadic"] = static_cast<double>(final_dyadic);
    state.counters["final_num_polys"] = static_cast<double>(Poseidon2FinalFlavor::NUM_ALL_ENTITIES);
    state.counters["singlerow_num_polys"] = static_cast<double>(Poseidon2SingleRowFlavor::NUM_ALL_ENTITIES);

    for (auto _ : state) {}
}

BENCHMARK(mega_poseidon2_prove)->Arg(100)->Arg(1000)->Arg(10000)->Unit(kMillisecond);
BENCHMARK(single_row_poseidon2_prove)->Arg(100)->Arg(1000)->Arg(10000)->Unit(kMillisecond);
BENCHMARK(mega_v2_circuit_only)->Arg(100)->Arg(1000)->Arg(10000)->Unit(kMillisecond);
BENCHMARK(poseidon2_final_only)->Arg(100)->Arg(1000)->Arg(10000)->Unit(kMillisecond);
BENCHMARK(mega_v2_poseidon2_prove_total)->Arg(100)->Arg(1000)->Arg(10000)->Unit(kMillisecond);
BENCHMARK(report_circuit_sizes)->Arg(100)->Arg(1000)->Arg(10000)->Unit(kMillisecond);

BENCHMARK_MAIN();
