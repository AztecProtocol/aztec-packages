/**
 * @brief Benchmark proving the Poseidon2 final proof at varying op counts.
 * @details Isolates the prove_poseidon2_final cost to measure scaling with circuit size.
 */
#include <benchmark/benchmark.h>

#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/flavor/poseidon2_single_row_flavor.hpp"
#include "barretenberg/op_queue/poseidon2_op_queue.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"

using namespace benchmark;
using namespace bb;

static void poseidon2_final_prove(State& state) noexcept
{
    auto num_ops = static_cast<size_t>(state.range(0));
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

    using Perm = crypto::Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams>;

    for (auto _ : state) {
        state.PauseTiming();

        // Build circuit with num_ops single-row Poseidon2 gates
        MegaCircuitBuilder builder;
        builder.op_queue = std::make_shared<ECCOpQueue>();
        for (size_t i = 0; i < num_ops; i++) {
            std::array<fr, 4> input = {
                fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
            };
            builder.create_poseidon2_single_row_gate(input);
        }
        builder.finalize_circuit(/* ensure_nonzero = */ false);

        using Poseidon2Prover = UltraProver_<Poseidon2SingleRowFlavor>;
        auto prover_instance = std::make_shared<ProverInstance_<Poseidon2SingleRowFlavor>>(builder);
        auto vk = std::make_shared<Poseidon2SingleRowFlavor::VerificationKey>(prover_instance->get_precomputed());

        state.counters["dyadic_size"] = static_cast<double>(prover_instance->dyadic_size());
        state.counters["trace_size"] = static_cast<double>(builder.blocks.get_total_content_size());

        state.ResumeTiming();
        Poseidon2Prover prover(prover_instance, vk);
        prover.construct_proof();
    }
}

BENCHMARK(poseidon2_final_prove)->Arg(10)->Arg(50)->Arg(100)->Arg(500)->Arg(1000)->Arg(2000)->Unit(kMillisecond);

BENCHMARK_MAIN();
