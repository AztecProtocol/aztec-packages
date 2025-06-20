// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include <type_traits>
namespace bb::numeric {

/**
 * @brief Computes the ceiling of the division of two integral types.
 * @details Calculates the ceiling of the division of `numerator` by `denominator`. Ensures that the denominator is
 * greater than zero and that the type is an integral type.
 *
 * @tparam T The integral type of numerator and denominator.
 * @param numerator The value to be divided.
 * @param denominator The value to divide by.
 * @return The ceiling of the division result.
 */
template <typename T> constexpr T ceil_div(const T& numerator, const T& denominator)
{
    ASSERT(denominator > 0, "Denominator must be greater than zero.");
    static_assert(std::is_integral_v<T>, "Type must be an integral type.");
    return (numerator + denominator - 1) / denominator;
}

} // namespace bb::numeric
