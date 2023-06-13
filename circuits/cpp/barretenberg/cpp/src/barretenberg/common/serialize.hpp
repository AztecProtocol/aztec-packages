/**
 * This is a non-msgpack flat buffer serialization library.
 * It is currently used alongside msgpack, with hope to eventually move to msgpack.
 * It enables the reading and writing of big-endian formatted integers and various standard library types
 * to and from the following supported types:
 *  - uint8_t*
 *  - std::vector<uint8_t>
 *  - std::ostream / std::istream
 *
 * To support custom types, free functions taking the following form should be defined alongside the custom type:
 *  - template <typename B> inline void read(B& it, my_custom_type& value)
 *  - template <typename B> inline void write(B& it, my_custom_type const& value)
 * They should be implemented in terms of lower level read/write functions.
 * Be aware that if B is a uint8_t*, it will be advanced appropriately during reads and writes.
 *
 * For understanding, given integers do not belong in any namespace, they have been defined inside the serialize
 * namespace. It may sometimes be necessary to specify a `using serialize::read` or `using serialize::write` to
 * find them. This is prefereable to polluting the global namespace which comes with its own issues.
 *
 * Standard library types are defined inside the `std` namespace, so they can be discovered using argument dependent
 * lookup. Placing them inside the serialize namespace was an option, but would mean integers and std types would need
 * to have the serialize namespace specified, but custom types would not. By leveraging ADL we can avoid needing
 * to specify the serialize namespace in almost all cases.
 *
 * A few helpers are defined at global namespace:
 *  - from_buffer<T>
 *  - many_from_buffer<T>
 *  - to_buffer
 */
#pragma once
#include <cassert>
#include <array>
#include "barretenberg/common/net.hpp"
#include <type_traits>
#include <vector>
#include <map>
#include <iostream>
#include "barretenberg/common/log.hpp"
#include <optional>

#ifndef __i386__
__extension__ using uint128_t = unsigned __int128;
#endif

namespace serialize {
// Basic integer read / write, to / from raw buffers.
// Pointers to buffers are advanced by length of type.
inline void read(uint8_t const*& it, uint8_t& value)
{
    value = *it;
    it += 1;
}

inline void write(uint8_t*& it, uint8_t value)
{
    *it = value;
    it += 1;
}

inline void read(uint8_t const*& it, bool& value)
{
    value = *it;
    it += 1;
}

inline void write(uint8_t*& it, bool value)
{
    *it = static_cast<uint8_t>(value);
    it += 1;
}

inline void read(uint8_t const*& it, uint16_t& value)
{
    value = ntohs(*reinterpret_cast<uint16_t const*>(it));
    it += 2;
}

inline void write(uint8_t*& it, uint16_t value)
{
    *reinterpret_cast<uint16_t*>(it) = htons(value);
    it += 2;
}

inline void read(uint8_t const*& it, uint32_t& value)
{
    value = ntohl(*reinterpret_cast<uint32_t const*>(it));
    it += 4;
}

inline void write(uint8_t*& it, uint32_t value)
{
    *reinterpret_cast<uint32_t*>(it) = htonl(value);
    it += 4;
}

inline void read(uint8_t const*& it, uint64_t& value)
{
    value = ntohll(*reinterpret_cast<uint64_t const*>(it));
    it += 8;
}

inline void write(uint8_t*& it, uint64_t value)
{
    *reinterpret_cast<uint64_t*>(it) = htonll(value);
    it += 8;
}

#ifndef __i386__
inline void read(uint8_t const*& it, uint128_t& value)
{
    uint64_t hi, lo;
    read(it, hi);
    read(it, lo);
    value = (static_cast<uint128_t>(hi) << 64) | lo;
}
inline void write(uint8_t*& it, uint128_t value)
{
    uint64_t hi = static_cast<uint64_t>(value >> 64);
    uint64_t lo = static_cast<uint64_t>(value);
    write(it, hi);
    write(it, lo);
}
#endif

// Reading / writing integer types to / from vectors.
template <typename T> inline std::enable_if_t<std::is_integral_v<T>> read(std::vector<uint8_t> const& buf, T& value)
{
    auto ptr = &buf[0];
    read(ptr, value);
}

template <typename T> inline std::enable_if_t<std::is_integral_v<T>> write(std::vector<uint8_t>& buf, T value)
{
    buf.resize(buf.size() + sizeof(T));
    uint8_t* ptr = &*buf.end() - sizeof(T);
    write(ptr, value);
}

// Reading writing integer types to / from streams.
template <typename T> inline std::enable_if_t<std::is_integral_v<T>> read(std::istream& is, T& value)
{
    std::array<uint8_t, sizeof(T)> buf;
    is.read((char*)buf.data(), sizeof(T));
    uint8_t const* ptr = &buf[0];
    read(ptr, value);
}

template <typename T> inline std::enable_if_t<std::is_integral_v<T>> write(std::ostream& os, T value)
{
    std::array<uint8_t, sizeof(T)> buf;
    uint8_t* ptr = &buf[0];
    write(ptr, value);
    os.write((char*)buf.data(), sizeof(T));
}

// DEBUG_CANARY_READ and DEBUG_CANARY_WRITE write strings during debug testing
// so that we can detect serialization misalignment for more complicated types.
// This is in an awkward location as it must see the above functions, and be seen by the below functions.
#ifndef ENABLE_SERIALIZE_CANARY
#define DEBUG_CANARY_WRITE(buf, x)
#define DEBUG_CANARY_READ(it, x)
#else
#define DEBUG_CANARY_WRITE(buf, x) serialize::write(buf, (uint64_t) typeid(x).hash_code())
#define DEBUG_CANARY_READ(it, x)                                                                                       \
    {                                                                                                                  \
        uint64_t hash_code;                                                                                            \
        serialize::read(it, hash_code);                                                                                \
        if (hash_code != (uint64_t) typeid(x).hash_code()) {                                                           \
            throw std::runtime_error(std::string("Could not read magic string for ") + typeid(x).name());              \
        }                                                                                                              \
    }
#endif
} // namespace serialize

namespace std {

// Forwarding functions from std to serialize namespace for integers.
template <typename B, typename T> inline std::enable_if_t<std::is_integral_v<T>> read(B& buf, T& value)
{
    DEBUG_CANARY_READ(buf, value);
    serialize::read(buf, value);
}

template <typename B, typename T> inline std::enable_if_t<std::is_integral_v<T>> write(B& buf, T value)
{
    DEBUG_CANARY_WRITE(buf, value);
    serialize::write(buf, value);
}

// Optimised specialisation for reading arrays of bytes from a raw buffer.
template <size_t N> inline void read(uint8_t const*& it, std::array<uint8_t, N>& value)
{
    DEBUG_CANARY_READ(it, value);
    std::copy(it, it + N, value.data());
    it += N;
}

// Optimised specialisation for writing arrays of bytes to a raw buffer.
template <size_t N> inline void write(uint8_t*& buf, std::array<uint8_t, N> const& value)
{
    DEBUG_CANARY_WRITE(buf, value);
    std::copy(value.begin(), value.end(), buf);
    buf += N;
}

// Optimised specialisation for reading vectors of bytes from a raw buffer.
inline void read(uint8_t const*& it, std::vector<uint8_t>& value)
{
    DEBUG_CANARY_READ(it, value);
    uint32_t size;
    read(it, size);
    value.resize(size);
    std::copy(it, it + size, value.data());
    it += size;
}

// Optimised specialisation for writing vectors of bytes to a raw buffer.
inline void write(uint8_t*& buf, std::vector<uint8_t> const& value)
{
    DEBUG_CANARY_WRITE(buf, value);
    write(buf, static_cast<uint32_t>(value.size()));
    std::copy(value.begin(), value.end(), buf);
    buf += value.size();
}

// Optimised specialisation for reading vectors of bytes from an input stream.
inline void read(std::istream& is, std::vector<uint8_t>& value)
{
    DEBUG_CANARY_READ(is, value);
    uint32_t size;
    read(is, size);
    value.resize(size);
    is.read((char*)value.data(), (std::streamsize)size);
}

// Optimised specialisation for writing vectors of bytes to an output stream.
inline void write(std::ostream& os, std::vector<uint8_t> const& value)
{
    DEBUG_CANARY_WRITE(os, value);
    write(os, static_cast<uint32_t>(value.size()));
    os.write((char*)value.data(), (std::streamsize)value.size());
}

// Optimised specialisation for writing arrays of bytes to a vector.
template <size_t N> inline void write(std::vector<uint8_t>& buf, std::array<uint8_t, N> const& value)
{
    DEBUG_CANARY_WRITE(buf, value);
    buf.resize(buf.size() + N);
    auto ptr = &*buf.end() - N;
    write(ptr, value);
}

// Optimised specialisation for writing arrays of bytes to an output stream.
template <size_t N> inline void write(std::ostream& os, std::array<uint8_t, N> const& value)
{
    DEBUG_CANARY_WRITE(os, value);
    os.write((char*)value.data(), value.size());
}

// Generic read of array of types from supported buffer types.
template <typename B, typename T, size_t N> inline void read(B& it, std::array<T, N>& value)
{
    DEBUG_CANARY_READ(it, value);
    for (size_t i = 0; i < N; ++i) {
        read(it, value[i]);
    }
}

// Generic write of array of types to supported buffer types.
template <typename B, typename T, size_t N> inline void write(B& buf, std::array<T, N> const& value)
{
    DEBUG_CANARY_WRITE(buf, value);
    for (size_t i = 0; i < N; ++i) {
        write(buf, value[i]);
    }
}

// Generic read of vector of types from supported buffer types.
template <typename B, typename T, typename A> inline void read(B& it, std::vector<T, A>& value)
{
    DEBUG_CANARY_READ(it, value);
    uint32_t size;
    read(it, size);
    value.resize(size);
    for (size_t i = 0; i < size; ++i) {
        read(it, value[i]);
    }
}

// Generic write of vector of types to supported buffer types.
template <typename B, typename T, typename A> inline void write(B& buf, std::vector<T, A> const& value)
{
    write(buf, static_cast<uint32_t>(value.size()));
    for (size_t i = 0; i < value.size(); ++i) {
        write(buf, value[i]);
    }
}

// Read string from supported buffer types.
template <typename B> inline void read(B& it, std::string& value)
{
    DEBUG_CANARY_READ(it, value);
    std::vector<uint8_t> buf;
    read(it, buf);
    value = std::string(buf.begin(), buf.end());
}

// Write of strings to supported buffer types.
template <typename B> inline void write(B& buf, std::string const& value)
{
    write(buf, std::vector<uint8_t>(value.begin(), value.end()));
}

// Read std::pair.
template <typename B, typename T, typename U> inline void read(B& it, std::pair<T, U>& value)
{
    DEBUG_CANARY_READ(it, value);
    read(it, value.first);
    read(it, value.second);
}

// Write std::pair.
template <typename B, typename T, typename U> inline void write(B& buf, std::pair<T, U> const& value)
{
    DEBUG_CANARY_WRITE(buf, value);
    write(buf, value.first);
    write(buf, value.second);
}

// Read std::map
template <typename B, typename T, typename U> inline void read(B& it, std::map<T, U>& value)
{
    DEBUG_CANARY_READ(it, value);
    value.clear();
    uint32_t size;
    read(it, size);
    for (size_t i = 0; i < size; ++i) {
        std::pair<T, U> v;
        read(it, v);
        value.emplace(std::move(v));
    }
}

// Write std::map.
template <typename B, typename T, typename U> inline void write(B& buf, std::map<T, U> const& value)
{
    DEBUG_CANARY_WRITE(buf, value);
    write(buf, static_cast<uint32_t>(value.size()));
    for (auto const& kv : value) {
        write(buf, kv);
    }
}

// Read std::optional<T>.
template <typename B, typename T> inline void read(B& it, std::optional<T>& opt_value)
{
    DEBUG_CANARY_READ(it, opt_value);
    bool is_nullopt;
    read(it, is_nullopt);
    if (is_nullopt) {
        opt_value = std::nullopt;
        return;
    }
    T value;
    read(it, value);
    opt_value = T(value);
}

// Write std::optional<T>.
// Note: It takes up a different amount of space, depending on whether it's std::nullopt or populated with an actual
// value.
template <typename B, typename T> inline void write(B& buf, std::optional<T> const& opt_value)
{
    DEBUG_CANARY_WRITE(buf, opt_value);
    if (opt_value) {
        write(buf, false); // is not nullopt
        write(buf, *opt_value);
        return;
    }
    write(buf, true); // is nullopt
}

} // namespace std

// Helper functions that have return values.
template <typename T, typename B> T from_buffer(B const& buffer, size_t offset = 0)
{
    using serialize::read;
    T result;
    auto ptr = (uint8_t const*)&buffer[offset];
    read(ptr, result);
    return result;
}

template <typename T> std::vector<uint8_t> to_buffer(T const& value)
{
    using serialize::write;
    std::vector<uint8_t> buf;
    write(buf, value);
    return buf;
}

template <typename T> uint8_t* to_heap_buffer(T const& value)
{
    using serialize::write;
    std::vector<uint8_t> buf;
    write(buf, value);
    auto* ptr = (uint8_t*)aligned_alloc(64, buf.size());
    std::copy(buf.begin(), buf.end(), ptr);
    return ptr;
}

template <typename T> std::vector<T> many_from_buffer(std::vector<uint8_t> const& buffer)
{
    const size_t num_elements = buffer.size() / sizeof(T);
    std::vector<T> elements;
    for (size_t i = 0; i < num_elements; ++i) {
        elements.push_back(from_buffer<T>(buffer, i * sizeof(T)));
    }
    return elements;
}

// By default, if calling to_buffer on a vector of types, we don't prefix the vector size.
template <bool include_size = false, typename T> std::vector<uint8_t> to_buffer(std::vector<T> const& value)
{
    using serialize::write;
    std::vector<uint8_t> buf;
    if (include_size) {
        write(buf, value);
    } else {
        for (auto e : value) {
            write(buf, e);
        }
    }
    return buf;
}

// Some types to describe fixed size buffers for c_bind arguments.
using in_buf32 = uint8_t const*;
using out_buf32 = uint8_t*;
using in_buf64 = uint8_t const*;
using out_buf64 = uint8_t*;
using in_buf128 = uint8_t const*;
using out_buf128 = uint8_t*;

// Variable length string buffers. Prefixed with length.
using in_str_buf = uint8_t const*;
using out_str_buf = uint8_t**;

// Use these to pass a raw memory pointer.
using in_ptr = void* const*;
using out_ptr = void**;