#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/honk_bench/benchmark_utilities.hpp"
#include "barretenberg/honk/composer/ultra_composer.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"

using namespace benchmark;
using namespace proof_system::plonk;

namespace foo {

using UltraBuilder = proof_system::UltraCircuitBuilder;
using UltraHonk = proof_system::honk::UltraComposer;

// Number of times to perform operation of interest in the benchmark circuits, e.g. # of hashes to perform
constexpr size_t MIN_NUM_ITERATIONS = bench_utils::BenchParams::MIN_NUM_ITERATIONS;
constexpr size_t MAX_NUM_ITERATIONS = bench_utils::BenchParams::MAX_NUM_ITERATIONS;
// Number of times to repeat each benchmark
constexpr size_t NUM_REPETITIONS = bench_utils::BenchParams::NUM_REPETITIONS;

/**
 * @brief Benchmark: Construction of a Ultra Honk proof for a circuit determined by the provided circuit function
 */
void construct_proof_ultra() noexcept
{
    barretenberg::srs::init_crs_factory("../srs_db/ignition");
    auto num_iterations = 1;
    // Constuct circuit and prover; don't include this part in measurement
    auto builder = typename Composer::CircuitBuilder();
    bench_utils::generate_sha256_test_circuit<UltraBuilder>(builder, num_iterations);

    auto composer = Composer();
    auto instance = composer.create_instance(builder);
    auto ext_prover = composer.create_prover(instance);
    auto proof = ext_prover.construct_proof();
}
} // namespace foo

int main()
{
    foo::construct_proof_ultra();
}
