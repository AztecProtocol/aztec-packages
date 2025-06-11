#include <benchmark/benchmark.h>

#include <cstddef>
#include <cstdint>
#include <tuple>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/constraining/flavor.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/generated/columns.hpp"

using namespace benchmark;
using namespace bb::avm2;

namespace {

AvmFullRow get_random_row()
{
    AvmFullRow row;
    for (size_t i = 0; i < NUM_COLUMNS_WITH_SHIFTS; i++) {
        row.get(static_cast<ColumnAndShifts>(i)) = FF::random_element();
    }
    return row;
}

bb::RelationParameters<FF> get_params()
{
    return {
        .eta = 0,
        .beta = FF::random_element(),
        .gamma = FF::random_element(),
        .public_input_delta = 0,
        .lookup_grand_product_delta = 0,
        .beta_sqr = 0,
        .beta_cube = 0,
        .eccvm_set_permutation_delta = 0,
    };
}

template <typename Relation> void BM_accumulate_relation(State& state)
{
    auto row = get_random_row();
    auto params = get_params();
    FF scaling_factor = 1;

    typename Relation::SumcheckArrayOfValuesOverSubrelations result{};

    for (auto _ : state) {
        Relation::accumulate(result, row, params, scaling_factor);
    }
}

template <typename Relation> constexpr size_t get_interactions_count()
{
    size_t count = 0;
    using AllInteractions = typename AvmFlavor::LookupRelations;
    bb::constexpr_for<0, std::tuple_size_v<AllInteractions>, 1>([&]<size_t i>() {
        using Interaction = std::tuple_element_t<i, AllInteractions>;
        if constexpr (Relation::NAME == Interaction::RELATION_NAME) {
            count++;
        }
    });
    return count;
}

template <typename Relation> void BM_accumulate_interactions(State& state)
{
    using AllInteractions = typename AvmFlavor::LookupRelations;
    bb::constexpr_for<0, std::tuple_size_v<AllInteractions>, 1>([&]<size_t i>() {
        using Interaction = std::tuple_element_t<i, AllInteractions>;
        if constexpr (Relation::NAME == Interaction::RELATION_NAME) {
            BM_accumulate_relation<Interaction>(state);
        }
    });
}

} // namespace

int main(int argc, char** argv)
{
    bb::constexpr_for<0, std::tuple_size_v<typename AvmFlavor::MainRelations>, 1>([&]<size_t i>() {
        using Relation = std::tuple_element_t<i, typename AvmFlavor::MainRelations>;
        BENCHMARK(BM_accumulate_relation<Relation>)->Name(std::string(Relation::NAME) + "_acc")->Unit(kMicrosecond);
        if (get_interactions_count<Relation>() > 0) {
            BENCHMARK(BM_accumulate_interactions<Relation>)
                ->Name(std::string(Relation::NAME) + "_interactions_acc")
                ->Unit(kMicrosecond);
        }
    });

    ::benchmark::Initialize(&argc, argv);
    ::benchmark::RunSpecifiedBenchmarks();
}
