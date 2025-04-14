#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <variant>

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/uint1.hpp"

namespace bb::avm2 {

enum class ValueTag {
    FF,
    U1,
    U8,
    U16,
    U32,
    U64,
    U128,
    MAX = U128,
};

class TaggedValue {
  public:
    // We are using variant to avoid heap allocations at the cost of a bigger memory footprint.
    // Do not use this type outside of this class, except for the visitors.
    // TODO: Add Uint1.
    using value_type = std::variant<uint8_t, uint1_t, uint16_t, uint32_t, uint64_t, uint128_t, FF>;

    // Default constructor. Useful for events. Note that this will not be an FF.
    TaggedValue() = default;

    // Using this constructor you can specify the type explicitly via the template.
    template <typename T> static TaggedValue from(T value) { return TaggedValue(value); }
    // Constructs from a tag and value. Throws if the value is out of bounds for the tag.
    static TaggedValue from_tag(ValueTag tag, FF value);

    // Arithmetic operators.
    TaggedValue operator+(const TaggedValue& other) const;
    TaggedValue operator-(const TaggedValue& other) const;
    TaggedValue operator*(const TaggedValue& other) const;
    TaggedValue operator/(const TaggedValue& other) const;
    // Bitwise operations not valid for FF.
    TaggedValue operator&(const TaggedValue& other) const;
    TaggedValue operator|(const TaggedValue& other) const;
    TaggedValue operator^(const TaggedValue& other) const;
    TaggedValue operator<<(const TaggedValue& other) const;
    TaggedValue operator>>(const TaggedValue& other) const;
    TaggedValue operator~() const;

    bool operator==(const TaggedValue& other) const = default;
    bool operator!=(const TaggedValue& other) const = default;

    // Converts any type to FF.
    FF as_ff() const;
    operator FF() const { return as_ff(); }
    ValueTag get_tag() const;
    std::string to_string() const;

    // Use sparingly. The held type must match.
    template <typename T> T as() const
    {
        if (std::holds_alternative<T>(value)) {
            return std::get<T>(value);
        }
        throw std::runtime_error("TaggedValue::as(): type mismatch");
    }

    std::size_t hash() const noexcept { return std::hash<FF>{}(as_ff()); }

  private:
    TaggedValue(value_type value);
    value_type value;
};

} // namespace bb::avm2

namespace std {

std::string to_string(bb::avm2::ValueTag tag);
std::string to_string(const bb::avm2::TaggedValue& val);

} // namespace std
