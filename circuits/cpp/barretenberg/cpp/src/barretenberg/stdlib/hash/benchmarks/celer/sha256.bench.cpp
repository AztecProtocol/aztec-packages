#include "barretenberg/stdlib/hash/sha256/sha256.hpp"
#include "barretenberg/plonk/composer/ultra_composer.hpp"
#include <benchmark/benchmark.h>
#include <bit>

using namespace benchmark;

using Builder = proof_system::UltraCircuitBuilder;
using Composer = proof_system::plonk::UltraComposer;
using Prover = proof_system::plonk::UltraProver;
using Verifier = proof_system::plonk::UltraVerifier;

constexpr size_t NUM_HASHES = 20;
constexpr size_t CHUNK_SIZE = 64;
constexpr size_t MINIMUM_CHUNKS = 1;
constexpr size_t MAXIMUM_CHUNKS = 1024;

void generate_test_plonk_circuit(Builder& builder, size_t num_bytes)
{
    std::string in;
    in.resize(num_bytes);
    proof_system::plonk::stdlib::packed_byte_array<Builder> input(&builder, in);

    proof_system::plonk::stdlib::sha256<Builder>(input);
}

void* builders[NUM_HASHES];
void* composers[NUM_HASHES];
Prover provers[NUM_HASHES];
Verifier verifiers[NUM_HASHES];
plonk::proof proofs[NUM_HASHES];

void construct_witnesses_bench(State& state) noexcept
{
    for (auto _ : state) {
        size_t num_chunks = static_cast<size_t>(state.range(0));
        size_t idx = static_cast<size_t>(std::countr_zero(num_chunks));
        builders[idx] = (void*)new Builder();
        generate_test_plonk_circuit(*(Builder*)builders[idx], num_chunks * CHUNK_SIZE);
    }
}
BENCHMARK(construct_witnesses_bench)
    ->RangeMultiplier(2)
    ->Range(MINIMUM_CHUNKS, MAXIMUM_CHUNKS)
    ->Unit(benchmark::kMillisecond);

void preprocess_witnesses_bench(State& state) noexcept
{
    for (auto _ : state) {
        size_t num_chunks = static_cast<size_t>(state.range(0));
        size_t idx = static_cast<size_t>(std::countr_zero(num_chunks));
        composers[idx] = (void*)new Composer();
        provers[idx] = ((Composer*)composers[idx])->create_prover(*(Builder*)builders[idx]);
        std::cout << "prover subgroup size = " << provers[idx].key->small_domain.size << std::endl;
    }
}
BENCHMARK(preprocess_witnesses_bench)
    ->RangeMultiplier(2)
    ->Range(MINIMUM_CHUNKS, MAXIMUM_CHUNKS)
    ->Unit(benchmark::kMillisecond);

void construct_instances_bench(State& state) noexcept
{
    for (auto _ : state) {
        size_t num_chunks = static_cast<size_t>(state.range(0));
        size_t idx = static_cast<size_t>(std::countr_zero(num_chunks));

        verifiers[idx] = ((Composer*)composers[idx])->create_verifier(*(Builder*)builders[idx]);
    }
}
BENCHMARK(construct_instances_bench)
    ->RangeMultiplier(2)
    ->Range(MINIMUM_CHUNKS, MAXIMUM_CHUNKS)
    ->Unit(benchmark::kMillisecond);

void construct_proofs_bench(State& state) noexcept
{
    for (auto _ : state) {
        size_t num_chunks = static_cast<size_t>(state.range(0));
        size_t idx = static_cast<size_t>(std::countr_zero(num_chunks));

        proofs[idx] = provers[idx].construct_proof();
        state.PauseTiming();
        provers[idx].reset();
        state.ResumeTiming();
    }
}
BENCHMARK(construct_proofs_bench)
    ->RangeMultiplier(2)
    ->Range(MINIMUM_CHUNKS, MAXIMUM_CHUNKS)
    ->Unit(benchmark::kMillisecond);

void verify_proofs_bench(State& state) noexcept
{
    for (auto _ : state) {
        size_t num_chunks = static_cast<size_t>(state.range(0));
        size_t idx = static_cast<size_t>(std::countr_zero(num_chunks));
        verifiers[idx].verify_proof(proofs[idx]);
    }
}
BENCHMARK(verify_proofs_bench)
    ->RangeMultiplier(2)
    ->Range(MINIMUM_CHUNKS, MAXIMUM_CHUNKS)
    ->Unit(benchmark::kMillisecond);

BENCHMARK_MAIN();
