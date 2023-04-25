#pragma once

#include "barretenberg/common/msgpack/concepts.hpp"
#include "barretenberg/common/msgpack_impl.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <memory>
#include <string>
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
        if (emitted_types.find(type) != emitted_types.end()) {
            return false;
        }
        return true;
    }
};

// template <typename... Args>
// inline SchemaPacker& operator<< (SchemaPacker& packer, SchemaContainer<Args...> const& container) {
//     packer << std::make_tuple(SchemaKey {container.type_name}, Args{}...);
//     return packer;
// }

// Helper for packing (key, value, key, value, ...) arguments
inline void _schema_pack_map_content(SchemaPacker&)
{
    // base case
}
template <typename Value, typename... Rest>
inline void _schema_pack_map_content(SchemaPacker& packer, std::string key, Value value, Rest... rest)
{
    packer.pack(key);
    schema_pack(packer, value);
    _schema_pack_map_content(packer, rest...);
}

/**
 * @brief Encode a type that defines msgpack.
 *
 * @tparam T the msgpack()'able type
 * @param packer Our special packer.
 * @param object The object in question.
 */
template <HasMsgPack T> inline void schema_pack(SchemaPacker& packer, T const& object)
{
    std::string type = schema_name<T>();
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

// template <HasMsgPackPack T>
// inline void operator<< (SchemaPacker& packer, T const& object) {
//     std::string type = schema_name<T>();
//     if (packer.set_emitted(type)) {
//         packer << SchemaKey {type};
//         return; // already emitted
//     }
//     packer.pack_array(3);
//     packer << SchemaKey {"type"};
//     packer << SchemaKey {type};
//     // Get the amount of keys and values
//     const_cast<T&>(object).msgpack([&](auto&... args) {
//         packer << std::make_tuple(args...);
//     });
// }

template <typename T>
    requires(!HasMsgPack<T>)
inline void schema_pack(SchemaPacker& packer, T const&)
{
    packer.pack(schema_name<T>());
}

// Recurse over any templated containers
// Packs as e.g. ["map", [
#define SCHEMA_CONTAINER(cpp_name, schema_name)                                                                        \
    template <typename... Args> inline void schema_pack(SchemaPacker& packer, cpp_name<Args...> const&)                \
    {                                                                                                                  \
        packer.pack_array(2);                                                                                          \
        packer.pack(schema_name);                                                                                      \
        packer.pack_array(sizeof...(Args));                                                                            \
        (schema_pack(packer, Args{}), ...); /* pack schemas of all template Args */                                    \
    }

SCHEMA_CONTAINER(std::tuple, "tuple");
SCHEMA_CONTAINER(std::map, "map");
SCHEMA_CONTAINER(std::optional, "optional");
SCHEMA_CONTAINER(std::vector, "vector");
SCHEMA_CONTAINER(std::variant, "variant");
SCHEMA_CONTAINER(std::shared_ptr, "shared_ptr");

// /**
//  * Creates a serialization schema based on compile-time information about a type being serialized.
//  * This is then consumed by typescript to make bindings.
//  * @tparam Stream the underlying stream to write to
//  */
// template <typename Stream> struct SchemaPrinter : msgpack::packer<Stream> {
//     std::set<std::string> emitted_types;
//     SchemaPrinter(Stream* stream)
//         : msgpack::packer<Stream>(stream)
//     {}
//     template <typename... T> void pack(std::tuple<T...>& args)
//     {
//         this->pack_array(sizeof...(T) + 1);
//         msgpack::packer<Stream>::pack("tuple");
//         std::apply([&](auto&... args) { (pack(args), ...); }, args);
//     }
//     template <typename T> void pack(std::vector<T>& args)
//     {
//         (void)args; // unused, just schema
//         this->pack_array(2);
//         msgpack::packer<Stream>::pack("vector");
//         pack(T{});
//     }

//     template <typename K, typename V> void pack(std::map<K, V>& args)
//     {
//         (void)args; // unused, just schema
//         this->pack_array(3);
//         msgpack::packer<Stream>::pack("map");
//         pack(K{});
//         pack(V{});
//     }
//     template <typename K, std::size_t V> void pack(std::array<K, V>& args)
//     {
//         (void)args; // unused, just schema
//         this->pack_array(3);
//         msgpack::packer<Stream>::pack("array");
//         pack(K{});
//         msgpack::packer<Stream>::pack(V);
//     }
//     template <typename T> void pack(std::optional<T>& args)
//     {
//         (void)args; // unused, just schema
//         this->pack_array(2);
//         msgpack::packer<Stream>::pack("optional");
//         pack(T{});
//     }
//     template <typename... Args> void pack(std::variant<Args...>& args)
//     {
//         (void)args; // unused, just schema
//         this->pack_array(1 + sizeof...(Args));
//         msgpack::packer<Stream>::pack("variant");
//         (pack(Args{}), ...);
//     }

//     // Helper for printing key, value, key, value arguments
//     void _pack_key_values()
//     {
//         // base case
//     }
//     void _pack_key_values(std::string key, auto value, auto... rest)
//     {
//         // Raw print
//         msgpack::packer<Stream>::pack(key);
//         // Schema print
//         pack(value);
//         _pack_key_values(rest...);
//     }
//     // Serialize an object with a msgpack() method into a schema
//     template <HasMsgPack T> void pack(const T& object)
//     {
//         msgpack::check_msgpack_usage(object);
//         std::string type = schema_name<decltype(object)>();
//         if (emitted_types.find(type) != emitted_types.end()) {
//             msgpack::packer<Stream>::pack(type);
//             return; // already emitted
//         }
//         emitted_types.insert(type);
//         size_t keys_and_values = 0;
//         const_cast<T&>(object).msgpack([&](auto&... args) { keys_and_values = sizeof...(args); });
//         this->pack_map(uint32_t(1 + keys_and_values / 2));
//         msgpack::packer<Stream>::pack("__typename");
//         msgpack::packer<Stream>::pack(type);
//         const_cast<T&>(object).msgpack([&](auto&... args) { _pack_key_values(args...); });
//     }
//     template <typename T> void pack(const std::shared_ptr<T>& v)
//     {
//         (void)v; // unused except for schema
//         this->pack_array(2);
//         msgpack::packer<Stream>::pack("shared_ptr");
//         T object;
//         pack(object);
//     }
//     void pack(HasMsgPackPack auto& v)
//     {
//         std::string type = schema_name<decltype(v)>();
//         if (emitted_types.find(type) != emitted_types.end()) {
//             msgpack::packer<Stream>::pack(type);
//             return; // already emitted
//         }
//         emitted_types.insert(type);
//         this->pack_array(3);
//         msgpack::packer<Stream>::pack("struct");
//         msgpack::packer<Stream>::pack(type);
//         v.msgpack_pack(*this);
//     }
//     template <typename T>
//         requires(!HasMsgPack<T>)
//     void pack(const T& v)
//     {
//         (void)v; // unused except for schema
//         msgpack::packer<Stream>::pack(schema_name<T>());
//     }
//     void pack_bin(size_t size) { msgpack::packer<Stream>::pack("bin" + std::to_string(size)); }
//     void pack_bin_body(const char*, size_t) {}
// };
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
