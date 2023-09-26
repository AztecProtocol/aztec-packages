#include "safe_uint.hpp"
#include "../bool/bool.hpp"
#include "../circuit_builders/circuit_builders.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

namespace proof_system::plonk {
namespace stdlib {

template <typename ComposerContext>

safe_uint_t<ComposerContext> safe_uint_t<ComposerContext>::operator+(const safe_uint_t& other) const
{
    return safe_uint_t((value + other.value), current_max + other.current_max, IS_UNSAFE);
}

template <typename ComposerContext>
safe_uint_t<ComposerContext> safe_uint_t<ComposerContext>::operator*(const safe_uint_t& other) const
{

    uint512_t new_max = uint512_t(current_max) * uint512_t(other.current_max);
    ASSERT(new_max.hi == 0);
    return safe_uint_t((value * other.value), new_max.lo, IS_UNSAFE);
}

/**
 * @brief Subtraction when you have a pre-determined bound on the difference size
 * @details Same as operator- except with this pre-determined bound `difference_bit_size`.
 *
 * @tparam ComposerContext
 * @param other
 * @param difference_bit_size
 * @param description
 * @return safe_uint_t<ComposerContext>
 */
template <typename ComposerContext>
safe_uint_t<ComposerContext> safe_uint_t<ComposerContext>::subtract(const safe_uint_t& other,
                                                                    const size_t difference_bit_size,
                                                                    std::string const& description) const
{
    ASSERT(difference_bit_size <= MAX_BIT_NUM);
    ASSERT(!(this->value.is_constant() && other.value.is_constant()));
    field_ct difference_val = this->value - other.value;
    // Creates the range constraint that difference_val is in [0, (1<<difference_bit_size) - 1].
    safe_uint_t<ComposerContext> difference(difference_val, difference_bit_size, format("subtract: ", description));
    // It is possible for underflow to happen and the range constraint to not catch it.
    // This is when (a - b) + modulus <= (1<<difference_bit_size) - 1 (or difference.current_max)
    // Checking that difference.current_max + max of (b - a) >= modulus will ensure that underflow is caught in all
    // cases
    if (difference.current_max + other.current_max > MAX_VALUE)
        throw_or_abort("maximum value exceeded in safe_uint subtract");
    return difference;
}

/**
 * @brief Subtraction on two safe_uint_t objects
 * @details The function first checks the case when both operands are constants and there is underflow. 
 *          Then, it computes the difference and create a safe_uint_t from its value
 *          with the same max value as `current_max`.
 *          Constructing the `difference` safe_uint_t will create a range constraint,
 *          which catches underflow as long as the difference value does not end up in the range [0,
 *          current_max]. The only case where it is possible that the difference value can end up in this range, is when
 *          `current_max` + `other.current_max` exceeds MAX_VALUE (the modulus - 1), so we throw an error in this case.
 *
 * @tparam ComposerContext
 * @param other
 * @return safe_uint_t<ComposerContext>
 */
template <typename ComposerContext>
safe_uint_t<ComposerContext> safe_uint_t<ComposerContext>::operator-(const safe_uint_t& other) const
{
    // If both are constants and the operation is an underflow, throw an error
    // Constants are part of the circuit so we can check the case when both are constants and throw an error if
    // there is underflow.
    ASSERT(!(this->value.is_constant() && other.value.is_constant() &&
             static_cast<uint256_t>(value.get_value()) < static_cast<uint256_t>(other.value.get_value())));
    field_ct difference_val = this->value - other.value;

    // safe_uint_t constructor creates a range constraint which checks that `difference_val` is within [0,
    // current_max].
    safe_uint_t<ComposerContext> difference(difference_val, (size_t)(current_max.get_msb() + 1), "- operator");

    // Call the two operands a and b. If this operations is underflow and the range constraint fails to catch it,
    // this means that (a-b) + modulus is IN the range [0, current_max]
    // this is equivalent to the condition that (a - b) + modulus <= current_max.
    // (a-b) is minimized by -other.current_max, so IF current_max + other.current_max >= modulus,
    // there may be an underflow that the range constraint fails to catch, so we need to throw an error.
    // Note that we will throw an error even if the operation is not an underflow depending on the witnesses
    // but we cannot distinguish it from a case that underflows, so we must throw an error.
    if (difference.current_max + other.current_max > MAX_VALUE)
        throw_or_abort("maximum value exceeded in safe_uint minus operator");
    return difference;
}

/**
 * @brief division when you have a pre-determined bound on the sizes of the quotient and remainder
 *
 * @tparam ComposerContext
 * @param other
 * @param quotient_bit_size
 * @param remainder_bit_size
 * @param description
 * @param get_quotient
 * @return safe_uint_t<ComposerContext>
 */
template <typename ComposerContext>
safe_uint_t<ComposerContext> safe_uint_t<ComposerContext>::divide(
    const safe_uint_t& other,
    const size_t quotient_bit_size,
    const size_t remainder_bit_size,
    std::string const& description,
    const std::function<std::pair<uint256_t, uint256_t>(uint256_t, uint256_t)>& get_quotient) const
{
    ASSERT(this->value.is_constant() == false);
    ASSERT(quotient_bit_size <= MAX_BIT_NUM);
    ASSERT(remainder_bit_size <= MAX_BIT_NUM);
    uint256_t val = this->value.get_value();
    auto [quotient_val, remainder_val] = get_quotient(val, (uint256_t)other.value.get_value());
    field_ct quotient_field(witness_t(value.context, quotient_val));
    field_ct remainder_field(witness_t(value.context, remainder_val));
    safe_uint_t<ComposerContext> quotient(
        quotient_field, quotient_bit_size, format("divide method quotient: ", description));
    safe_uint_t<ComposerContext> remainder(
        remainder_field, remainder_bit_size, format("divide method remainder: ", description));

    // This line implicitly checks we are not overflowing
    safe_uint_t int_val = quotient * other + remainder;

    // We constrain divisor - remainder - 1 to be non-negative to ensure that remainder < divisor.
    // Define remainder_plus_one to avoid multiple subtractions
    const safe_uint_t<ComposerContext> remainder_plus_one = remainder + 1;
    // Subtraction of safe_uint_t's imposes the desired range constraint
    other - remainder_plus_one;

    this->assert_equal(int_val, "divide method quotient and/or remainder incorrect");

    return quotient;
}

/**
 * @brief Potentially less efficient than divide function - bounds remainder and quotient by max of this
 *
 * @tparam ComposerContext
 * @param other
 * @return safe_uint_t<ComposerContext>
 */
template <typename ComposerContext>
safe_uint_t<ComposerContext> safe_uint_t<ComposerContext>::operator/(const safe_uint_t& other) const
{
    ASSERT(this->value.is_constant() == false);
    uint256_t val = this->value.get_value();
    auto [quotient_val, remainder_val] = val.divmod((uint256_t)other.value.get_value());
    field_ct quotient_field(witness_t(value.context, quotient_val));
    field_ct remainder_field(witness_t(value.context, remainder_val));
    safe_uint_t<ComposerContext> quotient(
        quotient_field, (size_t)(current_max.get_msb() + 1), format("/ operator quotient"));
    safe_uint_t<ComposerContext> remainder(
        remainder_field, (size_t)(other.current_max.get_msb() + 1), format("/ operator remainder"));

    // This line implicitly checks we are not overflowing
    safe_uint_t int_val = quotient * other + remainder;

    // We constrain divisor - remainder - 1 to be non-negative to ensure that remainder < divisor.
    // // define remainder_plus_one to avoid multiple subtractions
    const safe_uint_t<ComposerContext> remainder_plus_one = remainder + 1;
    // // subtraction of safe_uint_t's imposes the desired range constraint
    other - remainder_plus_one;

    this->assert_equal(int_val, "/ operator quotient and/or remainder incorrect");

    return quotient;
}

template <typename ComposerContext> safe_uint_t<ComposerContext> safe_uint_t<ComposerContext>::normalize() const
{
    auto norm_value = value.normalize();
    return safe_uint_t(norm_value, current_max, IS_UNSAFE);
}

template <typename ComposerContext> void safe_uint_t<ComposerContext>::assert_is_zero(std::string const& msg) const
{
    value.assert_is_zero(msg);
}

template <typename ComposerContext> void safe_uint_t<ComposerContext>::assert_is_not_zero(std::string const& msg) const
{
    value.assert_is_not_zero(msg);
}

template <typename ComposerContext> bool_t<ComposerContext> safe_uint_t<ComposerContext>::is_zero() const
{
    return value.is_zero();
}

template <typename ComposerContext> barretenberg::fr safe_uint_t<ComposerContext>::get_value() const
{
    return value.get_value();
}

template <typename ComposerContext>
bool_t<ComposerContext> safe_uint_t<ComposerContext>::operator==(const safe_uint_t& other) const
{
    return value == other.value;
}

template <typename ComposerContext>
bool_t<ComposerContext> safe_uint_t<ComposerContext>::operator!=(const safe_uint_t& other) const
{
    return !operator==(other);
}
template <typename ComposerContext>
std::array<safe_uint_t<ComposerContext>, 3> safe_uint_t<ComposerContext>::slice(const uint8_t msb,
                                                                                const uint8_t lsb) const
{
    ASSERT(msb >= lsb);
    ASSERT(static_cast<size_t>(msb) <= grumpkin::MAX_NO_WRAP_INTEGER_BIT_LENGTH);
    const safe_uint_t lhs = *this;
    ComposerContext* ctx = lhs.get_context();

    const uint256_t value = uint256_t(get_value());
    // This should be caught by the proof itself, but the circuit creator will have now way of knowing where the issue
    // is
    ASSERT(value < (static_cast<uint256_t>(1) << grumpkin::MAX_NO_WRAP_INTEGER_BIT_LENGTH));
    const auto msb_plus_one = uint32_t(msb) + 1;
    const auto hi_mask = ((uint256_t(1) << (256 - uint32_t(msb))) - 1);
    const auto hi = (value >> msb_plus_one) & hi_mask;

    const auto lo_mask = (uint256_t(1) << lsb) - 1;
    const auto lo = value & lo_mask;

    const auto slice_mask = ((uint256_t(1) << (uint32_t(msb - lsb) + 1)) - 1);
    const auto slice = (value >> lsb) & slice_mask;
    safe_uint_t lo_wit, slice_wit, hi_wit;
    if (this->value.is_constant()) {
        hi_wit = safe_uint_t(hi);
        lo_wit = safe_uint_t(lo);
        slice_wit = safe_uint_t(slice);

    } else {
        hi_wit = safe_uint_t(witness_t(ctx, hi), grumpkin::MAX_NO_WRAP_INTEGER_BIT_LENGTH - uint32_t(msb), "hi_wit");
        lo_wit = safe_uint_t(witness_t(ctx, lo), lsb, "lo_wit");
        slice_wit = safe_uint_t(witness_t(ctx, slice), msb_plus_one - lsb, "slice_wit");
    }
    assert_equal(((hi_wit * safe_uint_t(uint256_t(1) << msb_plus_one)) + lo_wit +
                  (slice_wit * safe_uint_t(uint256_t(1) << lsb))));

    std::array<safe_uint_t, 3> result = { lo_wit, slice_wit, hi_wit };
    return result;
}

INSTANTIATE_STDLIB_TYPE(safe_uint_t);

} // namespace stdlib
} // namespace proof_system::plonk
