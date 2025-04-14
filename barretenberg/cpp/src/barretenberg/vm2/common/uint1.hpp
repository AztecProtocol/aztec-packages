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

    // Default constructor initializes to 0
    constexpr uint1_t() noexcept
        : value_(0)
    {}

    // Constructor from bool
    constexpr uint1_t(bool b) noexcept
        : value_(b ? 1 : 0)
    {}

    // Constructor from integral types, enforcing 0 or 1 values
    template <typename T, typename = std::enable_if_t<std::is_integral_v<T>>>
    constexpr explicit uint1_t(T v) noexcept
        : value_(v != 0 ? 1 : 0)
    {}

    // Arithmetic operators
    constexpr uint1_t operator+(const uint1_t& other) const noexcept { return (value_ + other.value_) > 0; }
    constexpr uint1_t operator-(const uint1_t& other) const noexcept { return (value_ - other.value_) != 0; }
    constexpr uint1_t operator*(const uint1_t& other) const noexcept { return value_ & other.value_; }
    constexpr uint1_t operator/(const uint1_t& other) const noexcept { return other.value_ ? value_ : 0; }

    // Bitwise operators
    constexpr uint1_t operator&(const uint1_t& other) const noexcept { return value_ & other.value_; }
    constexpr uint1_t operator|(const uint1_t& other) const noexcept { return value_ | other.value_; }
    constexpr uint1_t operator^(const uint1_t& other) const noexcept { return value_ ^ other.value_; }
    constexpr uint1_t operator<<(const uint1_t& other) const noexcept { return (value_ << other.value_) != 0; }
    constexpr uint1_t operator>>(const uint1_t& other) const noexcept { return (value_ >> other.value_) != 0; }
    constexpr uint1_t operator~() const noexcept { return !value_; }

    // Comparison operators
    constexpr bool operator==(const uint1_t& other) const noexcept { return value_ == other.value_; }
    constexpr bool operator!=(const uint1_t& other) const noexcept { return value_ != other.value_; }
    constexpr bool operator<(const uint1_t& other) const noexcept { return value_ < other.value_; }
    constexpr bool operator<=(const uint1_t& other) const noexcept { return value_ <= other.value_; }
    constexpr bool operator>(const uint1_t& other) const noexcept { return value_ > other.value_; }
    constexpr bool operator>=(const uint1_t& other) const noexcept { return value_ >= other.value_; }

    // Get the raw value
    constexpr uint8_t value() const noexcept { return value_; }
    constexpr operator uint8_t() const noexcept { return value_; }

  private:
    uint8_t value_; // Using uint8_t for storage, but only 0 and 1 are valid values
};

} // namespace bb::avm2
