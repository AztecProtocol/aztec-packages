#pragma once
//
// msgpack adaptor: pack/unpack types that declare their fields via the
// SERIALIZATION_FIELDS macro into a JSON-like map. Bundled with ipc-codegen
// so generated IPC clients/servers don't pull in any framework-specific
// msgpack headers.
//
// Self-contained struct-map msgpack adaptor — only depends on msgpack-c.
//
// In barretenberg context the framework ships its own equivalent under
// barretenberg/serialize/msgpack_impl/struct_map_impl.hpp. Both define
// `template <HasMsgPack T> struct convert<T> / pack<T>` in
// `msgpack::adaptor`, with overlapping constraints, so including both in a
// single TU triggers "ambiguous partial specialization" errors. Consumers
// in that context predefine IPC_CODEGEN_USE_BB_MSGPACK_ADAPTORS so this
// self-contained adaptor opts out and yields to the framework's.

#include <msgpack.hpp>

#ifndef IPC_CODEGEN_USE_BB_MSGPACK_ADAPTORS
#include <cassert>
#include <tuple>
#include <type_traits>

// --- concepts -------------------------------------------------------------

struct IpcCodegenDoNothing {
  void operator()(auto...) {}
};

namespace ipc_codegen::msgpack_concepts {
template <typename T>
concept HasMsgPack = requires(T t, IpcCodegenDoNothing nop) { t.msgpack(nop); };

template <typename T, typename... Args>
concept MsgpackConstructible = requires(T object, Args... args) { T{args...}; };
} // namespace ipc_codegen::msgpack_concepts

// --- drop_keys ------------------------------------------------------------
// SERIALIZATION_FIELDS' msgpack() callback receives args interleaved as
// (key0, val0, key1, val1, …). drop_keys strips the keys so we can check
// that the type is constructible from the values.

namespace ipc_codegen::msgpack_detail {
template <typename Tuple, std::size_t... Is>
auto drop_keys_impl(Tuple &&tuple, std::index_sequence<Is...>) {
  return std::tie(std::get<Is * 2 + 1>(std::forward<Tuple>(tuple))...);
}

template <typename... Args> auto drop_keys(std::tuple<Args...> &&tuple) {
  static_assert(sizeof...(Args) % 2 == 0,
                "Tuple must contain an even number of elements");
  return drop_keys_impl(tuple, std::make_index_sequence<sizeof...(Args) / 2>{});
}
} // namespace ipc_codegen::msgpack_detail

// --- adaptors -------------------------------------------------------------

namespace msgpack::adaptor {

template <ipc_codegen::msgpack_concepts::HasMsgPack T> struct convert<T> {
  msgpack::object const &operator()(msgpack::object const &o, T &v) const {
    static_assert(std::is_default_constructible_v<T>,
                  "SERIALIZATION_FIELDS requires default-constructible types");
    v.msgpack([&](auto &...args) {
      auto static_checker = [&](auto &...value_args) {
        static_assert(ipc_codegen::msgpack_concepts::MsgpackConstructible<
                          T, decltype(value_args)...>,
                      "SERIALIZATION_FIELDS requires a constructor that can "
                      "take the listed field types");
      };
      if constexpr (!requires { typename T::MSGPACK_NO_STATIC_CHECK; }) {
        std::apply(static_checker,
                   ipc_codegen::msgpack_detail::drop_keys(std::tie(args...)));
      }
      msgpack::type::define_map<decltype(args)...>{args...}.msgpack_unpack(o);
    });
    return o;
  }
};

template <ipc_codegen::msgpack_concepts::HasMsgPack T> struct pack<T> {
  template <typename Stream>
  packer<Stream> &operator()(msgpack::packer<Stream> &o, T const &v) const {
    static_assert(std::is_default_constructible_v<T>,
                  "SERIALIZATION_FIELDS requires default-constructible types");
    const_cast<T &>(v).msgpack([&](auto &...args) {
      auto static_checker = [&](auto &...value_args) {
        static_assert(ipc_codegen::msgpack_concepts::MsgpackConstructible<
                          T, decltype(value_args)...>,
                      "SERIALIZATION_FIELDS requires a constructor that can "
                      "take the listed field types");
      };
      if constexpr (!requires { typename T::MSGPACK_NO_STATIC_CHECK; }) {
        std::apply(static_checker,
                   ipc_codegen::msgpack_detail::drop_keys(std::tie(args...)));
      }
      msgpack::type::define_map<decltype(args)...>{args...}.msgpack_pack(o);
    });
    return o;
  }
};

} // namespace msgpack::adaptor
#endif // IPC_CODEGEN_USE_BB_MSGPACK_ADAPTORS
