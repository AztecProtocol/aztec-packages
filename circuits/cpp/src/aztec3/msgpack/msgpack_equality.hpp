#pragma once

#include <utility>
#include <tuple>
#include <barretenberg/msgpack/msgpack_concepts.hpp>

namespace msgpack {
template <typename Tuple, std::size_t... Is> auto drop_keys_impl(Tuple&& tuple, std::index_sequence<Is...>)
{
    // Expand 0 to n/2 to 1 to n+1 (increments of 2)
    // Use it to filter the tuple
    return std::tie(std::get<Is * 2 + 1>(std::forward<Tuple>(tuple))...);
}

template <typename... Args> auto drop_keys(std::tuple<Args...>&& tuple)
{
    static_assert(sizeof...(Args) % 2 == 0, "Tuple must contain an even number of elements");
    // Compile time sequence of integers from 0 to n/2
    auto compile_time_0_to_n_div_2 = std::make_index_sequence<sizeof...(Args) / 2>{};
    return drop_keys_impl(tuple, compile_time_0_to_n_div_2);
}
} // namespace msgpack

template <msgpack::HasMsgPack T> bool operator==(const T& t1, const T& t2)
{
    bool are_equal = false;
    const_cast<T&>(t1).msgpack([&](auto&... args1) {
        const_cast<T&>(t2).msgpack(
            [&](auto&... args2) { are_equal = drop_keys(std::tie(args1...)) == drop_keys(std::tie(args2...)); });
    });
    return are_equal;
}
template <msgpack::HasMsgPackFlat T> bool operator==(const T& t1, const T& t2)
{
    bool are_equal = false;
    const_cast<T&>(t1).msgpack_flat([&](auto&... args1) {
        const_cast<T&>(t2).msgpack_flat([&](auto&... args2) { are_equal = std::tie(args1...) == std::tie(args2...); });
    });
    return are_equal;
}