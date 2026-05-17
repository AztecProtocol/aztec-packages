#pragma once

#include "barretenberg/serialize/msgpack.hpp"

#include <functional>
#include <string>
#include <string_view>
#include <tuple>

namespace msgpack_detail {

inline constexpr std::string camel_case(std::string_view name)
{
    std::string result;
    bool to_upper = false;
    for (char c : name) {
        if (c == '_') {
            to_upper = true;
        } else {
            if (to_upper && c >= 'a' && c <= 'z') {
                result += static_cast<char>(c - 'a' + 'A');
                to_upper = false;
            } else {
                result += c;
                to_upper = false;
            }
        }
    }
    return result;
}

template <typename T> constexpr decltype(auto) unwrap_ref(T& t)
{
    if constexpr (requires { t.get(); }) {
        return t.get();
    } else {
        return t;
    }
}

} // namespace msgpack_detail

#define MSGPACK_CAMEL_CASE_FIELDS(...)                                                                                 \
    void msgpack(auto pack_fn)                                                                                         \
    {                                                                                                                  \
        auto temp_args = std::make_tuple(NVPFG(::msgpack_detail::camel_case, std::ref, __VA_ARGS__));                  \
        std::apply([&](auto&... args) { pack_fn(::msgpack_detail::unwrap_ref(args)...); }, temp_args);                 \
    }
