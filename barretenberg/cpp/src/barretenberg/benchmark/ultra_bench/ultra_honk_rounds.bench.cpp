#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/ultra_bench/mock_circuits.hpp"
#include "barretenberg/common/op_count_google_bench.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/decider_prover.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"

using namespace benchmark;
using namespace bb;

// The rounds to measure
enum {
    PREAMBLE,
    WIRE_COMMITMENTS,
    SORTED_LIST_ACCUMULATOR,
    LOG_DERIVATIVE_INVERSE,
    GRAND_PRODUCT_COMPUTATION,
    GENERATE_ALPHAS,
    RELATION_CHECK
};

/**
 * @details Benchmark Goblin ultrahonk by performing all the rounds, but only measuring one.
 * Note: As a result the very short rounds take a long time for statistical significance, so recommended to set their
 * iterations to 1.
 * @param state - The google benchmark state.
 * @param prover - The Goblin ultrahonk prover.
 * @param index - The pass to measure.
 **/
BB_PROFILE void test_round_inner(State& state, MegaProver& prover, size_t index) noexcept
{
    auto time_if_index = [&](size_t target_index, auto&& func) -> void {
        BB_REPORT_OP_COUNT_IN_BENCH(state);
        if (index == target_index) {
            state.ResumeTiming();
        }

        func();
        if (index == target_index) {
            state.PauseTiming();
        } else {
            // We don't actually want to write to user-defined counters
            BB_REPORT_OP_COUNT_BENCH_CANCEL();
        }
    };
    // why is this mega if the name of file is ultra
    auto verification_key = std::make_shared<MegaFlavor::VerificationKey>(prover.proving_key->get_precomputed());
    OinkProver<MegaFlavor> oink_prover(prover.proving_key, verification_key, prover.transcript);
    time_if_index(PREAMBLE, [&] { oink_prover.execute_preamble_round(); });
    time_if_index(WIRE_COMMITMENTS, [&] { oink_prover.execute_wire_commitments_round(); });
    time_if_index(SORTED_LIST_ACCUMULATOR, [&] { oink_prover.execute_sorted_list_accumulator_round(); });
    time_if_index(LOG_DERIVATIVE_INVERSE, [&] { oink_prover.execute_log_derivative_inverse_round(); });
    time_if_index(GRAND_PRODUCT_COMPUTATION, [&] { oink_prover.execute_grand_product_computation_round(); });
    time_if_index(GENERATE_ALPHAS, [&] { prover.proving_key->alphas = oink_prover.generate_alphas_round(); });

    prover.generate_gate_challenges();

    DeciderProver_<MegaFlavor> decider_prover(prover.proving_key, prover.transcript);
    time_if_index(RELATION_CHECK, [&] { decider_prover.execute_relation_check_rounds(); });
}
BB_PROFILE static void test_round(State& state, size_t index) noexcept
{
    auto log2_num_gates = static_cast<size_t>(state.range(0));
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/761) benchmark both sparse and dense circuits
    auto prover = bb::mock_circuits::get_prover<MegaProver>(
        &bb::mock_circuits::generate_basic_arithmetic_circuit<MegaCircuitBuilder>, log2_num_gates);
    for (auto _ : state) {
        state.PauseTiming();
        test_round_inner(state, prover, index);
        state.ResumeTiming();
        // NOTE: google bench is very finnicky, must end in ResumeTiming() for correctness
    }
}
#define ROUND_BENCHMARK(round)                                                                                         \
    static void ROUND_##round(State& state) noexcept                                                                   \
    {                                                                                                                  \
        test_round(state, round);                                                                                      \
    }                                                                                                                  \
    BENCHMARK(ROUND_##round)->DenseRange(12, 19)->Unit(kMillisecond)

// Fast rounds take a long time to benchmark because of how we compute statistical significance.
// Limit to one iteration so we don't spend a lot of time redoing full proofs just to measure this part.
ROUND_BENCHMARK(PREAMBLE)->Iterations(1);
ROUND_BENCHMARK(WIRE_COMMITMENTS)->Iterations(1);
ROUND_BENCHMARK(SORTED_LIST_ACCUMULATOR)->Iterations(1);
ROUND_BENCHMARK(LOG_DERIVATIVE_INVERSE)->Iterations(1);
ROUND_BENCHMARK(GRAND_PRODUCT_COMPUTATION)->Iterations(1);
ROUND_BENCHMARK(GENERATE_ALPHAS)->Iterations(1);
ROUND_BENCHMARK(RELATION_CHECK);

BENCHMARK_MAIN();
