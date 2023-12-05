#include "barretenberg/benchmark/honk_bench/benchmark_utilities.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

using namespace benchmark;
using namespace proof_system;

int main()
{
    barretenberg::srs::init_crs_factory("../srs_db/ignition");

    honk::UltraComposer composer;
    size_t log2_of_gates = 20;
    auto prover = bench_utils::get_prover(
        composer, &bench_utils::generate_basic_arithmetic_circuit<UltraCircuitBuilder>, log2_of_gates);
    for (int i = 0; i < 10; i++) {
        // Construct proof
        auto proof = prover.construct_proof();
    }
    return 0;
}