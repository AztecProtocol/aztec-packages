#include "barretenberg/vm2/simulation/standalone/pure_to_radix.hpp"

#include <algorithm>
#include <cstdint>
#include <vector>

#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/to_radix.hpp"
#include "barretenberg/vm2/simulation/interfaces/memory.hpp"

namespace bb::avm2::simulation {

std::vector<uint8_t> PureToRadix::to_le_radix(const FF& value, uint32_t num_limbs, uint32_t radix)
{
    BB_BENCH_NAME("PureToRadix::to_le_radix");

    uint256_t radix_integer = static_cast<uint256_t>(radix);
    uint256_t value_integer = static_cast<uint256_t>(value);
    std::vector<uint8_t> limbs;
    limbs.reserve(num_limbs);

    for (uint32_t i = 0; i < num_limbs; i++) {
        auto [quotient, remainder] = value_integer.divmod(radix_integer);
        limbs.push_back(static_cast<uint8_t>(remainder));
        value_integer = quotient;
    }

    return limbs;
}

std::vector<bool> PureToRadix::to_le_bits(const FF& value, uint32_t num_limbs)
{
    BB_BENCH_NAME("PureToRadix::to_le_bits");

    uint256_t value_integer = static_cast<uint256_t>(value);
    std::vector<bool> limbs;
    limbs.reserve(num_limbs);

    for (uint32_t i = 0; i < num_limbs; i++) {
        limbs.push_back(value_integer.get_bit(i));
    }

    return limbs;
}

void PureToRadix::to_be_radix(MemoryInterface& memory,
                              const FF& value,
                              uint32_t radix,
                              uint32_t num_limbs,
                              bool is_output_bits,
                              MemoryAddress dst_addr)
{
    BB_BENCH_NAME("PureToRadix::to_be_radix");

    uint64_t max_write_address = static_cast<uint64_t>(dst_addr) + num_limbs - 1;
    bool dst_out_of_range = max_write_address > AVM_HIGHEST_MEM_ADDRESS;
    // Error handling - check that the radix value is within the valid range
    // The valid range is [2, 256]. Therefore, the radix is invalid if (2 > radix) or (radix > 256)
    // We need to perform both checks explicitly since that is what the circuit would do
    bool radix_is_lt_2 = radix < 2;
    bool radix_is_gt_256 = radix > 256;
    // Error handling - check that if is_output_bits is true, the radix has to be 2
    bool invalid_bitwise_radix = is_output_bits && (radix != 2);
    // Error handling - if num_limbs is zero, value needs to be zero
    bool invalid_num_limbs = (num_limbs == 0) && (!value.is_zero());

    if (dst_out_of_range || radix_is_lt_2 || radix_is_gt_256 || invalid_bitwise_radix || invalid_num_limbs) {
        throw ToRadixException("Invalid parameters for ToRadix");
    }

    uint256_t radix_integer = static_cast<uint256_t>(radix);
    uint256_t value_integer = static_cast<uint256_t>(value);
    std::vector<uint8_t> limbs;
    limbs.reserve(num_limbs);

    for (uint32_t i = 0; i < num_limbs; i++) {
        auto [quotient, remainder] = value_integer.divmod(radix_integer);
        limbs.push_back(static_cast<uint8_t>(remainder));
        value_integer = quotient;
    }

    if (value_integer != 0) {
        throw ToRadixException("Truncation error");
    }

    for (uint32_t i = 0; i < num_limbs; i++) {
        memory.set(dst_addr + i,
                   is_output_bits ? MemoryValue::from<uint1_t>(static_cast<uint1_t>(limbs.at(i)))
                                  : MemoryValue::from<uint8_t>(limbs.at(i)));
    }
}

} // namespace bb::avm2::simulation
