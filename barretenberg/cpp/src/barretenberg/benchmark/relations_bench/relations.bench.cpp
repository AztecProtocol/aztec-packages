#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover.hpp"
#include "barretenberg/stdlib_circuit_builders/goblin_ultra_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/translator_vm/goblin_translator_flavor.hpp"
#include <benchmark/benchmark.h>

namespace {
auto& engine = bb::numeric::get_debug_randomness();
}

namespace bb::benchmark::relations {

using Fr = bb::fr;
using Fq = grumpkin::fr;

template <typename Flavor, typename Relation> void execute_relation_for_values(::benchmark::State& state)
{
    using FF = typename Flavor::FF;
    using Input = typename Flavor::AllValues;
    using Accumulator = typename Relation::SumcheckArrayOfValuesOverSubrelations;

    auto params = bb::RelationParameters<FF>::get_random();

    // Instantiate zero-initialized inputs and accumulator
    Input input_values{};
    Accumulator accumulator;

    for (auto _ : state) {
        Relation::accumulate(accumulator, input_values, params, 1);
    }
}

template <typename Flavor, typename Relation> void execute_relation_for_univariates(::benchmark::State& state)
{
    using FF = typename Flavor::FF;
    using Input = typename Flavor::ExtendedEdges;
    using Accumulator = typename Relation::SumcheckTupleOfUnivariatesOverSubrelations;

    auto params = bb::RelationParameters<FF>::get_random();

    // Instantiate zero-initialized inputs and accumulator
    Input input_univariates{};
    Accumulator accumulator;

    for (auto _ : state) {
        Relation::accumulate(accumulator, input_univariates, params, 1);
    }
}

template <typename Flavor, typename Relation> void execute_relation_for_univariates_pg(::benchmark::State& state)
{
    using FF = typename Flavor::FF;
    using ProverInstances = ProverInstances_<Flavor>;
    using ProtoGalaxyProver = ProtoGalaxyProver_<ProverInstances>;
    using Input = ProtoGalaxyProver::ExtendedUnivariates;
    using Accumulator = typename Relation::template ProtogalaxyTupleOfUnivariatesOverSubrelations<ProverInstances::NUM>;

    auto params = bb::RelationParameters<FF>::get_random();

    // Instantiate zero-initialized inputs and accumulator
    Input input_univariates{};
    Accumulator accumulator;

    for (auto _ : state) {
        Relation::accumulate(accumulator, input_univariates, params, 1);
    }
}

// Ultra relations (PG prover work)
BENCHMARK(execute_relation_for_univariates_pg<UltraFlavor, UltraArithmeticRelation<Fr>>);
BENCHMARK(execute_relation_for_univariates_pg<UltraFlavor, DeltaRangeConstraintRelation<Fr>>);
BENCHMARK(execute_relation_for_univariates_pg<UltraFlavor, EllipticRelation<Fr>>);
BENCHMARK(execute_relation_for_univariates_pg<UltraFlavor, AuxiliaryRelation<Fr>>);
BENCHMARK(execute_relation_for_univariates_pg<UltraFlavor, LookupRelation<Fr>>);
BENCHMARK(execute_relation_for_univariates_pg<UltraFlavor, UltraPermutationRelation<Fr>>);

// Goblin-Ultra only relations (PG prover work)
BENCHMARK(execute_relation_for_univariates_pg<GoblinUltraFlavor, EccOpQueueRelation<Fr>>);
BENCHMARK(execute_relation_for_univariates_pg<GoblinUltraFlavor, DatabusLookupRelation<Fr>>);
BENCHMARK(execute_relation_for_univariates_pg<GoblinUltraFlavor, Poseidon2ExternalRelation<Fr>>);
BENCHMARK(execute_relation_for_univariates_pg<GoblinUltraFlavor, Poseidon2InternalRelation<Fr>>);

// Ultra relations (Sumcheck prover work)
BENCHMARK(execute_relation_for_univariates<UltraFlavor, UltraArithmeticRelation<Fr>>);
BENCHMARK(execute_relation_for_univariates<UltraFlavor, DeltaRangeConstraintRelation<Fr>>);
BENCHMARK(execute_relation_for_univariates<UltraFlavor, EllipticRelation<Fr>>);
BENCHMARK(execute_relation_for_univariates<UltraFlavor, AuxiliaryRelation<Fr>>);
BENCHMARK(execute_relation_for_univariates<UltraFlavor, LookupRelation<Fr>>);
BENCHMARK(execute_relation_for_univariates<UltraFlavor, UltraPermutationRelation<Fr>>);

// Goblin-Ultra only relations (Sumcheck prover work)
BENCHMARK(execute_relation_for_univariates<GoblinUltraFlavor, EccOpQueueRelation<Fr>>);
BENCHMARK(execute_relation_for_univariates<GoblinUltraFlavor, DatabusLookupRelation<Fr>>);
BENCHMARK(execute_relation_for_univariates<GoblinUltraFlavor, Poseidon2ExternalRelation<Fr>>);
BENCHMARK(execute_relation_for_univariates<GoblinUltraFlavor, Poseidon2InternalRelation<Fr>>);

// Ultra relations (verifier work)
BENCHMARK(execute_relation_for_values<UltraFlavor, UltraArithmeticRelation<Fr>>);
BENCHMARK(execute_relation_for_values<UltraFlavor, DeltaRangeConstraintRelation<Fr>>);
BENCHMARK(execute_relation_for_values<UltraFlavor, EllipticRelation<Fr>>);
BENCHMARK(execute_relation_for_values<UltraFlavor, AuxiliaryRelation<Fr>>);
BENCHMARK(execute_relation_for_values<UltraFlavor, LookupRelation<Fr>>);
BENCHMARK(execute_relation_for_values<UltraFlavor, UltraPermutationRelation<Fr>>);

// Goblin-Ultra only relations (verifier work)
BENCHMARK(execute_relation_for_values<GoblinUltraFlavor, EccOpQueueRelation<Fr>>);
BENCHMARK(execute_relation_for_values<GoblinUltraFlavor, DatabusLookupRelation<Fr>>);
BENCHMARK(execute_relation_for_values<GoblinUltraFlavor, Poseidon2ExternalRelation<Fr>>);
BENCHMARK(execute_relation_for_values<GoblinUltraFlavor, Poseidon2InternalRelation<Fr>>);

BENCHMARK(execute_relation_for_values<GoblinTranslatorFlavor, GoblinTranslatorDecompositionRelation<Fr>>);
BENCHMARK(execute_relation_for_values<GoblinTranslatorFlavor, GoblinTranslatorOpcodeConstraintRelation<Fr>>);
BENCHMARK(execute_relation_for_values<GoblinTranslatorFlavor, GoblinTranslatorAccumulatorTransferRelation<Fr>>);
BENCHMARK(execute_relation_for_values<GoblinTranslatorFlavor, GoblinTranslatorDeltaRangeConstraintRelation<Fr>>);
BENCHMARK(execute_relation_for_values<GoblinTranslatorFlavor, GoblinTranslatorNonNativeFieldRelation<Fr>>);
BENCHMARK(execute_relation_for_values<GoblinTranslatorFlavor, GoblinTranslatorPermutationRelation<Fr>>);

BENCHMARK(execute_relation_for_values<ECCVMFlavor, ECCVMLookupRelation<Fq>>);
BENCHMARK(execute_relation_for_values<ECCVMFlavor, ECCVMMSMRelation<Fq>>);
BENCHMARK(execute_relation_for_values<ECCVMFlavor, ECCVMPointTableRelation<Fq>>);
BENCHMARK(execute_relation_for_values<ECCVMFlavor, ECCVMSetRelation<Fq>>);
BENCHMARK(execute_relation_for_values<ECCVMFlavor, ECCVMTranscriptRelation<Fq>>);
BENCHMARK(execute_relation_for_values<ECCVMFlavor, ECCVMWnafRelation<Fq>>);

} // namespace bb::benchmark::relations

BENCHMARK_MAIN();