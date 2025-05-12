#include "barretenberg/crypto/pedersen_hash/pedersen.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"
#include "barretenberg/stdlib/hash/pedersen/pedersen.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

#include <benchmark/benchmark.h>

#define BARRETENBERG_SRS_PATH bb::srs::get_ignition_crs_path()

using namespace benchmark;
using namespace bb;

using Builder = bb::UltraCircuitBuilder;
using Prover = bb::UltraProver;
using Verifier = bb::UltraVerifier;

constexpr size_t NUM_CIRCUITS = 10;

constexpr size_t get_circuit_size(const size_t target_count_base)
{
    constexpr size_t base_gates = 2;
    constexpr size_t gates_per_hash = 262;
    return (target_count_base - base_gates) / gates_per_hash;
}

constexpr size_t num_hashes[10]{
    get_circuit_size(1 << 11), get_circuit_size(1 << 12), get_circuit_size(1 << 13), get_circuit_size(1 << 14),
    get_circuit_size(1 << 15), get_circuit_size(1 << 16), get_circuit_size(1 << 17), get_circuit_size(1 << 18),
    get_circuit_size(1 << 19), get_circuit_size(1 << 20),
};

constexpr size_t get_index(const size_t target_count_base)
{
    for (size_t i = 0; i < 10; ++i) {
        if (target_count_base == num_hashes[i]) {
            return i;
        }
    }
    return 0;
}
void generate_test_pedersen_hash_circuit(Builder& builder, size_t num_repetitions)
{
    stdlib::field_t<Builder> left(stdlib::witness_t(&builder, bb::fr::random_element()));
    stdlib::field_t<Builder> out(stdlib::witness_t(&builder, bb::fr::random_element()));

    for (size_t i = 0; i < num_repetitions; ++i) {
        out = bb::stdlib::pedersen_hash<Builder>::hash({ left, out });
    }
}

void generate_test_pedersen_hash_buffer_circuit(Builder& builder, size_t num_repetitions)
{
    stdlib::byte_array<Builder> input;
    for (size_t i = 0; i < num_repetitions; ++i) {
        stdlib::byte_array<Builder> tmp(stdlib::witness_t(&builder, bb::fr::random_element()));
        input.write(tmp);
    }
    auto out = bb::stdlib::pedersen_hash<Builder>::hash_buffer(input);
    (void)out;
}

Prover pedersen_provers[NUM_CIRCUITS];
Verifier pedersen_verifiers[NUM_CIRCUITS];
bb::HonkProof pedersen_proofs[NUM_CIRCUITS];

grumpkin::fq pedersen_function(const size_t count)
{
    grumpkin::fq left = grumpkin::fq::random_element();
    grumpkin::fq out = grumpkin::fq::random_element();
    for (size_t i = 0; i < count; ++i) {
        out = crypto::pedersen_hash::hash({ left, out });
    }
    return out;
}
void native_pedersen_commitment_bench(State& state) noexcept
{
    for (auto _ : state) {
        const size_t count = (static_cast<size_t>(state.range(0)));
        (pedersen_function(count));
    }
}
BENCHMARK(native_pedersen_commitment_bench)
    ->Arg(num_hashes[0])
    ->Arg(num_hashes[1])
    ->Arg(num_hashes[2])
    ->Arg(num_hashes[3])
    ->Arg(num_hashes[4])
    ->Arg(num_hashes[5])
    ->Arg(num_hashes[6])
    ->Arg(num_hashes[7])
    ->Arg(num_hashes[8])
    ->Arg(num_hashes[9]);

void native_pedersen_eight_hash_bench(State& state) noexcept
{
    std::vector<grumpkin::fq> elements(8);
    for (size_t i = 0; i < 8; ++i) {
        elements[i] = grumpkin::fq::random_element();
    }
    for (auto _ : state) {
        crypto::pedersen_hash::hash(elements);
    }
}
BENCHMARK(native_pedersen_eight_hash_bench)->MinTime(3);

void native_pedersen_hash_pair_bench(State& state) noexcept
{
    std::vector<grumpkin::fq> elements(2);
    for (size_t i = 0; i < 2; ++i) {
        elements[i] = grumpkin::fq::random_element();
    }
    for (auto _ : state) {
        crypto::pedersen_hash::hash(elements);
    }
}
BENCHMARK(native_pedersen_hash_pair_bench)->Unit(benchmark::kMillisecond)->MinTime(3);

void construct_pedersen_proving_keys_bench(State& state) noexcept
{
    for (auto _ : state) {
        Builder builder = Builder(static_cast<size_t>(state.range(0)));
        generate_test_pedersen_hash_circuit(builder, static_cast<size_t>(state.range(0)));
        size_t idx = get_index(static_cast<size_t>(state.range(0)));

        pedersen_provers[idx] = Prover(builder);
    }
}
BENCHMARK(construct_pedersen_proving_keys_bench)
    ->Arg(num_hashes[0])
    ->Arg(num_hashes[1])
    ->Arg(num_hashes[2])
    ->Arg(num_hashes[3])
    ->Arg(num_hashes[4])
    ->Arg(num_hashes[5])
    ->Arg(num_hashes[6])
    ->Arg(num_hashes[7])
    ->Arg(num_hashes[8])
    ->Arg(num_hashes[9]);

void construct_pedersen_instances_bench(State& state) noexcept
{
    for (auto _ : state) {
        state.PauseTiming();
        auto builder = Builder(static_cast<size_t>(state.range(0)));
        generate_test_pedersen_hash_circuit(builder, static_cast<size_t>(state.range(0)));
        size_t idx = get_index(static_cast<size_t>(state.range(0)));

        pedersen_verifiers[idx] = Verifier(pedersen_provers[idx].proving_key->proving_key);
    }
}
BENCHMARK(construct_pedersen_instances_bench)
    ->Arg(num_hashes[0])
    ->Arg(num_hashes[1])
    ->Arg(num_hashes[2])
    ->Arg(num_hashes[3])
    ->Arg(num_hashes[4])
    ->Arg(num_hashes[5])
    ->Arg(num_hashes[6])
    ->Arg(num_hashes[7])
    ->Arg(num_hashes[8])
    ->Arg(num_hashes[9]);

void construct_pedersen_proofs_bench(State& state) noexcept
{
    for (auto _ : state) {
        size_t idx = get_index(static_cast<size_t>(state.range(0)));
        pedersen_proofs[idx] = pedersen_provers[idx].construct_proof();
        state.PauseTiming();
        pedersen_provers[idx].reset();
    }
}
BENCHMARK(construct_pedersen_proofs_bench)
    ->Arg(num_hashes[0])
    ->Arg(num_hashes[1])
    ->Arg(num_hashes[2])
    ->Arg(num_hashes[3])
    ->Arg(num_hashes[4])
    ->Arg(num_hashes[5])
    ->Arg(num_hashes[6])
    ->Arg(num_hashes[7])
    ->Arg(num_hashes[8])
    ->Arg(num_hashes[9]);

void verify_pedersen_proofs_bench(State& state) noexcept
{
    for (auto _ : state) {
        size_t idx = get_index(static_cast<size_t>(state.range(0)));
        pedersen_verifiers[idx].verify_proof(pedersen_proofs[idx]);
    }
}
BENCHMARK(verify_pedersen_proofs_bench)
    ->Arg(num_hashes[0])
    ->Arg(num_hashes[1])
    ->Arg(num_hashes[2])
    ->Arg(num_hashes[3])
    ->Arg(num_hashes[4])
    ->Arg(num_hashes[5])
    ->Arg(num_hashes[6])
    ->Arg(num_hashes[7])
    ->Arg(num_hashes[8])
    ->Arg(num_hashes[9]);

BENCHMARK_MAIN();
