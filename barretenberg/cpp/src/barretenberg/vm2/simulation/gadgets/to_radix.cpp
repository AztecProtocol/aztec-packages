#include "barretenberg/vm2/simulation/gadgets/to_radix.hpp"

#include <algorithm>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/to_radix.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Performs a little endian radix decomposition of a field element into limbs. This emits a ToRadixEvent.
 *
 * @note Asserts that radix is in range [2, 256].
 *
 * @param value The field element to decompose.
 * @param num_limbs The number of limbs to decompose into.
 * @param radix The radix to decompose into. Must be in the range [2, 256].
 * @return A pair containing the vector of limbs and a boolean indicating if the decomposition was truncated.
 */
std::pair<std::vector<uint8_t>, /* truncated */ bool> ToRadix::to_le_radix(const FF& value,
                                                                           uint32_t num_limbs,
                                                                           uint32_t radix)
{
    BB_ASSERT_LTE(radix, static_cast<decltype(radix)>(256), "Radix is greater than 256");
    BB_ASSERT_GTE(radix, static_cast<decltype(radix)>(2), "Radix is less than 2");

    std::vector<uint8_t> limbs;
    uint32_t num_p_limbs = static_cast<uint32_t>(get_p_limbs_per_radix_size(radix));
    limbs.reserve(std::max(num_limbs, num_p_limbs));

    uint256_t value_integer = static_cast<uint256_t>(value);
    while (value_integer != 0) {
        auto [quotient, remainder] = value_integer.divmod(static_cast<uint64_t>(radix));
        limbs.push_back(static_cast<uint8_t>(remainder)); // Cast is fine by the precondition that radix <= 256.
        value_integer = quotient;
    }

    if (num_limbs > limbs.size()) {
        limbs.insert(limbs.end(), num_limbs - limbs.size(), 0);
    }

    // The event should never have less limbs than the necessary to perform the decomposition
    events.emit(ToRadixEvent{
        .value = value,
        .radix = radix,
        .limbs = limbs,
    });

    bool truncated = num_limbs < limbs.size();
    if (truncated) {
        limbs.erase(limbs.begin() + num_limbs, limbs.end());
    }

    return { limbs, truncated };
}

/**
 * @brief Performs a little endian radix decomposition of a field element into bits. This emits a ToRadixEvent.
 *
 * @param value The field element to decompose.
 * @param num_limbs The number of bits to decompose into.
 * @return A pair containing the vector of bits and a boolean indicating if the decomposition was truncated. The bits
 * are converted in a standard way, i.e., from non-zero values to `true`, zero to `false`.
 */
std::pair<std::vector<bool>, /* truncated */ bool> ToRadix::to_le_bits(const FF& value, uint32_t num_limbs)
{
    const auto [limbs, truncated] = to_le_radix(value, num_limbs, 2);
    std::vector<bool> bits;
    bits.reserve(limbs.size());

    for (uint8_t val : limbs) {
        bits.push_back(val != 0); // Convert nonzero values to `true`, zero to `false`
    };

    return { bits, truncated };
}

/**
 * @brief Performs a big endian radix decomposition of a field element into limbs. This directly emits a
 * ToRadixMemoryEvent and indirectly emits a ToRadixEvent if no error different than truncation is encountered. The
 * limbs are written to the memory in big endian order at the supplied destination address.
 *
 * @throws ToRadixException on input validation errors (checked first, all grouped):
 * - The destination memory slice is out-of-range (dst_addr + num_limbs > AVM_MEMORY_SIZE).
 * - Radix is less than 2.
 * - Radix is greater than 256.
 * - Radix is not 2 while is_output_bits is true.
 * - Num limbs is zero while value is not zero.
 * @throws ToRadixException on truncation error (checked after input validation and decomposition):
 * - The value cannot be fully decomposed into the given number of limbs. Note that the supplied num_limbs can be
 *   greater than the number of limbs that the value decomposes into.
 *
 * @param memory The memory to write the limbs to.
 * @param value The field element to decompose.
 * @param radix The radix to decompose into. Must be in the range [2, 256].
 * @param num_limbs The number of limbs to decompose into.
 * @param is_output_bits A boolean indicating if the output is U1 or U8.
 * @param dst_addr The address to write the limbs to.
 */
void ToRadix::to_be_radix(MemoryInterface& memory,
                          const FF& value,
                          uint32_t radix,
                          uint32_t num_limbs,
                          bool is_output_bits, // Decides if output is U1 or U8
                          MemoryAddress dst_addr)
{

    uint32_t execution_clk = execution_id_manager.get_execution_id();
    uint16_t space_id = memory.get_space_id();

    // Error handling - check that the maximum write address does not exceed the highest memory address
    // This subtrace writes in the range { dst_addr, dst_addr + 1, ..., dst_addr + num_limbs - 1 }
    uint64_t write_addr_upper_bound = static_cast<uint64_t>(dst_addr) + num_limbs;
    bool dst_out_of_range = gt.gt(write_addr_upper_bound, AVM_MEMORY_SIZE);

    // Error handling - check that the radix value is within the valid range
    // The valid range is [2, 256]. Therefore, the radix is invalid if (2 > radix) or (radix > 256)
    // We need to perform both checks explicitly since that is what the circuit would do
    bool radix_is_lt_2 = gt.gt(2, radix);
    bool radix_is_gt_256 = gt.gt(radix, 256);

    // Error handling - check that if is_output_bits is true, the radix has to be 2
    bool invalid_bitwise_radix = is_output_bits && (radix != 2);
    // Error handling - if num_limbs is zero, value needs to be zero
    bool invalid_num_limbs = (num_limbs == 0) && (!value.is_zero());

    ToRadixMemoryEvent event = {
        .execution_clk = execution_clk,
        .space_id = space_id,
        .num_limbs = num_limbs,
        .dst_addr = dst_addr,
        .value = value,
        .radix = radix,
        .is_output_bits = is_output_bits,
        .limbs = {},
    };

    if (dst_out_of_range || radix_is_lt_2 || radix_is_gt_256 || invalid_bitwise_radix || invalid_num_limbs) {
        memory_events.emit(std::move(event));
        throw ToRadixException("Error during BE conversion: Invalid parameters for ToRadix");
    }

    bool truncated = false;

    if (num_limbs > 0) {
        event.limbs.reserve(num_limbs);
        if (is_output_bits) {
            const auto [limbs, truncated_decomposition] = to_le_bits(value, num_limbs);
            truncated = truncated_decomposition;
            std::ranges::for_each(limbs.rbegin(), limbs.rend(), [&](bool bit) {
                event.limbs.push_back(MemoryValue::from<uint1_t>(bit));
            });
        } else {
            const auto [limbs, truncated_decomposition] = to_le_radix(value, num_limbs, radix);
            truncated = truncated_decomposition;
            std::ranges::for_each(limbs.rbegin(), limbs.rend(), [&](uint8_t limb) {
                event.limbs.push_back(MemoryValue::from<uint8_t>(limb));
            });
        }
    }

    if (truncated) {
        memory_events.emit(std::move(event));
        throw ToRadixException("Error during BE conversion: Truncation error");
    }

    // If we get to this point, we are error free.
    for (uint32_t i = 0; i < num_limbs; i++) {
        memory.set(dst_addr + i, event.limbs[i]);
    }

    memory_events.emit(std::move(event));
}

} // namespace bb::avm2::simulation
