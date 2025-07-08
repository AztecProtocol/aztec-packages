#include "barretenberg/vm2/common/tagged_value.hpp"

#include <cassert>
#include <functional>
#include <stdexcept>
#include <variant>

#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/common/uint1.hpp"

namespace bb::avm2 {

namespace {

// Helper type for ad-hoc visitors. See https://en.cppreference.com/w/cpp/utility/variant/visit2.
template <class... Ts> struct overloads : Ts... {
    using Ts::operator()...;
};
// This is a deduction guide. Apparently not needed in C++20, but we somehow still need it.
template <class... Ts> overloads(Ts...) -> overloads<Ts...>;

struct shift_left {
    template <typename T, typename U> T operator()(const T& a, const U& b) const
    {
        if constexpr (std::is_same_v<T, uint1_t>) {
            return static_cast<T>(a.operator<<(b));
        } else {
            return static_cast<T>(a << b);
        }
    }
};

struct shift_right {
    template <typename T, typename U> T operator()(const T& a, const U& b) const
    {
        if constexpr (std::is_same_v<T, uint1_t>) {
            return static_cast<T>(a.operator>>(b));
        } else {
            return static_cast<T>(a >> b);
        }
    }
};

template <typename Op>
constexpr bool is_bitwise_operation_v =
    std::is_same_v<Op, std::bit_and<>> || std::is_same_v<Op, std::bit_or<>> || std::is_same_v<Op, std::bit_xor<>> ||
    std::is_same_v<Op, std::bit_not<>> || std::is_same_v<Op, shift_left> || std::is_same_v<Op, shift_right>;

// Helper visitor for binary operations. These assume that the types are the same.
template <typename Op> struct BinaryOperationVisitor {
    template <typename T, typename U> TaggedValue::value_type operator()(const T& a, const U& b) const
    {
        if constexpr (std::is_same_v<T, U>) {
            if constexpr (std::is_same_v<T, FF> && is_bitwise_operation_v<Op>) {
                throw std::runtime_error("Bitwise operations not valid for FF");
            } else {
                // Note: IDK why this static_cast is needed, but if you remove it, operations seem to go through FF.
                return static_cast<T>(Op{}(a, b));
            }
        } else {
            throw std::runtime_error("Type mismatch in BinaryOperationVisitor!");
        }
    }
};

// Helper visitor for shift operations. The right hand side is a different type.
template <typename Op> struct ShiftOperationVisitor {
    template <typename T, typename U> TaggedValue::value_type operator()(const T& a, const U& b) const
    {
        if constexpr (std::is_same_v<T, FF> || std::is_same_v<U, FF>) {
            throw std::runtime_error("Bitwise operations not valid for FF");
        } else {
            return static_cast<T>(Op{}(a, b));
        }
    }
};

// Helper visitor for unary operations
template <typename Op> struct UnaryOperationVisitor {
    template <typename T> TaggedValue::value_type operator()(const T& a) const
    {
        if constexpr (std::is_same_v<T, FF> && is_bitwise_operation_v<Op>) {
            throw std::runtime_error("Can't do unary bitwise operations on an FF");
        } else {
            // Note: IDK why this static_cast is needed, but if you remove it, operations seem to go through FF.
            return static_cast<T>(Op{}(a));
        }
    }
};

} // namespace

uint8_t get_tag_bits(ValueTag tag)
{
    switch (tag) {
    case ValueTag::U1:
        return 1;
    case ValueTag::U8:
        return 8;
    case ValueTag::U16:
        return 16;
    case ValueTag::U32:
        return 32;
    case ValueTag::U64:
        return 64;
    case ValueTag::U128:
        return 128;
    case ValueTag::FF:
        // Note: 0 is returned as a placeholder
        return 0;
    }

    assert(false && "Invalid tag");
    return 0;
}

uint8_t get_tag_bytes(ValueTag tag)
{
    switch (tag) {
    case ValueTag::U1:
        return 1;
    case ValueTag::U8:
    case ValueTag::U16:
    case ValueTag::U32:
    case ValueTag::U64:
    case ValueTag::U128:
        return get_tag_bits(tag) / 8;
    case ValueTag::FF:
        return 32;
    }

    assert(false && "Invalid tag");
    return 0;
}

uint256_t get_tag_max_value(ValueTag tag)
{
    switch (tag) {
    case ValueTag::U1:
    case ValueTag::U8:
    case ValueTag::U16:
    case ValueTag::U32:
    case ValueTag::U64:
    case ValueTag::U128:
        return (uint256_t(1) << get_tag_bits(tag)) - 1;
    case ValueTag::FF:
        return FF::modulus - 1;
    }

    assert(false && "Invalid tag");
    return 0;
}

// Constructor
TaggedValue::TaggedValue(TaggedValue::value_type value_)
    : value(value_)
{}

TaggedValue TaggedValue::from_tag(ValueTag tag, FF value)
{
    auto assert_bounds = [](const FF& value, uint8_t bits) {
        if (static_cast<uint256_t>(value).get_msb() >= bits) {
            throw std::runtime_error("Value out of bounds");
        }
    };

    // Check bounds first.
    switch (tag) {
    case ValueTag::U1:
        assert_bounds(value, 1);
        break;
    case ValueTag::U8:
        assert_bounds(value, 8);
        break;
    case ValueTag::U16:
        assert_bounds(value, 16);
        break;
    case ValueTag::U32:
        assert_bounds(value, 32);
        break;
    case ValueTag::U64:
        assert_bounds(value, 64);
        break;
    case ValueTag::U128:
        assert_bounds(value, 128);
        break;
    case ValueTag::FF:
        break;
    }

    return from_tag_truncating(tag, value);
}

TaggedValue TaggedValue::from_tag_truncating(ValueTag tag, FF value)
{
    switch (tag) {
    case ValueTag::U1:
        return TaggedValue(static_cast<uint1_t>(static_cast<uint8_t>(value) % 2));
    case ValueTag::U8:
        return TaggedValue(static_cast<uint8_t>(value));
    case ValueTag::U16:
        return TaggedValue(static_cast<uint16_t>(value));
    case ValueTag::U32:
        return TaggedValue(static_cast<uint32_t>(value));
    case ValueTag::U64:
        return TaggedValue(static_cast<uint64_t>(value));
    case ValueTag::U128:
        return TaggedValue(static_cast<uint128_t>(value));
    case ValueTag::FF:
        return TaggedValue(value);
    default:
        throw std::runtime_error("Invalid tag");
    }
}

// Arithmetic operators
TaggedValue TaggedValue::operator+(const TaggedValue& other) const
{
    return std::visit(BinaryOperationVisitor<std::plus<>>(), value, other.value);
}

TaggedValue TaggedValue::operator-(const TaggedValue& other) const
{
    return std::visit(BinaryOperationVisitor<std::minus<>>(), value, other.value);
}

TaggedValue TaggedValue::operator*(const TaggedValue& other) const
{
    return std::visit(BinaryOperationVisitor<std::multiplies<>>(), value, other.value);
}

TaggedValue TaggedValue::operator/(const TaggedValue& other) const
{
    return std::visit(BinaryOperationVisitor<std::divides<>>(), value, other.value);
}

// Bitwise operators
TaggedValue TaggedValue::operator&(const TaggedValue& other) const
{
    return std::visit(BinaryOperationVisitor<std::bit_and<>>(), value, other.value);
}

TaggedValue TaggedValue::operator|(const TaggedValue& other) const
{
    return std::visit(BinaryOperationVisitor<std::bit_or<>>(), value, other.value);
}

TaggedValue TaggedValue::operator^(const TaggedValue& other) const
{
    return std::visit(BinaryOperationVisitor<std::bit_xor<>>(), value, other.value);
}

TaggedValue TaggedValue::operator<<(const TaggedValue& other) const
{
    return std::visit(ShiftOperationVisitor<shift_left>(), value, other.value);
}

TaggedValue TaggedValue::operator>>(const TaggedValue& other) const
{
    return std::visit(ShiftOperationVisitor<shift_right>(), value, other.value);
}

TaggedValue TaggedValue::operator~() const
{
    return std::visit(UnaryOperationVisitor<std::bit_not<>>(), value);
}

FF TaggedValue::as_ff() const
{
    const auto visitor = overloads{ [](FF val) -> FF { return val; },
                                    [](uint1_t val) -> FF { return val.value(); },
                                    [](uint128_t val) -> FF { return uint256_t::from_uint128(val); },
                                    [](auto&& val) -> FF { return val; } };

    return std::visit(visitor, value);
}

ValueTag TaggedValue::get_tag() const
{
    // The tag is implicit in the type.
    if (std::holds_alternative<uint8_t>(value)) {
        return ValueTag::U8;
    } else if (std::holds_alternative<uint1_t>(value)) {
        return ValueTag::U1;
    } else if (std::holds_alternative<uint16_t>(value)) {
        return ValueTag::U16;
    } else if (std::holds_alternative<uint32_t>(value)) {
        return ValueTag::U32;
    } else if (std::holds_alternative<uint64_t>(value)) {
        return ValueTag::U64;
    } else if (std::holds_alternative<uint128_t>(value)) {
        return ValueTag::U128;
    } else if (std::holds_alternative<FF>(value)) {
        return ValueTag::FF;
    } else {
        throw std::runtime_error("Unknown value type");
    }

    assert(false && "This should never happen.");
    return ValueTag::FF; // Only to make the compiler happy.
}

std::string TaggedValue::to_string() const
{
    std::string v = std::visit(
        overloads{ [](const FF& val) -> std::string { return field_to_string(val); },
                   [](const uint128_t& val) -> std::string { return field_to_string(uint256_t::from_uint128(val)); },
                   [](const uint1_t& val) -> std::string { return val.value() == 0 ? "0" : "1"; },
                   [](auto&& val) -> std::string { return std::to_string(val); } },
        value);
    return std::to_string(get_tag()) + "(" + v + ")";
}

} // namespace bb::avm2

std::string std::to_string(bb::avm2::ValueTag tag)
{
    using namespace bb::avm2;
    switch (tag) {
    case ValueTag::U1:
        return "U1";
    case ValueTag::U8:
        return "U8";
    case ValueTag::U16:
        return "U16";
    case ValueTag::U32:
        return "U32";
    case ValueTag::U64:
        return "U64";
    case ValueTag::U128:
        return "U128";
    case ValueTag::FF:
        return "FF";
    default:
        return "Unknown";
    }
}

std::string std::to_string(const bb::avm2::TaggedValue& value)
{
    return value.to_string();
}
