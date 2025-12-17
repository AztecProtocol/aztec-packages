#include "barretenberg/vm2/simulation/standalone/pure_to_radix.hpp"

#include <algorithm>
#include <cstdint>
#include <vector>

#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/to_radix.hpp"
#include "barretenberg/vm2/simulation/interfaces/memory.hpp"

namespace bb::avm2::simulation {

namespace {

/**
 * @brief Fast divmod for uint256_t by a small divisor (fits in uint64_t).
 *
 * This is MUCH faster than the generic uint256_t::divmod which uses bit-by-bit
 * binary long division. Instead, we process 64 bits at a time using 128-bit
 * arithmetic, reducing from ~256 iterations to just 4.
 *
 * @param value The dividend (modified in place to become the quotient)
 * @param divisor The divisor (must be > 0 and fit in uint64_t)
 * @return The remainder
 */
inline uint64_t fast_divmod_small(uint256_t& value, uint64_t divisor)
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    // Use native 128-bit division - process limbs from MSB to LSB
    __uint128_t carry = 0;
    for (int i = 3; i >= 0; i--) {
        __uint128_t current = (carry << 64) | value.data[i];
        value.data[i] = static_cast<uint64_t>(current / divisor);
        carry = current % divisor;
    }
    return static_cast<uint64_t>(carry);
#else
    // Fallback for platforms without 128-bit integers (e.g., WASM)
    // Use the standard divmod but it's still faster than the generic case
    // because the divisor is small
    auto [quotient, remainder] = value.divmod(uint256_t(divisor));
    value = quotient;
    return static_cast<uint64_t>(remainder.data[0]);
#endif
}

/**
 * @brief Check if uint256_t is zero by examining all limbs.
 */
inline bool is_zero(const uint256_t& value)
{
    return (value.data[0] | value.data[1] | value.data[2] | value.data[3]) == 0;
}

} // namespace

std::pair<std::vector<uint8_t>, /* truncated */ bool> PureToRadix::to_le_radix(const FF& value,
                                                                               uint32_t num_limbs,
                                                                               uint32_t radix)
{
    BB_BENCH_NAME("PureToRadix::to_le_radix");

    uint256_t value_integer = static_cast<uint256_t>(value);
    std::vector<uint8_t> limbs;
    limbs.reserve(num_limbs);

    // Fast path for radix 2: use get_bit() which is much faster than divmod.
    // Each get_bit() is just array indexing + bit mask on uint64_t.
    if (radix == 2) {
        for (uint32_t i = 0; i < num_limbs; i++) {
            limbs.push_back(static_cast<uint8_t>(value_integer.get_bit(i)));
        }
        // Check for truncation: are there any set bits beyond num_limbs?
        bool truncated = (num_limbs < 256) && (value_integer >> uint256_t(num_limbs)) != uint256_t(0);
        return { limbs, truncated };
    }

    // Fast path for other power-of-2 radixes (4, 8, 16, 32, 64, 128, 256).
    // Use bit masking and shifting instead of expensive divmod.
    if ((radix & (radix - 1)) == 0 && radix >= 4) {
        uint32_t bits_per_limb = static_cast<uint32_t>(__builtin_ctz(radix));
        uint64_t mask = radix - 1;
        uint256_t shift_amount(bits_per_limb);

        for (uint32_t i = 0; i < num_limbs; i++) {
            limbs.push_back(static_cast<uint8_t>(value_integer.data[0] & mask));
            value_integer = value_integer >> shift_amount;
        }

        return { limbs, value_integer != uint256_t(0) };
    }

    // Optimized path for non-power-of-2 radixes.
    // Since radix <= 256 (enforced by caller), it fits in uint64_t.
    // Use fast 128-bit division instead of slow bit-by-bit uint256_t::divmod.
    uint64_t radix64 = static_cast<uint64_t>(radix);

    for (uint32_t i = 0; i < num_limbs; i++) {
        if (is_zero(value_integer)) {
            // Once value is 0, all remaining limbs are 0
            limbs.resize(num_limbs, 0);
            return { limbs, false };
        }
        uint64_t remainder = fast_divmod_small(value_integer, radix64);
        limbs.push_back(static_cast<uint8_t>(remainder));
    }

    return { limbs, !is_zero(value_integer) };
}

std::pair<std::vector<bool>, /* truncated */ bool> PureToRadix::to_le_bits(const FF& value, uint32_t num_limbs)
{
    BB_BENCH_NAME("PureToRadix::to_le_bits");

    const auto [limbs, truncated] = to_le_radix(value, num_limbs, 2);
    std::vector<bool> bits(limbs.size());

    std::transform(limbs.begin(), limbs.end(), bits.begin(), [](uint8_t val) {
        return val != 0; // Convert nonzero values to `true`, zero to `false`
    });

    return { bits, truncated };
}

void PureToRadix::to_be_radix(MemoryInterface& memory,
                              const FF& value,
                              uint32_t radix,
                              uint32_t num_limbs,
                              bool is_output_bits,
                              MemoryAddress dst_addr)
{
    BB_BENCH_NAME("PureToRadix::to_be_radix");

    uint64_t write_addr_upper_bound = static_cast<uint64_t>(dst_addr) + num_limbs;
    bool dst_out_of_range = write_addr_upper_bound > AVM_MEMORY_SIZE;
    // Error handling - check that the radix value is within the valid range
    // The valid range is [2, 256]. Therefore, the radix is invalid if (2 > radix) or (radix > 256)
    // We need to perform both checks explicitly since that is what the circuit would do
    bool radix_is_lt_2 = radix < 2;
    bool radix_is_gt_256 = radix > 256;
    // Error handling - check that if is_output_bits is true, the radix has to be 2
    bool invalid_bitwise_radix = is_output_bits && (radix != 2);
    // Error handling - if num_limbs is zero, value needs to be zero
    bool invalid_num_limbs = (num_limbs == 0) && !value.is_zero();

    if (dst_out_of_range || radix_is_lt_2 || radix_is_gt_256 || invalid_bitwise_radix || invalid_num_limbs) {
        throw ToRadixException("Invalid parameters for ToRadix");
    }

    if (is_output_bits) {
        auto [limbs, truncated] = to_le_bits(value, num_limbs);
        if (truncated) {
            throw ToRadixException("Truncation error");
        }
        std::reverse(limbs.begin(), limbs.end());
        for (uint32_t i = 0; i < num_limbs; i++) {
            memory.set(dst_addr + i, MemoryValue::from<uint1_t>(static_cast<uint1_t>(limbs[i])));
        }
    } else {
        auto [limbs, truncated] = to_le_radix(value, num_limbs, radix);
        if (truncated) {
            throw ToRadixException("Truncation error");
        }
        std::ranges::reverse(limbs);
        for (uint32_t i = 0; i < num_limbs; i++) {
            memory.set(dst_addr + i, MemoryValue::from<uint8_t>(limbs[i]));
        }
    }
}

} // namespace bb::avm2::simulation
