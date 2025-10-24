#pragma once

#include <concepts>
#include <iostream>
#include <string>
#include <vector>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/common/std_string.hpp"
#include "barretenberg/common/tuple.hpp"

namespace bb::avm2 {

template <typename T>
concept HasOStreamOperator = requires(const T& t, std::ostream& os) {
    { t.operator<<(os) } -> std::same_as<std::ostream&>;
};

template <typename T>
    requires HasOStreamOperator<T>
inline std::ostream& operator<<(std::ostream& os, const T& value)
{
    return value.operator<<(os);
}

template <typename T> inline std::ostream& operator<<(std::ostream& os, const std::vector<T>& value)
{
    os << "[";
    for (const auto& item : value) {
        os << item << ", ";
    }
    os << "]";
    return os;
}

template <typename T, size_t S> inline std::ostream& operator<<(std::ostream& os, const std::array<T, S>& value)
{
    os << "[";
    for (const auto& item : value) {
        os << item << ", ";
    }
    os << "]";
    return os;
}

inline std::ostream& print_members_(std::ostream& os, auto values_tuple, const auto& names_vec)
{
    os << "{";
    constexpr_for<0, std::tuple_size_v<decltype(values_tuple)>, 1>([&]<size_t i>() {
        os << names_vec.at(i) << ": " << std::get<i>(values_tuple);
        if (i < std::tuple_size_v<decltype(values_tuple)> - 1) {
            os << ", ";
        }
        os << "\n";
    });
    os << "}";
    return os;
}

#define VARARGS_TO_STRING(...) #__VA_ARGS__
#define UNPACK_TO_STRING(...) VARARGS_TO_STRING(__VA_ARGS__)

#define DEFINE_PRINT_MEMBERS(...)                                                                                      \
    std::ostream& operator<<(std::ostream& os) const                                                                   \
    {                                                                                                                  \
        static const auto names_vec = detail::split_and_trim(UNPACK_TO_STRING(__VA_ARGS__), ',');                      \
        return print_members_(os, flat_tuple::make_tuple(__VA_ARGS__), names_vec);                                     \
    }

} // namespace bb::avm2
