#pragma once
#include "msgpack_impl.hpp"
#include <string>

/***
 * Do a roundtrip test encode/decode of an object.
 * @tparam T The object type.
 * @param object The object. Can be a default-initialized object.
 */
template <typename T> std::pair<T, T> msgpack_roundtrip(const T& object)
{
    T result;
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, object);
    msgpack::unpack(buffer.data(), buffer.size()).get().convert(result);
    return { object, result };
}
