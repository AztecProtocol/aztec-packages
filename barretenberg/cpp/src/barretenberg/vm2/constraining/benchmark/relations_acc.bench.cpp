#include <benchmark/benchmark.h>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/flavor.hpp"
#include "barretenberg/vm2/generated/full_row.hpp"
#include "barretenberg/vm2/generated/relations/range_check.hpp"

using namespace benchmark;
using namespace bb::avm2;

namespace {

AvmFullRow<FF> get_random_row()
{
    AvmFullRow<FF> row;
    for (size_t i = 0; i < NUM_COLUMNS_WITH_SHIFTS; i++) {
        row.get_column(static_cast<ColumnAndShifts>(i)) = FF::random_element();
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

template <typename Relation> void BM_accumulate_random(State& state)
{
    auto row = get_random_row();
    auto params = get_params();
    FF scaling_factor = 1;

    typename Relation::SumcheckArrayOfValuesOverSubrelations result{};

    for (auto _ : state) {
        Relation::accumulate(result, row, params, scaling_factor);
    }
}

} // namespace

int main(int argc, char** argv)
{
    bb::constexpr_for<0, std::tuple_size_v<typename AvmFlavor::MainRelations>, 1>([&]<size_t i>() {
        using Relation = std::tuple_element_t<i, typename AvmFlavor::MainRelations>;
        BENCHMARK(BM_accumulate_random<Relation>)
            ->Name(std::string(Relation::NAME) + "_acc_random")
            ->Unit(kMicrosecond);
    });

    ::benchmark::Initialize(&argc, argv);
    ::benchmark::RunSpecifiedBenchmarks();
}