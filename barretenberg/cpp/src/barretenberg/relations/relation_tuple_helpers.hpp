// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/tuple.hpp"

#include <algorithm>
#include <cstddef>
#include <tuple>

namespace bb {

/**
 * @brief Utility function to find max PARTIAL_RELATION_LENGTH tuples of Relations.
 * @details The "partial length" of a relation is 1 + the degree of the relation, where any challenges used in the
 * relation are as constants, not as variables..
 */
template <typename Tuple> constexpr size_t compute_max_partial_relation_length()
{
    constexpr auto seq = std::make_index_sequence<std::tuple_size_v<Tuple>>();
    return []<std::size_t... Is>(std::index_sequence<Is...>) {
        return std::max({ std::tuple_element_t<Is, Tuple>::RELATION_LENGTH... });
    }(seq);
}

/**
 * @brief Utility function to find the number of subrelations.
 */
template <typename Tuple> constexpr size_t compute_number_of_subrelations()
{
    constexpr auto seq = std::make_index_sequence<std::tuple_size_v<Tuple>>();
    return []<std::size_t... I>(std::index_sequence<I...>) {
        return (0 + ... + std::tuple_element_t<I, Tuple>::SUBRELATION_PARTIAL_LENGTHS.size());
    }(seq);
}

/**
 * @brief Utility function to construct a container for the subrelation accumulators of sumcheck proving.
 * @details The size of the outer tuple is equal to the number of relations. Each relation contributes an inner
 * tuple of univariates whose size is equal to the number of subrelations of the relation. The length of a
 * univariate in an inner tuple is determined by the corresponding subrelation length.
 */
template <typename RelationsTuple> constexpr auto create_sumcheck_tuple_of_tuples_of_univariates()
{
    constexpr auto seq = std::make_index_sequence<std::tuple_size_v<RelationsTuple>>();
    return []<size_t... I>(std::index_sequence<I...>) {
        return flat_tuple::make_tuple(
            typename std::tuple_element_t<I, RelationsTuple>::SumcheckTupleOfUnivariatesOverSubrelations{}...);
    }(seq);
}

/**
 * @brief Create a tuple of arrays of values for relation evaluations.
 *
 * @details Returns a tuple of length equal to the number of relations in RelationsTuple, where the element at index
 * idx is an array of FF elements of length equal to the number of subrelations of the relation at that index.
 *
 * @tparam RelationsTuple
 */
template <typename RelationsTuple> constexpr auto create_tuple_of_arrays_of_values()
{
    constexpr auto seq = std::make_index_sequence<std::tuple_size_v<RelationsTuple>>();
    return []<size_t... I>(std::index_sequence<I...>) {
        return flat_tuple::make_tuple(
            typename std::tuple_element_t<I, RelationsTuple>::SumcheckArrayOfValuesOverSubrelations{}...);
    }(seq);
}

} // namespace bb
