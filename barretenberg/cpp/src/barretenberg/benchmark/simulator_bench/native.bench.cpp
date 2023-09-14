#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/benchmark_utilities.hpp"
#include "barretenberg/crypto/blake3s/blake3s.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"

using namespace benchmark;

namespace simulator_bench {

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

        fr left_in = fr::random_element();
        fr right_in = fr::random_element();

        // ensure left has skew 1, right has skew 0
        if ((left_in.from_montgomery_form().data[0] & 1) == 1) {
            left_in += fr::one();
        }
        if ((right_in.from_montgomery_form().data[0] & 1) == 0) {
            right_in += fr::one();
        }

        state.ResumeTiming();
        fr result = crypto::pedersen_commitment::compress_native({ left_in, right_in });
        DoNotOptimize(result);
    }
};

void pedersen_compress_array(State& state) noexcept
{
    for (auto _ : state) {
        state.PauseTiming();
        const size_t num_input_bytes = 351;

        std::vector<uint8_t> input;
        input.reserve(num_input_bytes);
        for (size_t i = 0; i < num_input_bytes; ++i) {
            input.push_back(engine.get_random_uint8());
        }

        state.ResumeTiming();
        fr result = crypto::pedersen_commitment::compress_native(input);
        DoNotOptimize(result);
    }
};

void blake3s(State& state) noexcept
{
    for (auto _ : state) {
        state.PauseTiming();
        std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";
        std::vector<uint8_t> input_v(input.begin(), input.end());

        state.ResumeTiming();
        auto result = blake3::blake3s(input_v);
        DoNotOptimize(result);
    }
};

void ecdsa(State& state) noexcept
{

    for (auto _ : state) {
        state.PauseTiming();

        std::string message_string = "Instructions unclear, ask again later.";

        crypto::ecdsa::key_pair<secp256k1::fr, secp256k1::g1> account;
        account.private_key = secp256k1::fr::random_element();
        account.public_key = secp256k1::g1::one * account.private_key;

        crypto::ecdsa::signature signature =
            crypto::ecdsa::construct_signature<Sha256Hasher, secp256k1::fq, secp256k1::fr, secp256k1::g1>(
                message_string, account);

        state.ResumeTiming();
        auto result = crypto::ecdsa::verify_signature<Sha256Hasher, secp256k1::fq, secp256k1::fr, secp256k1::g1>(
            message_string, account.public_key, signature);
        DoNotOptimize(result);
    }
};

void biggroup_batch_mul(State& state) noexcept
{
    using element_t = barretenberg::g1::element;
    using affine_element_t = barretenberg::g1::affine_element;

    for (auto _ : state) {
        state.PauseTiming();

        const size_t num_points = 20;
        std::vector<affine_element_t> points;
        std::vector<fr> scalars;
        for (size_t i = 0; i < num_points; ++i) {
            points.push_back(affine_element_t(element_t::random_element()));
            scalars.push_back(fr::random_element());
        }

        state.ResumeTiming();
        element_t result = g1::one;
        result.self_set_infinity();
        for (size_t i = 0; i < num_points; ++i) {
            result += (element_t(points[i]) * scalars[i]);
        }
        result = result.normalize();
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