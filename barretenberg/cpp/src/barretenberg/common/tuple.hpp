#pragma once

#include "barretenberg/common/tuplet.hpp"

namespace bb {

namespace flat_tuple = ::tuplet;

} // namespace bb

namespace std {

template <size_t I, class... T> constexpr decltype(auto) get(::tuplet::tuple<T...>&& t) noexcept
{
    return ::tuplet::get<I>(static_cast<::tuplet::tuple<T...>&&>(t));
}
template <size_t I, class... T> constexpr decltype(auto) get(::tuplet::tuple<T...>& t) noexcept
{
    return ::tuplet::get<I>(static_cast<::tuplet::tuple<T...>&>(t));
}
template <size_t I, class... T> constexpr decltype(auto) get(const ::tuplet::tuple<T...>& t) noexcept
{
    return ::tuplet::get<I>(static_cast<const ::tuplet::tuple<T...>&>(t));
}
template <size_t I, class... T> constexpr decltype(auto) get(const ::tuplet::tuple<T...>&& t) noexcept
{
    return ::tuplet::get<I>(static_cast<const ::tuplet::tuple<T...>&&>(t));
}

} // namespace std
