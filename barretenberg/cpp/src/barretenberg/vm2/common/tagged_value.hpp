#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <variant>

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/uint1.hpp"

namespace bb::avm2 {

enum class ValueTag {
    FF = MEM_TAG_FF,
    U1 = MEM_TAG_U1,
    U8 = MEM_TAG_U8,
    U16 = MEM_TAG_U16,
    U32 = MEM_TAG_U32,
    U64 = MEM_TAG_U64,
    U128 = MEM_TAG_U128,
    MAX = U128,
};

template <typename T> ValueTag tag_for_type()
{
    if constexpr (std::is_same_v<T, FF>) {
        return ValueTag::FF;
    } else if constexpr (std::is_same_v<T, uint1_t>) {
        return ValueTag::U1;
    } else if constexpr (std::is_same_v<T, uint8_t>) {
        return ValueTag::U8;
    } else if constexpr (std::is_same_v<T, uint16_t>) {
        return ValueTag::U16;
    } else if constexpr (std::is_same_v<T, uint32_t>) {
        return ValueTag::U32;
    } else if constexpr (std::is_same_v<T, uint64_t>) {
        return ValueTag::U64;
    } else if constexpr (std::is_same_v<T, uint128_t>) {
        return ValueTag::U128;
    }
}

uint8_t get_tag_bits(ValueTag tag);
uint8_t get_tag_bytes(ValueTag tag);
uint256_t get_tag_max_value(ValueTag tag);

class TaggedValue {
  public:
    // We are using variant to avoid heap allocations at the cost of a bigger memory footprint.
    // Do not use this type outside of this class, except for the visitors.
    // NOTE: Order matters, "a default-constructed variant holds a value of its first alternative".
    // See https://en.cppreference.com/w/cpp/utility/variant.
    using value_type = std::variant<uint8_t, uint1_t, uint16_t, uint32_t, uint64_t, uint128_t, FF>;

    // Default constructor. Useful for events. Note that this will be an U8.
    TaggedValue() = default;

    // Using this constructor you can specify the type explicitly via the template.
    template <typename T> static TaggedValue from(T value) { return TaggedValue(value); }
    // Constructs from a tag and value. Throws if the value is out of bounds for the tag.
    static TaggedValue from_tag(ValueTag tag, FF value);
    // Constructs from a tag and value. Truncates the value if it is out of bounds for the tag.
    // The truncation is equivalent to bit masking. It does not saturate to the max value of the tag.
    static TaggedValue from_tag_truncating(ValueTag tag, FF value);

    // Arithmetic operators.
    TaggedValue operator+(const TaggedValue& other) const;
    TaggedValue operator-(const TaggedValue& other) const;
    TaggedValue operator*(const TaggedValue& other) const;
    TaggedValue operator/(const TaggedValue& other) const;
    // Bitwise operations not valid for FF. They will throw.
    TaggedValue operator&(const TaggedValue& other) const;
    TaggedValue operator|(const TaggedValue& other) const;
    TaggedValue operator^(const TaggedValue& other) const;
    TaggedValue operator~() const;
    // Shift operations not valid for FF. They will throw.
    TaggedValue operator<<(const TaggedValue& other) const;
    TaggedValue operator>>(const TaggedValue& other) const;

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
        throw std::runtime_error("TaggedValue::as(): type mismatch. Wanted type " +
                                 std::to_string(static_cast<uint32_t>(tag_for_type<T>())) + " but got " + to_string());
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
