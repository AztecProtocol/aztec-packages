#pragma once

#include <cstdint>
#include <string>
#include <tuple>
#include <vector>

namespace bb::utils {

/**
 * @brief Routine to transform hexstring to vector of bytes.
 *
 * @param Hexadecimal string representation.
 * @return Vector of uint8_t values.
 */
std::vector<uint8_t> hex_to_bytes(const std::string& hex);

/**
 * Hashes a tuple of hasheable types.
 * Intended to be used with C++ maps/sets, not for cryptographic purposes.
 */
template <typename... Ts> size_t hash_as_tuple(const Ts&... ts)
{
    // See https://stackoverflow.com/questions/7110301/generic-hash-for-tuples-in-unordered-map-unordered-set.
    size_t seed = 0;
    ((seed ^= std::hash<Ts>()(ts) + 0x9e3779b9 + (seed << 6) + (seed >> 2)), ...);
    return seed;
}

// Like std::tuple, but you can hash it and therefore use in maps/sets.
template <typename... Ts> struct HashableTuple : public std::tuple<Ts...> {
    using std::tuple<Ts...>::tuple;
    std::size_t hash() const noexcept { return std::apply(utils::hash_as_tuple<Ts...>, *this); }
};

} // namespace bb::utils

// Needed for HashableTuple to work as a tuple.
template <typename... Ts> struct std::tuple_size<bb::utils::HashableTuple<Ts...>> {
    static constexpr size_t value = sizeof...(Ts);
};

// Define std::hash for any type that has a hash() method. This includes HashableTuple.
template <typename T>
concept Hashable = requires(const T& t) {
    {
        t.hash()
    } -> std::same_as<std::size_t>;
};

template <Hashable T> struct std::hash<T> {
    std::size_t operator()(const T& t) const noexcept { return t.hash(); }
};
