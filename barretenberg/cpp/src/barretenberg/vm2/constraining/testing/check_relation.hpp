#pragma once

#include <array>
#include <bits/utility.h>
#include <span>
#include <stdexcept>

#include "barretenberg/common/log.hpp"

namespace bb::avm2::constraining {

template <typename Relation, typename Trace>
void check_relation_internal(const Trace& trace, std::span<size_t> subrelations)
{
    typename Relation::SumcheckArrayOfValuesOverSubrelations result{};

    for (size_t r = 0; r < trace.size(); ++r) {
        Relation::accumulate(result, trace.at(r), {}, 1);
        for (size_t j : subrelations) {
            if (!result[j].is_zero()) {
                throw std::runtime_error(format("Relation ",
                                                Relation::NAME,
                                                ", subrelation ",
                                                Relation::get_subrelation_label(j),
                                                " failed at row ",
                                                r));
            }
        }
    }
}

template <typename Relation, typename Trace, typename... Ts> void check_relation(const Trace& trace, Ts... subrelation)
{
    std::array<size_t, sizeof...(Ts)> subrelations = { subrelation... };
    check_relation_internal<Relation>(trace, subrelations);
}

template <typename Relation, typename Trace> void check_relation(const Trace& trace)
{
    auto subrelations = std::make_index_sequence<Relation::SUBRELATION_PARTIAL_LENGTHS.size()>();
    [&]<size_t... Is>(std::index_sequence<Is...>) { check_relation<Relation>(trace, Is...); }(subrelations);
}

} // namespace bb::avm2::constraining