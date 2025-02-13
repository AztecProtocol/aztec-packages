#pragma once

#include <array>
#include <cstdlib>
#include <span>
#include <stdexcept>

#include "barretenberg/common/log.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/relations/relation_types.hpp"
#include "barretenberg/vm2/constraining/polynomials.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace detail {

const RelationParameters<FF>& get_test_params();

template <typename Relation> constexpr bool subrelation_is_linearly_independent(size_t subrelation_index)
{
    if constexpr (HasSubrelationLinearlyIndependentMember<Relation>) {
        return Relation::SUBRELATION_LINEARLY_INDEPENDENT[subrelation_index];
    } else {
        return true;
    }
}

template <typename Relation, typename Trace, typename RowGetter>
void check_relation_internal(const Trace& trace, std::span<const size_t> subrelations, RowGetter get_row)
{
    typename Relation::SumcheckArrayOfValuesOverSubrelations result{};

    // Accumulate the trace over the subrelations and check the result
    // if the subrelation is linearly independent.
    for (size_t r = 0; r < trace.size(); ++r) {
        Relation::accumulate(result, get_row(trace, r), get_test_params(), 1);
        for (size_t j : subrelations) {
            if (subrelation_is_linearly_independent<Relation>(j) && !result[j].is_zero()) {
                throw std::runtime_error(format("Relation ",
                                                Relation::NAME,
                                                ", subrelation ",
                                                Relation::get_subrelation_label(j),
                                                " failed at row ",
                                                r));
            }
        }
    }
    // For all subrelations, the result should be zero at the end of the trace.
    for (size_t j : subrelations) {
        if (!result[j].is_zero()) {
            throw std::runtime_error(format("Relation ",
                                            Relation::NAME,
                                            ", subrelation ",
                                            Relation::get_subrelation_label(j),
                                            " is non-zero at end of trace"));
        }
    }
}

} // namespace detail

template <typename Relation, typename... Ts>
void check_relation(const tracegen::TestTraceContainer& trace, Ts... subrelation)
{
    std::array<size_t, sizeof...(Ts)> subrelations = { subrelation... };
    detail::check_relation_internal<Relation>(
        trace.as_rows(), subrelations, [](const auto& trace, size_t r) { return trace.at(r); });
}

template <typename Relation> void check_relation(const tracegen::TestTraceContainer& trace)
{
    auto subrelations = std::make_index_sequence<Relation::SUBRELATION_PARTIAL_LENGTHS.size()>();
    [&]<size_t... Is>(std::index_sequence<Is...>) { check_relation<Relation>(trace, Is...); }(subrelations);
}

// Computes logderiv inverses and checks the lookup or permutation.
template <typename Lookup> void check_interaction(const tracegen::TestTraceContainer& trace)
{
    using Settings = typename Lookup::Settings;
    if (trace.get_column_rows(Settings::INVERSES) == 0) {
        std::cerr << "Inverses for " << Lookup::NAME
                  << " are unset. Did you forget to run a lookup/permutation builder?" << std::endl;
        abort();
    }
    // We copy the trace because constructing the polynomials destroys it.
    auto trace_copy = trace;
    const auto num_rows = trace.get_num_rows();
    // We compute the polys and the real inverses.
    auto polys = constraining::compute_polynomials(trace_copy);
    bb::compute_logderivative_inverse<FF, Lookup>(polys, detail::get_test_params(), num_rows);
    // Finally we check the interaction.
    [&]<size_t... Is>(std::index_sequence<Is...>) {
        constexpr std::array<size_t, sizeof...(Is)> subrels = { Is... };
        detail::check_relation_internal<Lookup>(
            polys, subrels, [](const auto& polys, size_t r) { return polys.get_row(r); });
    }(std::make_index_sequence<Lookup::SUBRELATION_PARTIAL_LENGTHS.size()>());
}

} // namespace bb::avm2::constraining