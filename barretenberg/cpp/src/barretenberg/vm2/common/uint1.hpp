#pragma once

#include <cstdint>
#include <type_traits>

namespace bb::avm2 {

/**
 * @brief A 1-bit unsigned integer type.
 *
 * This type is used to represent boolean values in a way that's compatible
 * with the TaggedValue system. It behaves like a regular integer type but
 * only allows values 0 and 1.
 */
class uint1_t {
  public:
    uint1_t(const uint1_t& other) = default;
    uint1_t& operator=(const uint1_t& other) = default;

    // Default constructor initializes to 0.
    constexpr uint1_t() noexcept
        : value_(false)
    {}

    // Constructor from bool.
    constexpr uint1_t(bool b) noexcept
        : value_(b)
    {}

    // Constructor from integral types. Zero becomes 0, non-zero becomes 1.
    template <typename T, typename = std::enable_if_t<std::is_integral_v<T>>>
    constexpr uint1_t(T v) noexcept
        : value_(v != 0)
    {}

    // Arithmetic operators.
    constexpr uint1_t operator+(const uint1_t& other) const noexcept { return *this ^ other; }
    constexpr uint1_t operator-(const uint1_t& other) const noexcept { return *this + other; }
    constexpr uint1_t operator*(const uint1_t& other) const noexcept { return *this & other; }
    constexpr uint1_t operator/(const uint1_t& other) const noexcept { return uint1_t(value() / other.value()); }
    constexpr uint1_t operator-() const noexcept { return uint1_t(!value_); }

    // Bitwise operators.
    constexpr uint1_t operator&(const uint1_t& other) const noexcept { return uint1_t(value_ && other.value_); }
    constexpr uint1_t operator|(const uint1_t& other) const noexcept { return uint1_t(value_ || other.value_); }
    constexpr uint1_t operator^(const uint1_t& other) const noexcept { return uint1_t(value_ != other.value_); }
    constexpr uint1_t operator~() const noexcept { return uint1_t(!value_); }

    // Shifts are a bit special.
    constexpr uint1_t operator<<(const uint1_t& other) const noexcept { return (*this - (*this * other)); }
    constexpr uint1_t operator>>(const uint1_t& other) const noexcept { return (*this - (*this * other)); }

    // Comparison operators.
    constexpr bool operator==(const uint1_t& other) const noexcept = default;
    constexpr bool operator!=(const uint1_t& other) const noexcept = default;
    constexpr bool operator<(const uint1_t& other) const noexcept { return value_ < other.value_; }
    constexpr bool operator<=(const uint1_t& other) const noexcept { return value_ <= other.value_; }
    constexpr bool operator>(const uint1_t& other) const noexcept { return value_ > other.value_; }
    constexpr bool operator>=(const uint1_t& other) const noexcept { return value_ >= other.value_; }

    // Get the raw value. Guaranteed to be 0 or 1.
    constexpr uint8_t value() const noexcept { return value_ ? 1 : 0; }
    constexpr operator uint8_t() const noexcept { return value(); }

  private:
    bool value_;
};

} // namespace bb::avm2
