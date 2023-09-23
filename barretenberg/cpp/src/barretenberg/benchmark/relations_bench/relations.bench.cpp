#include "barretenberg/honk/flavor/goblin_ultra.hpp"
#include "barretenberg/honk/flavor/ultra.hpp"
#include "barretenberg/proof_system/relations/auxiliary_relation.hpp"
#include "barretenberg/proof_system/relations/ecc_op_queue_relation.hpp"
#include "barretenberg/proof_system/relations/elliptic_relation.hpp"
#include "barretenberg/proof_system/relations/gen_perm_sort_relation.hpp"
#include "barretenberg/proof_system/relations/lookup_relation.hpp"
#include "barretenberg/proof_system/relations/permutation_relation.hpp"
#include "barretenberg/proof_system/relations/ultra_arithmetic_relation.hpp"
#include <benchmark/benchmark.h>

namespace {
auto& engine = numeric::random::get_debug_engine();
}

namespace proof_system::benchmark::relations {

using FF = barretenberg::fr;

template <typename Flavor, typename Relation> void execute_relation(::benchmark::State& state)
{
    using ClaimedEvaluations = typename Flavor::ClaimedEvaluations;
    using RelationValues = typename Relation::RelationValues;

    RelationValues accumulator;
    ClaimedEvaluations new_value;
    auto params = RelationParameters<FF>::get_random();

    for (auto _ : state) {
        Relation::add_full_relation_value_contribution(accumulator, new_value, params);
    }
}

void auxiliary_relation(::benchmark::State& state) noexcept
{
    execute_relation<honk::flavor::Ultra, AuxiliaryRelation<FF>>(state);
}
BENCHMARK(auxiliary_relation);

void elliptic_relation(::benchmark::State& state) noexcept
{
    execute_relation<honk::flavor::Ultra, EllipticRelation<FF>>(state);
}
BENCHMARK(elliptic_relation);

void ecc_op_queue_relation(::benchmark::State& state) noexcept
{
    execute_relation<honk::flavor::GoblinUltra, EccOpQueueRelation<FF>>(state);
}
BENCHMARK(ecc_op_queue_relation);

void gen_perm_sort_relation(::benchmark::State& state) noexcept
{
    execute_relation<honk::flavor::Ultra, GenPermSortRelation<FF>>(state);
}
BENCHMARK(gen_perm_sort_relation);

void lookup_relation(::benchmark::State& state) noexcept
{
    execute_relation<honk::flavor::Ultra, LookupRelation<FF>>(state);
}
BENCHMARK(lookup_relation);

void ultra_permutation_relation(::benchmark::State& state) noexcept
{
    execute_relation<honk::flavor::Ultra, UltraPermutationRelation<FF>>(state);
}
BENCHMARK(ultra_permutation_relation);

void ultra_arithmetic_relation(::benchmark::State& state) noexcept
{
    execute_relation<honk::flavor::Ultra, UltraArithmeticRelation<FF>>(state);
}
BENCHMARK(ultra_arithmetic_relation);

} // namespace proof_system::benchmark::relations
