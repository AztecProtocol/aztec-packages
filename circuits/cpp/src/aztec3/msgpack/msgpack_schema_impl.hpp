#pragma once

#define MSGPACK_NO_BOOST
#include <barretenberg/msgpack/msgpack_impl.hpp>
#include "msgpack_schema_name.hpp"

namespace msgpack {
/**
 * Creates a serialization schema based on compile-time information about a type being serialized.
 * This is then consumed by typescript to make bindings.
 * @tparam Stream the underlying stream to write to
 */
template <typename Stream> struct SchemaPrinter : msgpack::packer<Stream> {
    SchemaPrinter(Stream* stream)
        : msgpack::packer<Stream>(stream)
    {}
    template <typename... T> void pack(std::tuple<T...>& args)
    {
        this->pack_array(sizeof...(T) + 1);
        msgpack::packer<Stream>::pack("tuple");
        std::apply([&](auto&... args) { (pack(args), ...); }, args);
    }
    template <typename T> void pack(std::vector<T>& args)
    {
        (void)args; // unused, just schema
        this->pack_array(2);
        msgpack::packer<Stream>::pack("vector");
        pack(T{});
    }

    template <typename K, typename V> void pack(std::map<K, V>& args)
    {
        (void)args; // unused, just schema
        this->pack_array(3);
        msgpack::packer<Stream>::pack("map");
        pack(K{});
        pack(V{});
    }
    template <typename K, std::size_t V> void pack(std::array<K, V>& args)
    {
        (void)args; // unused, just schema
        this->pack_array(3);
        msgpack::packer<Stream>::pack("array");
        pack(K{});
        pack(V);
    }
    template <typename T> void pack(std::optional<T>& args)
    {
        (void)args; // unused, just schema
        this->pack_array(2);
        msgpack::packer<Stream>::pack("optional");
        pack(T{});
    }
    template <typename... Args> void pack(std::variant<Args...>& args)
    {
        (void)args; // unused, just schema
        this->pack_array(1 + sizeof...(Args));
        msgpack::packer<Stream>::pack("variant");
        (pack(Args{}), ...);
    }

    // Helper for printing key, value, key, value arguments
    void _pack_key_values()
    {
        // base case
    }
    void _pack_key_values(std::string key, auto value, auto... rest)
    {
        // Raw print
        msgpack::packer<Stream>::pack(key);
        // Schema print
        pack(value);
        _pack_key_values(rest...);
    }
    // Serialize an object with a msgpack() method into a schema
    void pack(HasMsgPack auto object)
    {
        size_t keys_and_values = 0;
        object.msgpack([&](auto&... args) { keys_and_values = sizeof...(args); });
        this->pack_map(uint32_t(1 + keys_and_values / 2));
        msgpack::packer<Stream>::pack("__typename");
        msgpack::packer<Stream>::pack(schema_name<decltype(object)>());
        object.msgpack([&](auto&... args) { _pack_key_values(args...); });
    }
    // Serialize an object with a msgpack_flat() method into a schema
    void pack(HasMsgPackFlat auto object)
    {
        size_t values = 0;
        object.msgpack_flat([&](auto&... args) { values = sizeof...(args); });
        this->pack_array(uint32_t(1 + values));
        msgpack::packer<Stream>::pack(schema_name<decltype(object)>());
        object.msgpack_flat([&](auto&... args) { (pack(args), ...); });
    }
    template <typename T>
        requires(!HasMsgPackFlat<T> && !HasMsgPack<T>)
    void pack(const T& v)
    {
        (void)v; // unused except for schema
        msgpack::packer<Stream>::pack(schema_name<T>());
    }
};
std::string schema_to_string(auto obj)
{
    std::stringstream output;
    SchemaPrinter<std::stringstream> printer{ &output };
    printer.pack(obj);
    std::string output_str = output.str();
    msgpack::object_handle oh = msgpack::unpack(output_str.data(), output_str.size());
    std::stringstream pretty_output;
    pretty_output << oh.get() << std::endl;
    return pretty_output.str();
}

} // namespace msgpack