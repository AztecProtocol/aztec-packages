#pragma once

#include "barretenberg/msgpack/msgpack_concepts.hpp"
#include <memory>
#include <string>
#define MSGPACK_NO_BOOST
#include <barretenberg/msgpack/msgpack_impl.hpp>
#include "aztec3/msgpack/msgpack_test.hpp"
#include "msgpack_schema_name.hpp"

namespace msgpack {
/**
 * Creates a serialization schema based on compile-time information about a type being serialized.
 * This is then consumed by typescript to make bindings.
 * @tparam Stream the underlying stream to write to
 */
template <typename Stream> struct SchemaPrinter : msgpack::packer<Stream> {
    std::set<std::string> emitted_types;
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
        msgpack::packer<Stream>::pack(V);
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
    template <HasMsgPack T> void pack(const T& object)
    {
        msgpack::check_msgpack_usage(object);
        std::string type = schema_name<decltype(object)>();
        if (emitted_types.find(type) != emitted_types.end()) {
            msgpack::packer<Stream>::pack(type);
            return; // already emitted
        }
        emitted_types.insert(type);
        size_t keys_and_values = 0;
        const_cast<T&>(object).msgpack([&](auto&... args) { keys_and_values = sizeof...(args); });
        this->pack_map(uint32_t(1 + keys_and_values / 2));
        msgpack::packer<Stream>::pack("__typename");
        msgpack::packer<Stream>::pack(type);
        const_cast<T&>(object).msgpack([&](auto&... args) { _pack_key_values(args...); });
    }
    // Serialize an object with a msgpack_flat() method into a schema
    void pack(HasMsgPackFlat auto object)
    {
        msgpack::check_msgpack_usage(object);
        std::string type = schema_name<decltype(object)>();
        if (emitted_types.find(type) != emitted_types.end()) {
            msgpack::packer<Stream>::pack(type);
            return; // already emitted
        }
        emitted_types.insert(type);
        size_t values = 0;
        object.msgpack_flat([&](auto&... args) { values = sizeof...(args); });
        this->pack_array(uint32_t(1 + values));
        msgpack::packer<Stream>::pack(type);
        object.msgpack_flat([&](auto&... args) { (pack(args), ...); });
    }
    template <typename T> void pack(const std::shared_ptr<T>& v)
    {
        (void)v; // unused except for schema
        this->pack_array(2);
        msgpack::packer<Stream>::pack("shared_ptr");
        T object;
        pack(object);
    }
    void pack(HasMsgPackPack auto& v)
    {
        std::string type = schema_name<decltype(v)>();
        if (emitted_types.find(type) != emitted_types.end()) {
            msgpack::packer<Stream>::pack(type);
            return; // already emitted
        }
        emitted_types.insert(type);
        this->pack_array(3);
        msgpack::packer<Stream>::pack("struct");
        msgpack::packer<Stream>::pack(type);
        v.msgpack_pack(*this);
    }
    template <typename T>
        requires(!HasMsgPackFlat<T> && !HasMsgPack<T>)
    void pack(const T& v)
    {
        (void)v; // unused except for schema
        msgpack::packer<Stream>::pack(schema_name<T>());
    }
    void pack_bin(size_t size) { msgpack::packer<Stream>::pack("bin" + std::to_string(size)); }
    void pack_bin_body(const char*, size_t) {}
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
