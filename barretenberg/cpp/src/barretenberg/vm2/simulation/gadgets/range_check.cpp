/**
 * @brief AVM range check gadget for witness generation.
 *
 * Implements range constraint validation for the AVM simulation layer.
 * Asserts that a given value fits within a specified number of bits and
 * emits a RangeCheckEvent for downstream trace generation and proving.
 */

#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/common/assert.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Assert that a value fits within a given bit-width.
 *
 * Validates that the value can be represented using at most num_bits bits
 * (i.e., value < 2^num_bits). On success, emits a RangeCheckEvent that will
 * be consumed by trace generation to produce the corresponding range check
 * constraint rows.
 *
 * @param value    The value to range-check (up to 128 bits).
 * @param num_bits The maximum number of bits allowed. Must be <= 128.
 */
void RangeCheck::assert_range(uint128_t value, uint8_t num_bits)
{
    BB_ASSERT(num_bits <= 128 && "Range checks aren't supported for bit-sizes > 128");

    events.emit({ .value = value, .num_bits = num_bits });
}

} // namespace bb::avm2::simulation
