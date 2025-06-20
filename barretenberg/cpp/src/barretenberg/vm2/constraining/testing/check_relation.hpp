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

template <typename Relation, typename Trace>
void check_relation_internal(const Trace& trace, std::span<const size_t> subrelations, uint32_t num_rows)
{
    typename Relation::SumcheckArrayOfValuesOverSubrelations result{};

    // Accumulate the trace over the subrelations and check the result
    // if the subrelation is linearly independent.
    for (uint32_t r = 0; r < num_rows; ++r) {
        Relation::accumulate(result, trace.get_row(r), get_test_params(), 1);
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
    detail::check_relation_internal<Relation>(trace, subrelations, trace.get_num_rows());
}

template <typename Relation> void check_relation(const tracegen::TestTraceContainer& trace)
{
    auto subrelations = std::make_index_sequence<Relation::SUBRELATION_PARTIAL_LENGTHS.size()>();
    [&]<size_t... Is>(std::index_sequence<Is...>) { check_relation<Relation>(trace, Is...); }(subrelations);
}

template <typename TraceBuilder, typename... Setting> inline void check_interaction(tracegen::TestTraceContainer& trace)
{
    (TraceBuilder::interactions.template get_test_job<Setting>()->process(trace), ...);
}

template <typename TraceBuilder> inline void check_all_interactions(tracegen::TestTraceContainer& trace)
{
    for (auto& job : TraceBuilder::interactions.get_all_test_jobs()) {
        job->process(trace);
    }
}

} // namespace bb::avm2::constraining
