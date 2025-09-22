#include "barretenberg/vm2/simulation/to_radix.hpp"

#include <algorithm>
#include <cstdint>
#include <stdexcept>
#include <vector>

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/to_radix.hpp"
#include "barretenberg/vm2/simulation/events/to_radix_event.hpp"

namespace bb::avm2::simulation {

std::vector<uint8_t> ToRadix::to_le_radix(const FF& value, uint32_t num_limbs, uint32_t radix)
{
    std::vector<uint8_t> limbs;
    uint32_t num_p_limbs = static_cast<uint32_t>(get_p_limbs_per_radix_size(radix));
    limbs.reserve(std::max(num_limbs, num_p_limbs));

    uint256_t value_integer = static_cast<uint256_t>(value);
    while (value_integer != 0) {
        auto [quotient, remainder] = value_integer.divmod(radix);
        limbs.push_back(static_cast<uint8_t>(remainder));
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

    if (num_limbs < limbs.size()) {
        limbs.erase(limbs.begin() + num_limbs, limbs.end());
    }

    return limbs;
}

std::vector<bool> ToRadix::to_le_bits(const FF& value, uint32_t num_limbs)
{
    std::vector<uint8_t> limbs = to_le_radix(value, num_limbs, 2);
    std::vector<bool> bits(limbs.size());

    std::transform(limbs.begin(), limbs.end(), bits.begin(), [](uint8_t val) {
        return val != 0; // Convert nonzero values to `true`, zero to `false`
    });

    return bits;
}

void ToRadix::to_be_radix(MemoryInterface& memory,
                          const FF& value,
                          uint32_t radix,
                          uint32_t num_limbs,
                          bool is_output_bits, // Decides if output is U1 or U8
                          MemoryAddress dst_addr)
{
    uint32_t execution_clk = execution_id_manager.get_execution_id();
    uint32_t space_id = memory.get_space_id();

    try {
        // todo(ilyas): there must be a nicer way to do this in the simulator. See if it's fine to provide
        // a hierarchy of errors so that we can throw on the first error we encounter

        // Error handling - check that the maximum write address does not exceed the highest memory address
        // This subtrace writes in the range { dst_addr, dst_addr + 1, ..., dst_addr + num_limbs - 1 }
        uint64_t max_write_address = static_cast<uint64_t>(dst_addr) + num_limbs - 1;
        bool dst_out_of_range = gt.gt(max_write_address, AVM_HIGHEST_MEM_ADDRESS);

        // Error handling - check that the radix value is within the valid range
        // The valid range is [2, 256]. Therefore, the radix is invalid if (2 > radix) or (radix > 256)
        // We need to perform both checks explicitly since that is what the circuit would do
        bool radix_is_lt_2 = gt.gt(2, radix);
        bool radix_is_gt_256 = gt.gt(radix, 256);

        // Error handling - check that if is_output_bits is true, the radix has to be 2
        bool invalid_bitwise_radix = is_output_bits && (radix != 2);
        // Error handling - if num_limbs is zero, value needs to be zero
        bool invalid_num_limbs = (num_limbs == 0) && (value != FF(0));

        if (dst_out_of_range || radix_is_lt_2 || radix_is_gt_256 || invalid_bitwise_radix || invalid_num_limbs) {
            throw std::runtime_error("Invalid parameters for ToRadix");
        }

        // If we get to this point, we are error free.
        std::vector<MemoryValue> be_output_limbs;
        be_output_limbs.reserve(num_limbs);
        if (is_output_bits) {
            std::vector<bool> output_bits = to_le_bits(value, num_limbs);
            std::ranges::for_each(output_bits.rbegin(), output_bits.rend(), [&](bool bit) {
                be_output_limbs.push_back(MemoryValue::from<uint1_t>(bit));
            });
        } else {
            std::vector<uint8_t> output_limbs_u8 = to_le_radix(value, num_limbs, radix);
            std::ranges::for_each(output_limbs_u8.rbegin(), output_limbs_u8.rend(), [&](uint8_t limb) {
                be_output_limbs.push_back(MemoryValue::from<uint8_t>(limb));
            });
        }

        for (uint32_t i = 0; i < num_limbs; i++) {
            memory.set(dst_addr + i, be_output_limbs[i]);
        }

        memory_events.emit({
            .execution_clk = execution_clk,
            .space_id = space_id,
            .dst_addr = dst_addr,
            .value = value,
            .radix = radix,
            .is_output_bits = is_output_bits,
            .limbs = be_output_limbs,
        });

    } catch (const std::exception& e) {
        memory_events.emit({
            .execution_clk = execution_clk,
            .space_id = space_id,
            .dst_addr = dst_addr,
            .value = value,
            .radix = radix,
            .is_output_bits = is_output_bits,
            .limbs = std::vector<MemoryValue>(num_limbs, MemoryValue::from<FF>(0)),
        });
        throw ToRadixException("Error during BE conversion, " + std::string(e.what()));
    }
}

} // namespace bb::avm2::simulation
