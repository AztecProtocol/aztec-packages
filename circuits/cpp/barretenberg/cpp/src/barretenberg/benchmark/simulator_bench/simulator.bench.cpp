#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/benchmark_utilities.hpp"
#include "barretenberg/proof_system/circuit_builder/circuit_simulator.hpp"
#include "barretenberg/stdlib/commitment/pedersen/pedersen.hpp"
#include "barretenberg/stdlib/encryption/ecdsa/ecdsa.hpp"
#include "barretenberg/stdlib/hash/blake3s/blake3s.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"

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
        auto result = proof_system::plonk::stdlib::pedersen_commitment<Simulator>::compress(left, right);
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

/**
 * @brief Benchmark: Construction of a Ultra Honk proof for a circuit determined by the provided circuit function
 */
void blake3s(State& state) noexcept
{
    for (auto _ : state) {
        state.PauseTiming();
        auto simulator = Simulator();
        std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";
        std::vector<uint8_t> input_v(input.begin(), input.end());

        byte_array_ct input_arr(&simulator, input_v);
        state.ResumeTiming();
        byte_array_ct result = proof_system::plonk::stdlib::blake3s(input_arr);
        DoNotOptimize(result);
    }
};

void ecdsa(State& state) noexcept
{
    using curve = proof_system::plonk::stdlib::secp256k1<Simulator>;
    using namespace proof_system::plonk::stdlib;

    for (auto _ : state) {
        state.PauseTiming();

        auto simulator = Simulator();
        std::string message_string = "Instructions unclear, ask again later.";

        crypto::ecdsa::key_pair<curve::fr, curve::g1> account;
        account.private_key = curve::fr::random_element();
        account.public_key = curve::g1::one * account.private_key;

        crypto::ecdsa::signature signature =
            crypto::ecdsa::construct_signature<Sha256Hasher, curve::fq, curve::fr, curve::g1>(message_string, account);

        curve::g1_bigfr_ct public_key = curve::g1_bigfr_ct::from_witness(&simulator, account.public_key);

        std::vector<uint8_t> rr(signature.r.begin(), signature.r.end());
        std::vector<uint8_t> ss(signature.s.begin(), signature.s.end());
        uint8_t vv = signature.v;

        ecdsa::signature<Simulator> sig{ curve::byte_array_ct(&simulator, rr),
                                         curve::byte_array_ct(&simulator, ss),
                                         uint8<Simulator>(&simulator, vv) };

        curve::byte_array_ct message(&simulator, message_string);

        state.ResumeTiming();
        auto result = verify_signature<Simulator, curve, curve::fq_ct, curve::bigfr_ct, curve::g1_bigfr_ct>(
            message, public_key, sig);
        DoNotOptimize(result);
    }
};

void biggroup_batch_mul(State& state) noexcept
{
    using curve = proof_system::plonk::stdlib::bn254<Simulator>;
    using element_t = barretenberg::g1::element;
    using affine_element_t = barretenberg::g1::affine_element;
    using element_ct = typename curve::Group;
    using scalar_ct = typename curve::ScalarField;

    for (auto _ : state) {
        state.PauseTiming();

        const size_t num_points = 20;
        Simulator simulator;
        std::vector<affine_element_t> points;
        std::vector<fr> scalars;
        for (size_t i = 0; i < num_points; ++i) {
            points.push_back(affine_element_t(element_t::random_element()));
            scalars.push_back(fr::random_element());
        }

        std::vector<element_ct> circuit_points;
        std::vector<scalar_ct> circuit_scalars;
        for (size_t i = 0; i < num_points; ++i) {
            circuit_points.push_back(element_ct::from_witness(&simulator, points[i]));
            circuit_scalars.push_back(scalar_ct::from_witness(&simulator, scalars[i]));
        }

        state.ResumeTiming();
        element_ct result = element_ct::batch_mul(circuit_points, circuit_scalars);
        DoNotOptimize(result);
    }
};

BENCHMARK(pedersen_compress_pair)
    ->DenseRange(MIN_NUM_ITERATIONS, MAX_NUM_ITERATIONS)
    ->Repetitions(NUM_REPETITIONS)
    ->Unit(::benchmark::kNanosecond);
BENCHMARK(pedersen_compress_array)
    ->DenseRange(MIN_NUM_ITERATIONS, MAX_NUM_ITERATIONS)
    ->Repetitions(NUM_REPETITIONS)
    ->Unit(::benchmark::kNanosecond);
BENCHMARK(blake3s)
    ->DenseRange(MIN_NUM_ITERATIONS, MAX_NUM_ITERATIONS)
    ->Repetitions(NUM_REPETITIONS)
    ->Unit(::benchmark::kNanosecond);
BENCHMARK(ecdsa)
    ->DenseRange(MIN_NUM_ITERATIONS, MAX_NUM_ITERATIONS)
    ->Repetitions(NUM_REPETITIONS)
    ->Unit(::benchmark::kNanosecond);
BENCHMARK(biggroup_batch_mul)
    ->DenseRange(MIN_NUM_ITERATIONS, MAX_NUM_ITERATIONS)
    ->Repetitions(NUM_REPETITIONS)
    ->Unit(::benchmark::kNanosecond);

} // namespace simulator_bench