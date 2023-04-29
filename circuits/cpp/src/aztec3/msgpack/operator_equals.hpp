#pragma once

#include <utility>
#include <tuple>
#include <barretenberg/common/msgpack.hpp>

namespace msgpack {
template <msgpack::HasMsgPack T> bool operator==(const T& t1, const T& t2)
{
    bool are_equal = false;
    const_cast<T&>(t1).msgpack([&](auto&... args1) {
        const_cast<T&>(t2).msgpack(
            [&](auto&... args2) { are_equal = drop_keys(std::tie(args1...)) == drop_keys(std::tie(args2...)); });
    });
    return are_equal;
}
} // namespace msgpack