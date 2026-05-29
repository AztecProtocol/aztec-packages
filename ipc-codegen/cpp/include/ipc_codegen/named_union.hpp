#pragma once
/**
 * @file named_union.hpp
 * @brief Tagged-union with msgpack [name, payload] wire format. Single source
 *        of truth used by codegen-emitted dispatchers and schema reflection.
 *
 * Each type in the union must declare:
 *   static constexpr const char MSGPACK_SCHEMA_NAME[] = "...";
 */
#include "ipc_codegen/throw.hpp"

#include <concepts>
#include <msgpack.hpp>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <type_traits>
#include <variant>

namespace ipc {

template <typename T>
concept HasMsgpackSchemaName = requires {
  { T::MSGPACK_SCHEMA_NAME } -> std::convertible_to<std::string_view>;
};

template <HasMsgpackSchemaName... Types> class NamedUnion {
public:
  using VariantType = std::variant<Types...>;

private:
  VariantType value_;

  template <size_t I = 0>
  static std::optional<size_t> get_index_from_name(std::string_view name) {
    if constexpr (I < sizeof...(Types)) {
      using CurrentType = std::variant_alternative_t<I, VariantType>;
      if (name == CurrentType::MSGPACK_SCHEMA_NAME) {
        return I;
      }
      return get_index_from_name<I + 1>(name);
    }
    return std::nullopt;
  }

  template <size_t I = 0>
  static VariantType construct_by_index(size_t index, auto &o) {
    if constexpr (I < sizeof...(Types)) {
      if (I == index) {
        using CurrentType = std::variant_alternative_t<I, VariantType>;
        CurrentType obj;
        o.convert(obj);
        return obj;
      }
      return construct_by_index<I + 1>(index, o);
    }
    THROW std::runtime_error("ipc::NamedUnion: invalid variant index");
  }

public:
  NamedUnion() = default;

  template <typename T>
    requires(std::is_constructible_v<VariantType, T>)
  // NOLINTNEXTLINE(bugprone-forwarding-reference-overload)
  NamedUnion(T &&t) : value_(std::forward<T>(t)) {}

  operator VariantType &() { return value_; }
  operator const VariantType &() const { return value_; }

  VariantType &get() { return value_; }
  const VariantType &get() const { return value_; }

  template <typename Visitor> decltype(auto) visit(Visitor &&vis) && {
    return std::visit(std::forward<Visitor>(vis), std::move(value_));
  }
  template <typename Visitor> decltype(auto) visit(Visitor &&vis) const & {
    return std::visit(std::forward<Visitor>(vis), value_);
  }

  std::string_view get_type_name() const {
    return std::visit(
        [](const auto &obj) -> std::string_view {
          return std::decay_t<decltype(obj)>::MSGPACK_SCHEMA_NAME;
        },
        value_);
  }

  void msgpack_pack(auto &packer) const {
    packer.pack_array(2);
    std::string_view type_name = get_type_name();
    packer.pack(type_name);
    std::visit([&packer](const auto &obj) { packer.pack(obj); }, value_);
  }

  void msgpack_unpack(msgpack::object const &o) {
    if (o.type != msgpack::type::ARRAY || o.via.array.size != 2) {
      THROW std::runtime_error("ipc::NamedUnion: expected array of size 2");
    }
    const auto &arr = o.via.array;
    if (arr.ptr[0].type != msgpack::type::STR) {
      THROW std::runtime_error(
          "ipc::NamedUnion: expected first element to be a string (type name)");
    }
    std::string_view type_name =
        std::string_view(arr.ptr[0].via.str.ptr, arr.ptr[0].via.str.size);
    auto index_opt = get_index_from_name(type_name);
    if (!index_opt.has_value()) {
      THROW std::runtime_error("ipc::NamedUnion: unknown type name " +
                               std::string(type_name));
    }
    value_ = construct_by_index(*index_opt, arr.ptr[1]);
  }

  // Schema reflection — emits ["named_union", [[name, schema], ...]] via
  // the schema packer (see reflect.hpp).
  void msgpack_schema(auto &packer) const {
    packer.pack_array(2);
    packer.pack("named_union");
    packer.pack_array(sizeof...(Types));
    (
        [&packer]() {
          packer.pack_array(2);
          packer.pack(Types::MSGPACK_SCHEMA_NAME);
          packer.pack_schema(*std::make_unique<Types>());
        }(),
        ...);
  }
};

} // namespace ipc
