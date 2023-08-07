#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/benchmark_utilities.hpp"
#include "barretenberg/proof_system/circuit_builder/circuit_simulator.hpp"
#include "barretenberg/stdlib/commitment/pedersen/pedersen.hpp"

using namespace benchmark;

namespace simulator_bench {

using Simulator = proof_system::CircuitSimulatorBN254;
using witness_ct = proof_system::plonk::stdlib::witness_t<Simulator>;
using field_ct = proof_system::plonk::stdlib::field_t<Simulator>;
using byte_array_ct = proof_system::plonk::stdlib::byte_array<Simulator>;

// Number of times to perform operation of interest in the benchmark circuits, e.g. # of hashes to perform
constexpr size_t MIN_NUM_ITERATIONS = bench_utils::BenchParams::MIN_NUM_ITERATIONS;
constexpr size_t MAX_NUM_ITERATIONS = bench_utils::BenchParams::MAX_NUM_ITERATIONS;
// Number of times to repeat each benchmark
constexpr size_t NUM_REPETITIONS = bench_utils::BenchParams::NUM_REPETITIONS;

namespace {
auto& engine = numeric::random::get_debug_engine();
}

/**
 * @brief Benchmark: Construction of a Ultra Honk proof for a circuit determined by the provided circuit function
 */
void pedersen_compress_pair(State& state) noexcept
{
    for (auto _ : state) {
        state.PauseTiming();
        Simulator simulator;

        fr left_in = fr::random_element();
        fr right_in = fr::random_element();

        // ensure left has skew 1, right has skew 0
        if ((left_in.from_montgomery_form().data[0] & 1) == 1) {
            left_in += fr::one();
        }
        if ((right_in.from_montgomery_form().data[0] & 1) == 0) {
            right_in += fr::one();
        }

        field_ct left = witness_ct(&simulator, left_in);
        field_ct right = witness_ct(&simulator, right_in);
        state.ResumeTiming();
        field_ct result = proof_system::plonk::stdlib::pedersen_commitment<Simulator>::compress(left, right);
        DoNotOptimize(result);
    }
};

/**
 * @brief Benchmark: Construction of a Ultra Honk proof for a circuit determined by the provided circuit function
 */
void pedersen_compress_array(State& state) noexcept
{
    for (auto _ : state) {
        state.PauseTiming();
        const size_t num_input_bytes = 351;

        Simulator simulator;

        std::vector<uint8_t> input;
        input.reserve(num_input_bytes);
        for (size_t i = 0; i < num_input_bytes; ++i) {
            input.push_back(engine.get_random_uint8());
        }

        byte_array_ct circuit_input(&simulator, input);
        state.ResumeTiming();
        auto result = proof_system::plonk::stdlib::pedersen_commitment<Simulator>::compress(circuit_input);
        DoNotOptimize(result);
    }
};

// Define benchmarks
BENCHMARK(pedersen_compress_pair)->DenseRange(MIN_NUM_ITERATIONS, MAX_NUM_ITERATIONS)->Repetitions(NUM_REPETITIONS);
BENCHMARK(pedersen_compress_array)->DenseRange(MIN_NUM_ITERATIONS, MAX_NUM_ITERATIONS)->Repetitions(NUM_REPETITIONS);
} // namespace simulator_bench