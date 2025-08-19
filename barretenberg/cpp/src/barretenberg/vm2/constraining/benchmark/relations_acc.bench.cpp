#include <benchmark/benchmark.h>

#include <cstddef>
#include <cstdint>
#include <tuple>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/constraining/flavor.hpp"
#include "barretenberg/vm2/generated/columns.hpp"

using namespace benchmark;
using namespace bb::avm2;

namespace {

// Using a row of MAX_PARTIAL_RELATION_LENGTH univariates is a better approximation of what proving does.
// Benchmarking with this would then take into account any gains via the use of Accumulator::View.
// However, compilation time for the benchmark becomes as long as for prover.cpp.
#ifdef AVM_USE_UNIVARIATES

struct FakeUnivariateAllEntities {
    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = AvmFlavor::MAX_PARTIAL_RELATION_LENGTH;
    using DataType = bb::Univariate<FF, MAX_PARTIAL_RELATION_LENGTH>;

    DataType fixed_random_value;

    FakeUnivariateAllEntities(const DataType& fixed_random_value)
        : fixed_random_value(fixed_random_value)
    {}
    const DataType& get(ColumnAndShifts) const { return fixed_random_value; }
};

FakeUnivariateAllEntities get_random_row()
{
    return FakeUnivariateAllEntities(FakeUnivariateAllEntities::DataType::random_element());
}

template <typename Relation> auto allocate_result()
{
    return typename Relation::SumcheckTupleOfUnivariatesOverSubrelations{};
}

// Otherwise, we use a fake row of FFs, which is closer to what check-circuit does.
// This disregards any gains via the use of Accumulator::View.
#else

struct FakeAvmFullRow {
    using DataType = FF;

    FakeAvmFullRow(const FF& fixed_random_value)
        : fixed_random_value(fixed_random_value)
    {}
    const FF& get(ColumnAndShifts) const { return fixed_random_value; }

    FF fixed_random_value;
};

FakeAvmFullRow get_random_row()
{
    return FakeAvmFullRow(FF::random_element());
}

template <typename Relation> auto allocate_result()
{
    return typename Relation::SumcheckArrayOfValuesOverSubrelations{};
}

#endif // AVM_USE_UNIVARIATES

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

    auto result = allocate_result<Relation>();

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
