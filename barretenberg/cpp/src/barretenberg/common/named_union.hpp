#pragma once
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <concepts>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <type_traits>
#include <variant>

namespace bb {

/**
 * @brief Concept to check if a type has a static NAME member
 */
template <typename T>
concept HasName = requires {
    {
        T::NAME
    } -> std::convertible_to<std::string_view>;
};

/**
 * @brief A wrapper around std::variant that provides msgpack serialization based on type names
 *
 * Each type in the variant must have a static constexpr NAME member that identifies it.
 * During serialization, the NAME is written first, then the object.
 * During deserialization, the NAME is read first to determine which type to construct.
 */
template <HasName... Types> class NamedUnion {
  public:
    using VariantType = std::variant<Types...>;

  private:
    VariantType value_;

    // Helper to get index from type name
    template <size_t I = 0> static std::optional<size_t> get_index_from_name(std::string_view name)
    {
        if constexpr (I < sizeof...(Types)) {
            using CurrentType = std::variant_alternative_t<I, VariantType>;
            if (name == CurrentType::NAME) {
                return I;
            }
            return get_index_from_name<I + 1>(name);
        }
        return std::nullopt;
    }

    // Helper to construct variant by index
    template <size_t I = 0> static VariantType construct_by_index(size_t index, auto& o)
    {
        if constexpr (I < sizeof...(Types)) {
            if (I == index) {
                using CurrentType = std::variant_alternative_t<I, VariantType>;
                CurrentType obj;
                o.convert(obj);
                return obj;
            }
            return construct_by_index<I + 1>(index, o);
        }
        throw_or_abort("Invalid variant index");
    }

  public:
    NamedUnion() = default;

    template <typename T>
        requires(std::is_constructible_v<VariantType, T>)
    // NOLINTNEXTLINE(bugprone-forwarding-reference-overload)
    NamedUnion(T&& t)
        : value_(std::forward<T>(t))
    {}

    // Conversion operator to get the underlying variant
    operator VariantType&() { return value_; }
    operator const VariantType&() const { return value_; }

    // Access the underlying variant
    VariantType& get() { return value_; }
    const VariantType& get() const { return value_; }

    // Visit the variant
    template <typename Visitor> decltype(auto) visit(Visitor&& vis) &&
    {
        return std::visit(std::forward<Visitor>(vis), std::move(value_));
    }

    template <typename Visitor> decltype(auto) visit(Visitor&& vis) const&
    {
        return std::visit(std::forward<Visitor>(vis), value_);
    }

    // Get the current type name
    std::string_view get_type_name() const
    {
        return std::visit([](const auto& obj) -> std::string_view { return std::decay_t<decltype(obj)>::NAME; },
                          value_);
    }

    // Msgpack serialization
    void msgpack_pack(auto& packer) const
    {
        packer.pack_array(2);
        // First pack the type name
        std::string_view type_name = get_type_name();
        packer.pack(type_name);

        // Then pack the actual object
        std::visit([&packer](const auto& obj) { packer.pack(obj); }, value_);
    }

    // Msgpack deserialization
    void msgpack_unpack(auto o)
    {
        // access object assuming it is an array of size 2
        if (!o.is_array() || o.via.array.size != 2) {
            throw_or_abort("Expected an array of size 2 for NamedUnion deserialization");
        }
        auto& arr = o.via.array;
        if (!arr.ptr[0].is_string()) {
            throw_or_abort("Expected first element to be a string (type name) in NamedUnion deserialization");
        }
        std::string_view type_name = arr.ptr[0].template as<std::string_view>();
        auto index_opt = get_index_from_name(type_name);
        if (!index_opt.has_value()) {
            throw_or_abort("Unknown type name in NamedUnion deserialization: " + std::string(type_name));
        }
        size_t index = index_opt.value();
        // Now construct the variant using the index
        value_ = construct_by_index(index, arr.ptr[1]);
    }

    // Msgpack schema
    void msgpack_schema(auto& packer) const
    {
        packer.pack_array(2);
        packer.pack("named_union");
        packer.pack_array(sizeof...(Types));
        (
            [&packer, this]() {
                packer.pack_array(2);
                packer.pack(Types::NAME);
                // Abitrary mutable object.
                packer.pack_schema(*std::make_unique<Types>());
            }(),
            ...); /* pack schemas of all template Args */
    }
};

// Deduction guide
template <typename... Types> NamedUnion(std::variant<Types...>) -> NamedUnion<Types...>;

} // namespace bb
