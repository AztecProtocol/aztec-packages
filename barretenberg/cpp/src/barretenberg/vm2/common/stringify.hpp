#pragma once

#include <concepts>
#include <cstdint>
#include <sstream>
#include <string>
#include <tuple>

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2 {

std::string field_to_string(const FF& ff);

template <typename T>
    requires(std::unsigned_integral<T>)
std::string to_hex(T value)
{
    std::ostringstream stream;
    auto num_bytes = static_cast<uint64_t>(sizeof(T));
    auto mask = static_cast<uint64_t>((static_cast<uint128_t>(1) << (num_bytes * 8)) - 1);
    auto padding = static_cast<int>(num_bytes * 2);
    stream << std::setfill('0') << std::setw(padding) << std::hex << (value & mask);
    return stream.str();
}

template <size_t N> std::string to_string(const std::array<FF, N>& arr)
{
    std::ostringstream stream;
    stream << "(";
    for (size_t i = 0; i < N; ++i) {
        stream << field_to_string(arr[i]);
        if (i < N - 1) {
            stream << ", ";
        }
    }
    stream << ")";
    return stream.str();
}

} // namespace bb::avm2
