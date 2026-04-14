#include "barretenberg/vm2/simulation/gadgets/gt.hpp"

#include "barretenberg/common/assert.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Computes whether a > b for field elements, delegating to the ff_gt gadget.
 *
 * @param a The first field element.
 * @param b The second field element.
 * @return true if a > b (as canonical field integers), false otherwise.
 */
bool GreaterThan::gt(const FF& a, const FF& b)
{
    return field_gt.ff_gt(a, b);
}

/**
 * @brief Computes whether a > b for uint128 values.
 *
 * Computes the absolute difference: (a - b - 1) if a > b, or (b - a) if a <= b.
 * Range-checks this difference to prove the subtraction did not underflow, which
 * in turn proves the comparison result is correct. See gt.pil for the full argument.
 *
 * @param a The first uint128 value.
 * @param b The second uint128 value.
 * @return true if a > b, false otherwise.
 */
bool GreaterThan::gt(const uint128_t& a, const uint128_t& b)
{
    bool res = a > b;
    const uint128_t abs_diff = res ? a - b - 1 : b - a;
    const uint8_t num_bits_bound = static_cast<uint8_t>(static_cast<uint256_t>(abs_diff).get_msb() + 1);
    const uint8_t num_bits_bound_16 =
        static_cast<uint8_t>(((num_bits_bound - 1) / 16 + 1) * 16); // round up to multiple of 16
    range_check.assert_range(abs_diff, num_bits_bound_16);
    events.emit({
        .a = a,
        .b = b,
        .result = res,
    });
    return res;
}

/**
 * @brief Computes whether a > b for memory values, dispatching by tag.
 *
 * Field-tagged values are compared via the ff_gt gadget. All other types (u8, u16, u32,
 * u64, u128) are compared as uint128 integers.
 *
 * @param a The first memory value.
 * @param b The second memory value.
 * @return true if a > b, false otherwise.
 * @note Asserts that neither input has FF tag when taking the integer comparison path.
 */
bool GreaterThan::gt(const MemoryValue& a, const MemoryValue& b)
{
    FF a_ff = a.as_ff();
    FF b_ff = b.as_ff();
    if (a.get_tag() == ValueTag::FF) {
        return gt(a_ff, b_ff);
    }
    // It is a precondition that the memory value is <= 128 bits.
    BB_ASSERT(a.get_tag() != MemoryTag::FF);
    BB_ASSERT(b.get_tag() != MemoryTag::FF);
    return gt(static_cast<uint128_t>(a_ff), static_cast<uint128_t>(b_ff));
}

} // namespace bb::avm2::simulation
