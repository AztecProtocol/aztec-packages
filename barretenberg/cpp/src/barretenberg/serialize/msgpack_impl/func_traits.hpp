#pragma once
#include "../msgpack.hpp"
#include <tuple>
#include <type_traits>

// Base template for function traits
template <typename Func> struct func_traits;

// Common implementation for all function types
template <typename R, typename... Vs> struct func_traits_base {
    using Args = std::tuple<typename std::decay<Vs>::type...>;
    Args args;
    R ret;
    MSGPACK_FIELDS(args, ret);

    template <typename Func, typename Tuple> static R apply(Func&& f, Tuple&& t)
    {
        return std::apply([&f](auto&&... args) { return f(std::forward<Vs>(std::forward<decltype(args)>(args))...); },
                          std::forward<Tuple>(t));
    }
};

// Specializations inherit from common base
template <typename R, typename... Vs> struct func_traits<R (*)(Vs...)> : func_traits_base<R, Vs...> {};

template <typename R, typename... Vs> struct func_traits<R (&)(Vs...)> : func_traits_base<R, Vs...> {};

template <typename R, typename T, typename... Vs>
struct func_traits<R (T::*)(Vs...) const> : func_traits_base<R, Vs...> {};

// Simplified trait getter
template <typename T> constexpr auto get_func_traits()
{
    if constexpr (requires { &T::operator(); }) {
        return func_traits<decltype(&T::operator())> {};
    } else {
        return func_traits<T>{};
    }
}
