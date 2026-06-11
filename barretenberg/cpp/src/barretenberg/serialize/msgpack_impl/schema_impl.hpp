#pragma once

#include "barretenberg/serialize/msgpack.hpp"
#include "check_memory_span.hpp"
#include "concepts.hpp"
#include "schema_name.hpp"

#include <array>
#include <concepts>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <sstream>
#include <string>
#include <tuple>
#include <variant>
#include <vector>

struct MsgpackSchemaPacker;

template <typename T> inline void _msgpack_schema_pack(MsgpackSchemaPacker& packer, const T& obj);

struct MsgpackSchemaPacker : msgpack::packer<msgpack::sbuffer> {
    MsgpackSchemaPacker(msgpack::sbuffer& stream)
        : packer<msgpack::sbuffer>(stream)
    {}

    std::set<std::string> emitted_types;

    bool set_emitted(const std::string& type)
    {
        if (emitted_types.find(type) == emitted_types.end()) {
            emitted_types.insert(type);
            return false;
        }
        return true;
    }

    void pack_alias(const std::string& schema_name, const std::string& msgpack_name)
    {
        pack_array(2);
        pack("alias");
        pack_array(2);
        pack(schema_name);
        pack(msgpack_name);
    }

    template <typename T> void pack_schema(const T& obj) { _msgpack_schema_pack(*this, obj); }

    template <typename... Args> void pack_template_type(const std::string& schema_name)
    {
        pack_array(2);
        pack(schema_name);
        pack_array(sizeof...(Args));
        (_msgpack_schema_pack(*this, *std::make_unique<Args>()), ...);
    }

    template <msgpack_concepts::HasMsgPack T> void pack_with_name(const std::string& type, T const& object)
    {
        if (set_emitted(type)) {
            pack(type);
            return;
        }
        msgpack::check_msgpack_usage(object);
        const_cast<T&>(object).msgpack([&](auto&... args) {
            size_t kv_size = sizeof...(args);
            pack_map(uint32_t(1 + kv_size / 2));
            pack("__typename");
            pack(type);
            _schema_pack_map_content(*this, args...);
        });
    }
};

inline void _schema_pack_map_content(MsgpackSchemaPacker&) {}

namespace msgpack_concepts {
template <typename T>
concept SchemaPackable = requires(T value, MsgpackSchemaPacker packer) { msgpack_schema_pack(packer, value); };

template <typename T>
concept IpcBin32Alias = requires {
    typename T::IPC_CODEGEN_BIN32_ALIAS;
    T::MSGPACK_SCHEMA_NAME;
};
} // namespace msgpack_concepts

template <typename Value, typename... Rest>
inline void _schema_pack_map_content(MsgpackSchemaPacker& packer,
                                     std::string key,
                                     const Value& value,
                                     const Rest&... rest)
{
    static_assert(
        msgpack_concepts::SchemaPackable<Value>,
        "see the first type argument in the error trace, it might require a specialization of msgpack_schema_pack");
    packer.pack(key);
    msgpack_schema_pack(packer, value);
    _schema_pack_map_content(packer, rest...);
}

template <msgpack_concepts::IpcBin32Alias T> inline void msgpack_schema_pack(MsgpackSchemaPacker& packer, T const&)
{
    packer.pack_alias(T::MSGPACK_SCHEMA_NAME, "bin32");
}

template <typename T>
    requires(!msgpack_concepts::HasMsgPackSchema<T> && !msgpack_concepts::HasMsgPack<T> &&
             !msgpack_concepts::IpcBin32Alias<T>)
inline void msgpack_schema_pack(MsgpackSchemaPacker& packer, T const& obj)
{
    packer.pack(msgpack_schema_name(obj));
}

template <msgpack_concepts::HasMsgPackSchema T>
inline void msgpack_schema_pack(MsgpackSchemaPacker& packer, T const& obj)
{
    obj.msgpack_schema(packer);
}

template <msgpack_concepts::HasMsgPack T>
    requires(!msgpack_concepts::HasMsgPackSchema<T>)
inline void msgpack_schema_pack(MsgpackSchemaPacker& packer, T const& object)
{
    std::string type = msgpack_schema_name(object);
    packer.pack_with_name(type, object);
}

template <typename T> inline void _msgpack_schema_pack(MsgpackSchemaPacker& packer, const T& obj)
{
    static_assert(msgpack_concepts::SchemaPackable<T>,
                  "see the first type argument in the error trace, it might need a msgpack_schema method!");
    msgpack_schema_pack(packer, obj);
}

template <typename... Args> inline void msgpack_schema_pack(MsgpackSchemaPacker& packer, std::tuple<Args...> const&)
{
    packer.pack_template_type<Args...>("tuple");
}

template <typename K, typename V> inline void msgpack_schema_pack(MsgpackSchemaPacker& packer, std::map<K, V> const&)
{
    packer.pack_template_type<K, V>("map");
}

template <typename T> inline void msgpack_schema_pack(MsgpackSchemaPacker& packer, std::optional<T> const&)
{
    packer.pack_template_type<T>("optional");
}

template <typename T> inline void msgpack_schema_pack(MsgpackSchemaPacker& packer, std::vector<T> const&)
{
    packer.pack_template_type<T>("vector");
}

template <typename... Args> inline void msgpack_schema_pack(MsgpackSchemaPacker& packer, std::variant<Args...> const&)
{
    packer.pack_template_type<Args...>("variant");
}

template <typename T> inline void msgpack_schema_pack(MsgpackSchemaPacker& packer, std::shared_ptr<T> const&)
{
    packer.pack_template_type<T>("shared_ptr");
}

template <typename T, std::size_t N>
inline void msgpack_schema_pack(MsgpackSchemaPacker& packer, std::array<T, N> const&)
{
    packer.pack_array(2);
    packer.pack("array");
    packer.pack_array(2);
    _msgpack_schema_pack(packer, *std::make_unique<T>());
    packer.pack(N);
}

inline std::string msgpack_schema_to_string(const auto& obj)
{
    msgpack::sbuffer output;
    MsgpackSchemaPacker printer{ output };
    _msgpack_schema_pack(printer, obj);
    msgpack::object_handle oh = msgpack::unpack(output.data(), output.size());
    std::stringstream pretty_output;
    pretty_output << oh.get() << std::endl;
    return pretty_output.str();
}
