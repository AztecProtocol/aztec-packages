#pragma once
#include "barretenberg/polynomials/univariate.hpp"
#include <tuple>

namespace proof_system {

/**
 * @brief Generic templates for constructing a container of containers of varying length, where the various lengths are
 * specified in an array.
 *
 * @details Credit: https://stackoverflow.com/a/60440611
 */
template <template <typename, size_t, size_t> typename InnerContainer,
          typename ValueType,
          auto LENGTHS,
          size_t sth = 0,
          typename IS = decltype(std::make_index_sequence<LENGTHS.size()>())>
struct TupleOfContainersOverArray;
template <template <typename, size_t, size_t> typename InnerContainer,
          typename ValueType,
          auto LENGTHS,
          size_t sth,
          std::size_t... I>
struct TupleOfContainersOverArray<InnerContainer, ValueType, LENGTHS, sth, std::index_sequence<I...>> {
    using type = std::tuple<InnerContainer<ValueType, LENGTHS[I], sth>...>;
};

// Helpers
template <typename ValueType, size_t, size_t> using ExtractValueType = ValueType;

template <typename Tuple>
using HomogeneousTupleToArray = std::array<std::tuple_element_t<0, Tuple>, std::tuple_size_v<Tuple>>;

// Types needed for sumcheck and folding.
template <typename FF, auto LENGTHS, size_t sth = 0>
using TupleOfUnivariates = typename TupleOfContainersOverArray<barretenberg::Univariate, FF, LENGTHS, sth>::type;

template <typename FF, auto LENGTHS, size_t sth = 0>
using TupleOfValues = typename TupleOfContainersOverArray<ExtractValueType, FF, LENGTHS, sth>::type;

template <typename FF, auto LENGTHS, size_t sth = 0>
using ArrayOfValues = HomogeneousTupleToArray<TupleOfValues<FF, LENGTHS, sth>>;

} // namespace proof_system