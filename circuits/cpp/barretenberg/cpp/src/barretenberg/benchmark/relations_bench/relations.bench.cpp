#include "barretenberg/honk/flavor/goblin_ultra.hpp"
#include "barretenberg/honk/flavor/standard.hpp"
#include "barretenberg/honk/flavor/ultra.hpp"
#include "barretenberg/honk/sumcheck/relations/arithmetic_relation.hpp"
#include "barretenberg/honk/sumcheck/relations/auxiliary_relation.hpp"
#include "barretenberg/honk/sumcheck/relations/ecc_op_queue_relation.hpp"
#include "barretenberg/honk/sumcheck/relations/elliptic_relation.hpp"
#include "barretenberg/honk/sumcheck/relations/gen_perm_sort_relation.hpp"
#include "barretenberg/honk/sumcheck/relations/lookup_relation.hpp"
#include "barretenberg/honk/sumcheck/relations/permutation_relation.hpp"
#include "barretenberg/honk/sumcheck/relations/ultra_arithmetic_relation.hpp"
#include <benchmark/benchmark.h>

namespace {
auto& engine = numeric::random::get_debug_engine();
}

namespace proof_system::relation::benchmark {

using FF = barretenberg::fr;

template <typename Flavor, typename Relation> void execute_relation(::benchmark::State& state)
{
    // Generate beta and gamma
    auto beta = FF::random_element();
    auto gamma = FF::random_element();
    auto public_input_delta = FF::random_element();

    RelationParameters<FF> params{
        .beta = beta,
        .gamma = gamma,
        .public_input_delta = public_input_delta,
    };

    using ClaimedEvaluations = typename Flavor::ClaimedEvaluations;
    using RelationValues = typename Relation::RelationValues;

    // Extract an array containing all the polynomial evaluations at a given row i
    ClaimedEvaluations new_value;
    // Define the appropriate RelationValues type for this relation and initialize to zero
    RelationValues accumulator;
    // Evaluate each constraint in the relation and check that each is satisfied

    Relation relation;
    for (auto _ : state) {
        relation.add_full_relation_value_contribution(accumulator, new_value, params);
    }
}

void arithmetic_relation(::benchmark::State& state) noexcept
{
    execute_relation<honk::flavor::Standard, ArithmeticRelation<FF>>(state);
}
BENCHMARK(arithmetic_relation);

// WORKTODO
// void auxiliary_relation(::benchmark::State& state) noexcept
// {
//     execute_relation<honk::flavor::Ultra, AuxiliaryRelation<FF>>(state);
// }
// BENCHMARK(auxiliary_relation);

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

void permutation_relation(::benchmark::State& state) noexcept
{
    execute_relation<honk::flavor::Standard, PermutationRelation<FF>>(state);
}
BENCHMARK(permutation_relation);

void ultra_arithmetic_relation(::benchmark::State& state) noexcept
{
    execute_relation<honk::flavor::Ultra, UltraArithmeticRelation<FF>>(state);
}
BENCHMARK(ultra_arithmetic_relation);


} // namespace proof_system::honk::relations_bench
