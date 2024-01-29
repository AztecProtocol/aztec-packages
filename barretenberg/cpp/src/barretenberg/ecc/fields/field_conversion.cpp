
#include "barretenberg/ecc/fields/field_conversion.hpp"

namespace bb::field_conversion {

static constexpr uint64_t NUM_CONVERSION_LIMB_BITS = 68; // set to be 68 because bigfield has 68 bit limbs
static constexpr uint64_t TOTAL_BITS = 254;

/**
 * @brief Converts 2 bb::fr elements to grumpkin::fr
 * @details Checks that each bb::fr must be at most 128 bits (to ensure no overflow), and decomposes each
 * bb::fr into two 64-bit limbs, and the 4 64-bit limbs form the grumpkin::fr
 * @param low_bits_in
 * @param high_bits_in
 * @return grumpkin::fr
 */
grumpkin::fr convert_bn254_frs_to_grumpkin_fr(const bb::fr& low_bits_in, const bb::fr& high_bits_in)
{
    // TODO: figure out can_overflow, maximum_bitlength in stdlib version
    // Combines the two elements into one uint256_t, and then convert that to a grumpkin::fr
    ASSERT(uint256_t(low_bits_in) < (uint256_t(1) << (NUM_CONVERSION_LIMB_BITS * 2))); // lower 136 bits
    ASSERT(uint256_t(high_bits_in) <
           (uint256_t(1) << (TOTAL_BITS - NUM_CONVERSION_LIMB_BITS * 2))); // upper 254-136 bits
    uint256_t value = uint256_t(low_bits_in) + (uint256_t(high_bits_in) << (NUM_CONVERSION_LIMB_BITS * 2));
    grumpkin::fr result(value);
    return result;
}

/**
 * @brief Converts grumpkin::fr to 2 bb::fr elements
 * @details Does the reverse of convert_barretenberg_frs_to_grumpkin_fr, by merging the two pairs of limbs back into the
 * 2 bb::fr elements.
 * @param input
 * @return std::array<bb::fr, 2>
 */
std::array<bb::fr, 2> convert_grumpkin_fr_to_bn254_frs(const grumpkin::fr& input)
{
    // Goal is to slice up the 64 bit limbs of grumpkin::fr/uint256_t to mirror the 68 bit limbs of bigfield
    // We accomplish this by dividing the grumpkin::fr's value into two 68*2=136 bit pieces.
    constexpr uint64_t LOWER_BITS = 2 * NUM_CONVERSION_LIMB_BITS;
    constexpr uint256_t LOWER_MASK = (uint256_t(1) << LOWER_BITS) - 1;
    auto value = uint256_t(input);
    ASSERT(value < (uint256_t(1) << TOTAL_BITS));
    std::array<bb::fr, 2> result;
    result[0] = static_cast<uint256_t>(value & LOWER_MASK);
    result[1] = static_cast<uint256_t>(value >> LOWER_BITS);
    ASSERT(static_cast<uint256_t>(result[1]) < (uint256_t(1) << (TOTAL_BITS - LOWER_BITS)));
    return result;
}

} // namespace bb::field_conversion