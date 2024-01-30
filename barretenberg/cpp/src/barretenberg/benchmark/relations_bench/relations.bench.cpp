#include "barretenberg/flavor/ecc_vm.hpp"
#include "barretenberg/flavor/goblin_translator.hpp"
#include "barretenberg/flavor/goblin_ultra.hpp"
#include "barretenberg/flavor/ultra.hpp"
#include <benchmark/benchmark.h>

namespace {
auto& engine = bb::numeric::get_debug_randomness();
}

using namespace bb

    namespace bb::benchmark::relations
{

    using Fr = bb::fr;
    using Fq = grumpkin::fr;

    template <typename Flavor, typename Relation> void execute_relation(::benchmark::State & state)
    {
        using FF = typename Flavor::FF;
        using AllValues = typename Flavor::AllValues;
        using SumcheckArrayOfValuesOverSubrelations = typename Relation::SumcheckArrayOfValuesOverSubrelations;

        auto params = bb::RelationParameters<FF>::get_random();

        // Extract an array containing all the polynomial evaluations at a given row i
        AllValues new_value{};
        // Define the appropriate SumcheckArrayOfValuesOverSubrelations type for this relation and initialize to zero
        SumcheckArrayOfValuesOverSubrelations accumulator;
        // Evaluate each constraint in the relation and check that each is satisfied

        for (auto _ : state) {
            Relation::accumulate(accumulator, new_value, params, 1);
        }
    }
    BENCHMARK(execute_relation<UltraFlavor, UltraArithmeticRelation<Fr>>);
    BENCHMARK(execute_relation<UltraFlavor, GenPermSortRelation<Fr>>);
    BENCHMARK(execute_relation<UltraFlavor, EllipticRelation<Fr>>);
    BENCHMARK(execute_relation<UltraFlavor, AuxiliaryRelation<Fr>>);
    BENCHMARK(execute_relation<UltraFlavor, LookupRelation<Fr>>);
    BENCHMARK(execute_relation<UltraFlavor, UltraPermutationRelation<Fr>>);

    BENCHMARK(execute_relation<GoblinUltraFlavor, EccOpQueueRelation<Fr>>);

    BENCHMARK(execute_relation<GoblinTranslator, GoblinTranslatorDecompositionRelation<Fr>>);
    BENCHMARK(execute_relation<GoblinTranslator, GoblinTranslatorOpcodeConstraintRelation<Fr>>);
    BENCHMARK(execute_relation<GoblinTranslator, GoblinTranslatorAccumulatorTransferRelation<Fr>>);
    BENCHMARK(execute_relation<GoblinTranslator, GoblinTranslatorGenPermSortRelation<Fr>>);
    BENCHMARK(execute_relation<GoblinTranslator, GoblinTranslatorNonNativeFieldRelation<Fr>>);
    BENCHMARK(execute_relation<GoblinTranslator, GoblinTranslatorPermutationRelation<Fr>>);

    BENCHMARK(execute_relation<ECCVM, ECCVMLookupRelation<Fq>>);
    BENCHMARK(execute_relation<ECCVM, ECCVMMSMRelation<Fq>>);
    BENCHMARK(execute_relation<ECCVM, ECCVMPointTableRelation<Fq>>);
    BENCHMARK(execute_relation<ECCVM, ECCVMSetRelation<Fq>>);
    BENCHMARK(execute_relation<ECCVM, ECCVMTranscriptRelation<Fq>>);
    BENCHMARK(execute_relation<ECCVM, ECCVMWnafRelation<Fq>>);

} // namespace bb::benchmark::relations

BENCHMARK_MAIN();