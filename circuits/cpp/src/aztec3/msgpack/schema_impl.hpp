#pragma once

#include "barretenberg/common/msgpack/concepts.hpp"
#include "barretenberg/common/msgpack_impl.hpp"
#include "barretenberg/plonk/proof_system/verification_key/verification_key.hpp"
#include "barretenberg/stdlib/primitives/address/address.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <memory>
#include <concepts>
#include <string>
#include <array>
#define MSGPACK_NO_BOOST
#include "aztec3/msgpack/check_memory_span.hpp"
#include "schema_name.hpp"

namespace msgpack {

/**
 * Define a serialization schema based on compile-time information about a type being serialized.
 * This is then consumed by typescript to make bindings.
 */
struct SchemaPacker : packer<msgpack::sbuffer> {
    SchemaPacker(msgpack::sbuffer& stream)
        : packer<msgpack::sbuffer>(stream)
    {}
    // For tracking emitted types
    std::set<std::string> emitted_types;
    // Returns if already was emitted
    bool set_emitted(const std::string& type)
    {
        if (emitted_types.find(type) == emitted_types.end()) {
            emitted_types.insert(type);
            return false;
        }
        return true;
    }
};

// Helper for packing (key, value, key, value, ...) arguments
inline void _schema_pack_map_content(SchemaPacker&)
{
    // base case
}
// Helper for packing (key, value, key, value, ...) arguments
template <typename Value, typename... Rest>
inline void _schema_pack_map_content(SchemaPacker& packer, std::string key, Value value, Rest... rest)
{
    packer.pack(key);
    schema_pack(packer, value);
    _schema_pack_map_content(packer, rest...);
}

/**
 * Schema pack base case for types with no special msgpack method.
 * @tparam T the type.
 * @param packer the schema packer.
 */
template <typename T>
    requires(!HasMsgPack<T> && !HasMsgPackPack<T>)
inline void schema_pack(SchemaPacker& packer, T const&)
{
    packer.pack(schema_name(T{}));
}

/**
 * Pack a type indicating it is an alias of a certain msgpack type
 * @param packer The packer.
 * @param schema_name The CPP type.
 * @param msgpack_name The msgpack type.
 */
inline void _schema_pack_alias(SchemaPacker& packer, const std::string& schema_name, const std::string& msgpack_name)
{
    packer.pack_array(2);
    packer.pack("alias");
    packer.pack_array(2);
    packer.pack(schema_name);
    packer.pack(msgpack_name);
}

// Object aliases
inline void schema_pack(SchemaPacker& packer, barretenberg::fr const&)
{
    _schema_pack_alias(packer, "Fr", "bin32");
}
inline void schema_pack(SchemaPacker& packer, proof_system::plonk::proof const&)
{
    _schema_pack_alias(packer, "Proof", "bin32");
}
inline void schema_pack(SchemaPacker& packer, barretenberg::fq const&)
{
    _schema_pack_alias(packer, "Fq", "bin32");
}
inline void schema_pack(SchemaPacker& packer, proof_system::plonk::stdlib::address const&)
{
    _schema_pack_alias(packer, "Address", "bin32");
}

/**
 * @brief Encode a type that defines msgpack based on its key value pairs.
 *
 * @tparam T the msgpack()'able type
 * @param packer Our special packer.
 * @param object The object in question.
 */
template <HasMsgPack T> inline void schema_pack(SchemaPacker& packer, T const& object)
{
    std::string type = schema_name(object);
    if (packer.set_emitted(type)) {
        packer.pack(type);
        return; // already emitted
    }
    msgpack::check_msgpack_usage(object);
    // Encode as map
    const_cast<T&>(object).msgpack([&](auto&... args) {
        size_t kv_size = sizeof...(args);
        packer.pack_map(uint32_t(1 + kv_size / 2));
        packer.pack("__typename");
        packer.pack(type);
        _schema_pack_map_content(packer, args...);
    });
}

// Alias verification_key as verification_key_data
inline void schema_pack(SchemaPacker& packer, proof_system::plonk::verification_key const&)
{
    schema_pack(packer, proof_system::plonk::verification_key_data{});
}

// Recurse over any templated containers
// Outputs e.g. ['vector', ['sub-type']]
template <typename... Args> inline void _schema_pack(SchemaPacker& packer, const std::string& schema_name)
{
    packer.pack_array(2);
    packer.pack(schema_name);
    packer.pack_array(sizeof...(Args));
    (schema_pack(packer, Args{}), ...); /* pack schemas of all template Args */
}
template <typename... Args> inline void schema_pack(SchemaPacker& packer, std::tuple<Args...> const&)
{
    _schema_pack<Args...>(packer, "tuple");
}
template <typename K, typename V> inline void schema_pack(SchemaPacker& packer, std::map<K, V> const&)
{
    _schema_pack<K, V>(packer, "map");
}
template <typename T> inline void schema_pack(SchemaPacker& packer, std::optional<T> const&)
{
    _schema_pack<T>(packer, "optional");
}
template <typename T> inline void schema_pack(SchemaPacker& packer, std::vector<T> const&)
{
    _schema_pack<T>(packer, "vector");
}
template <typename... Args> inline void schema_pack(SchemaPacker& packer, std::variant<Args...> const&)
{
    _schema_pack<Args...>(packer, "variant");
}
template <typename T> inline void schema_pack(SchemaPacker& packer, std::shared_ptr<T> const&)
{
    _schema_pack<T>(packer, "shared_ptr");
}

// Outputs e.g. ['array', ['array-type', 'N']]
template <typename T, std::size_t N> inline void schema_pack(SchemaPacker& packer, std::array<T, N> const&)
{
    packer.pack_array(2);
    packer.pack("array");
    packer.pack_array(2); /* param list format for consistency*/
    schema_pack(packer, T{});
    packer.pack(N);
}

/**
 * @brief Print's an object's derived msgpack schema as a string.
 *
 * @param obj The object to print schema of.
 * @return std::string The schema as a string.
 */
std::string schema_to_string(auto obj)
{
    msgpack::sbuffer output;
    SchemaPacker printer{ output };
    schema_pack(printer, obj);
    msgpack::object_handle oh = msgpack::unpack(output.data(), output.size());
    std::stringstream pretty_output;
    pretty_output << oh.get() << std::endl;
    return pretty_output.str();
}

} // namespace msgpack
