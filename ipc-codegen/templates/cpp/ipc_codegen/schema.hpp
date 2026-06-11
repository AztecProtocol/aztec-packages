#pragma once
/**
 * @file schema.hpp
 * @brief Compile-time msgpack schema reflection for codegen-emitted types.
 *
 * Walks a type's `msgpack(pack_fn)` method (which SERIALIZATION_FIELDS or the
 * codegen-emitted bundled adaptor provides) and produces a JSON description
 * of its msgpack layout. The output format is consumed by ipc-codegen as the
 * canonical schema source — the binary serialises its own understanding of
 * the wire format and that becomes the input for cross-language codegen.
 *
 * The schema reflection itself is in this file (stdlib + msgpack-c only) so
 * services consuming ipc-codegen output do not need project-specific headers.
 */
#include <array>
#include <cstdint>
#include <cxxabi.h>
#include <map>
#include <memory>
#include <msgpack.hpp>
#include <optional>
#include <set>
#include <sstream>
#include <string>
#include <tuple>
#include <type_traits>
#include <variant>
#include <vector>

namespace ipc {

// ----------------------------------------------------------------------------
// Type names
// ----------------------------------------------------------------------------

template <typename T> std::string schema_name(T const &) {
  if constexpr (requires { T::MSGPACK_SCHEMA_NAME; }) {
    return T::MSGPACK_SCHEMA_NAME;
  } else {
    char *demangled =
        abi::__cxa_demangle(typeid(T).name(), nullptr, nullptr, nullptr);
    std::string result = demangled ? demangled : typeid(T).name();
    if (demangled)
      std::free(demangled); // NOLINT
    // basic_string<...> → "string"
    if (result.find("basic_string") != std::string::npos)
      return "string";
    if (result == "i")
      return "int";
    // Strip template args (Foo<...> → Foo)
    if (auto pos = result.find('<'); pos != std::string::npos)
      result = result.substr(0, pos);
    // Strip namespace prefix (a::b::c → c)
    if (auto pos = result.rfind(':'); pos != std::string::npos)
      result = result.substr(pos + 1);
    return result;
  }
}

// ----------------------------------------------------------------------------
// Concepts
// ----------------------------------------------------------------------------

namespace schema_detail {
struct DoNothing {
  void operator()(auto...) {}
};
template <typename T>
concept HasMsgPack = requires(T t, DoNothing nop) { t.msgpack(nop); };
template <typename T>
concept HasMsgPackSchema =
    requires(const T t, DoNothing nop) { t.msgpack_schema(nop); };
} // namespace schema_detail

// ----------------------------------------------------------------------------
// Schema packer
// ----------------------------------------------------------------------------

struct SchemaPacker;

template <typename T>
inline void schema_pack(SchemaPacker &packer, T const &obj);

struct SchemaPacker : msgpack::packer<msgpack::sbuffer> {
  SchemaPacker(msgpack::sbuffer &stream) : packer<msgpack::sbuffer>(stream) {}

  std::set<std::string> emitted_types;
  bool set_emitted(const std::string &type) {
    if (emitted_types.find(type) == emitted_types.end()) {
      emitted_types.insert(type);
      return false;
    }
    return true;
  }

  template <typename T> void pack_schema(T const &obj) {
    schema_pack(*this, obj);
  }

  template <typename... Args> void pack_template_type(const std::string &name) {
    pack_array(2);
    pack(name);
    pack_array(sizeof...(Args));
    (schema_pack(*this, *std::make_unique<Args>()), ...);
  }

  // ["alias", [<schema_name>, <msgpack_name>]] — preserves the alias name in
  // the emitted schema while pinning the underlying msgpack type.
  void pack_alias(const std::string &schema_name,
                  const std::string &msgpack_name) {
    pack_array(2);
    pack("alias");
    pack_array(2);
    pack(schema_name);
    pack(msgpack_name);
  }

  template <schema_detail::HasMsgPack T>
  void pack_with_name(const std::string &type, T const &object) {
    if (set_emitted(type)) {
      pack(type);
      return;
    }
    const_cast<T &>(object).msgpack([&](auto &...args) {
      size_t kv_size = sizeof...(args);
      pack_map(uint32_t(1 + kv_size / 2));
      pack("__typename");
      pack(type);
      _schema_pack_map_content(*this, args...);
    });
  }
};

inline void _schema_pack_map_content(SchemaPacker &) {}

template <typename Value, typename... Rest>
inline void _schema_pack_map_content(SchemaPacker &packer, std::string key,
                                     const Value &value, const Rest &...rest) {
  packer.pack(key);
  schema_pack(packer, value);
  _schema_pack_map_content(packer, rest...);
}

// Fallback for types with no msgpack method (primitives, etc.)
template <typename T>
  requires(!schema_detail::HasMsgPackSchema<T> && !schema_detail::HasMsgPack<T>)
inline void schema_pack(SchemaPacker &packer, T const &obj) {
  packer.pack(schema_name(obj));
}

// Type with custom msgpack_schema method (e.g. NamedUnion)
template <schema_detail::HasMsgPackSchema T>
inline void schema_pack(SchemaPacker &packer, T const &obj) {
  obj.msgpack_schema(packer);
}

// Type with SERIALIZATION_FIELDS — pack as a map
template <schema_detail::HasMsgPack T>
  requires(!schema_detail::HasMsgPackSchema<T>)
inline void schema_pack(SchemaPacker &packer, T const &object) {
  packer.pack_with_name(schema_name(object), object);
}

// Container overloads
template <typename T>
inline void schema_pack(SchemaPacker &packer, std::vector<T> const &) {
  packer.pack_template_type<T>("vector");
}
template <typename T>
inline void schema_pack(SchemaPacker &packer, std::optional<T> const &) {
  packer.pack_template_type<T>("optional");
}
template <typename... Args>
inline void schema_pack(SchemaPacker &packer, std::tuple<Args...> const &) {
  packer.pack_template_type<Args...>("tuple");
}
template <typename K, typename V>
inline void schema_pack(SchemaPacker &packer, std::map<K, V> const &) {
  packer.pack_template_type<K, V>("map");
}
template <typename... Args>
inline void schema_pack(SchemaPacker &packer, std::variant<Args...> const &) {
  packer.pack_template_type<Args...>("variant");
}
template <typename T, std::size_t N>
inline void schema_pack(SchemaPacker &packer, std::array<T, N> const &) {
  // Exactly 32 bytes is the fixed-byte primitive used by bin32 aliases.
  if constexpr (N == 32 && (std::is_same_v<T, unsigned char> ||
                            std::is_same_v<T, std::uint8_t>)) {
    packer.pack("bin32");
  } else {
    packer.pack_array(2);
    packer.pack("array");
    packer.pack_array(2);
    schema_pack(packer, *std::make_unique<T>());
    packer.pack(N);
  }
}

// ----------------------------------------------------------------------------
// Convenience: serialise an object's schema to a JSON-ish string
// ----------------------------------------------------------------------------

inline std::string msgpack_schema_to_string(auto const &obj) {
  msgpack::sbuffer output;
  SchemaPacker printer{output};
  schema_pack(printer, obj);
  msgpack::object_handle oh = msgpack::unpack(output.data(), output.size());
  std::stringstream pretty;
  pretty << oh.get() << std::endl;
  return pretty.str();
}

} // namespace ipc
