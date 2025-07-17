#include "barretenberg/vm2/simulation/to_radix.hpp"

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/to_radix.hpp"
#include "barretenberg/vm2/simulation/events/to_radix_event.hpp"

#include <algorithm>
#include <cstdint>
#include <vector>

namespace bb::avm2::simulation {

std::vector<uint8_t> ToRadix::to_le_radix(const FF& value, uint32_t num_limbs, uint32_t radix)
{
    uint256_t value_integer = static_cast<uint256_t>(value);
    auto limbs = std::vector<uint8_t>();
    size_t radix_index = static_cast<size_t>(radix);
    limbs.reserve(std::max(num_limbs, static_cast<uint32_t>(get_p_limbs_per_radix()[radix_index].size())));

    while (value_integer > 0) {
        limbs.push_back(static_cast<uint8_t>(value_integer % radix));
        value_integer /= radix;
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
        // Error handling - check that the maximum write address does not exceed the highest memory address
        // This subtrace writes in the range { dst_addr, dst_addr + 1, ..., dst_addr + num_limbs - 1 }
        uint64_t max_write_address = static_cast<uint64_t>(dst_addr) + num_limbs - 1;
        if (gt.gt(max_write_address, AVM_HIGHEST_MEM_ADDRESS)) {
            throw std::runtime_error("Memory write out of bounds: " + std::to_string(max_write_address));
        }

        // Error handling - check that the radix value is within the valid range
        // The valid range is [2, 256]. Therefore, the radix is invalid if (2 > radix) or (radix > 256)
        // We need to perform both checks explicitly since that is what the circuit would do
        bool radix_is_lt_2 = gt.gt(2, radix);
        bool radix_is_gt_256 = gt.gt(radix, 256);
        if (radix_is_lt_2 || radix_is_gt_256) {
            throw std::runtime_error("Radix must be between 2 and 256.");
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
