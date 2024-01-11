#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/ultra_bench/benchmark_utilities.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

using namespace benchmark;

namespace proof_system::honk {
using Flavor = flavor::Ultra;
using Instance = ProverInstance_<Flavor>;
using Instances = ProverInstances_<Flavor, 2>;
using ProtoGalaxyProver = ProtoGalaxyProver_<Instances>;
using FF = Flavor::FF;
using Affine = Flavor::Commitment;
using Projective = Flavor::GroupElement;
using Builder = Flavor::CircuitBuilder;
using Polynomial = typename Flavor::Polynomial;
using ProverPolynomials = Flavor::ProverPolynomials;
using RelationParameters = proof_system::RelationParameters<FF>;
using WitnessCommitments = typename Flavor::WitnessCommitments;
using CommitmentKey = Flavor::CommitmentKey;
using PowPolynomial = barretenberg::PowPolynomial<FF>;

// Fole one instance into an accumulator.
void fold_one(State& state) noexcept
{
    barretenberg::srs::init_crs_factory("../srs_db/ignition");

    auto log2_num_gates = static_cast<size_t>(state.range(0));
    auto composer = UltraComposer();

    const auto construct_instance = [&]() {
        auto builder = typename Flavor::CircuitBuilder();
        bench_utils::generate_basic_arithmetic_circuit(builder, log2_num_gates);
        return composer.create_instance(builder);
    };

    auto instance_1 = construct_instance();
    auto instance_2 = construct_instance();
    // auto instances = std::vector<std::shared_ptr<Instance>>{ instance_1, instance_2 };

    auto folding_prover = composer.create_folding_prover({ instance_1, instance_2 }, composer.commitment_key);

    for (auto _ : state) {
        auto proof = folding_prover.fold_instances();
    }
}

BENCHMARK(fold_one)->/* vary the circuit size */ DenseRange(14, 20)->Unit(kMillisecond);
} // namespace proof_system::honk