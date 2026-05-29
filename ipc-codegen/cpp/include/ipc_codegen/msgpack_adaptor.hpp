#pragma once
//
// Struct-map msgpack adaptor: pack/unpack types that declare their fields via
// the SERIALIZATION_FIELDS macro into a JSON-like map. The single source of
// truth for this adaptor across the codebase — used by codegen-emitted IPC
// clients/servers AND by barretenberg's serialization layer.
//
// Why one location: both ipc-codegen output and bb's own msgpack-able types
// rely on `template <HasMsgPack T> msgpack::adaptor::convert<T> / pack<T>`.
// Defining the same specialisation in two places puts both in a TU at once
// and triggers "ambiguous partial specialisation". Keeping the canonical
// version here means every consumer agrees.
//
// Only depends on msgpack-c. Standalone-buildable.
//
// bb's patched msgpack-c uses THROW; ipc_codegen/throw.hpp defines it
// (guarded so a parent project's predefinition wins).
#include "ipc_codegen/throw.hpp"

#include <cassert>
#include <msgpack.hpp>
#include <tuple>
#include <type_traits>

namespace msgpack_concepts {

struct DoNothing {
  void operator()(auto...) {}
};

template <typename T>
concept HasMsgPack = requires(T t, DoNothing nop) { t.msgpack(nop); };

template <typename T, typename... Args>
concept MsgpackConstructible = requires(T object, Args... args) { T{args...}; };

} // namespace msgpack_concepts

namespace msgpack {

// SERIALIZATION_FIELDS' msgpack() callback receives args interleaved as
// (key0, val0, key1, val1, …). drop_keys strips the keys so we can check
// that the type is constructible from the values.
template <typename Tuple, std::size_t... Is>
auto drop_keys_impl(Tuple &&tuple, std::index_sequence<Is...>) {
  return std::tie(std::get<Is * 2 + 1>(std::forward<Tuple>(tuple))...);
}

template <typename... Args> auto drop_keys(std::tuple<Args...> &&tuple) {
  static_assert(sizeof...(Args) % 2 == 0,
                "Tuple must contain an even number of elements");
  return drop_keys_impl(tuple, std::make_index_sequence<sizeof...(Args) / 2>{});
}

} // namespace msgpack

namespace msgpack::adaptor {

// reads structs with msgpack() method from a JSON-like dictionary
template <msgpack_concepts::HasMsgPack T> struct convert<T> {
  msgpack::object const &operator()(msgpack::object const &o, T &v) const {
    static_assert(std::is_default_constructible_v<T>,
                  "SERIALIZATION_FIELDS requires default-constructible types "
                  "(used during unpacking)");
    v.msgpack([&](auto &...args) {
      auto static_checker = [&](auto &...value_args) {
        static_assert(
            msgpack_concepts::MsgpackConstructible<T, decltype(value_args)...>,
            "SERIALIZATION_FIELDS requires a constructor that can take the "
            "types listed in "
            "SERIALIZATION_FIELDS. "
            "Type or arg count mismatch, or member initializer constructor not "
            "available.");
      };
      // Call static checker to ensure we have a constructor that takes all
      // fields - unless we opt-out.
      if constexpr (!requires { typename T::MSGPACK_NO_STATIC_CHECK; }) {
        std::apply(static_checker, drop_keys(std::tie(args...)));
      }
      msgpack::type::define_map<decltype(args)...>{args...}.msgpack_unpack(o);
    });
    return o;
  }
};

// converts structs with msgpack() method to a JSON-like dictionary
template <msgpack_concepts::HasMsgPack T> struct pack<T> {
  template <typename Stream>
  packer<Stream> &operator()(msgpack::packer<Stream> &o, T const &v) const {
    static_assert(std::is_default_constructible_v<T>,
                  "SERIALIZATION_FIELDS requires default-constructible types "
                  "(used during unpacking)");
    const_cast<T &>(v).msgpack([&](auto &...args) {
      auto static_checker = [&](auto &...value_args) {
        static_assert(
            msgpack_concepts::MsgpackConstructible<T, decltype(value_args)...>,
            "T requires a constructor that can take the fields listed in "
            "SERIALIZATION_FIELDS (T will be "
            "in template parameters in the compiler stack trace)"
            "Check the SERIALIZATION_FIELDS macro usage in T for "
            "incompleteness or wrong order. "
            "Alternatively, a matching member initializer constructor might "
            "not be available for T "
            "and should be defined.");
      };
      if constexpr (!requires { typename T::MSGPACK_NO_STATIC_CHECK; }) {
        std::apply(static_checker, drop_keys(std::tie(args...)));
      }
      msgpack::type::define_map<decltype(args)...>{args...}.msgpack_pack(o);
    });
    return o;
  }
};

} // namespace msgpack::adaptor
