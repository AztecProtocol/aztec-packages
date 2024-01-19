
#include "barretenberg/ecc/fields/field_conversion.hpp"

namespace bb::field_conversion {

static constexpr uint64_t NUM_CONVERSION_LIMB_BITS = 64;

/**
 * @brief Decomposes a bb::fr into two 64-bit limbs. Helper function for
 * convert_barretenberg_frs_to_grumpkin_fr.
 *
 * @param field_val
 * @return std::array<uint64_t, 2>
 */
std::array<uint64_t, 2> decompose_bn254_fr_to_two_limbs(const bb::fr& field_val)
{
    ASSERT(uint256_t(field_val) < (uint256_t(1) << (2 * NUM_CONVERSION_LIMB_BITS))); // should be 128 bits or less
    constexpr uint256_t LIMB_MASK =
        (uint256_t(1) << NUM_CONVERSION_LIMB_BITS) - 1; // split bn254_fr into two 64 bit limbs
    const uint256_t value = field_val;
    const uint64_t low = static_cast<uint64_t>(value & LIMB_MASK);
    const uint64_t hi = static_cast<uint64_t>(value >> NUM_CONVERSION_LIMB_BITS);
    ASSERT(static_cast<uint256_t>(low) + (static_cast<uint256_t>(hi) << NUM_CONVERSION_LIMB_BITS) == value);

    return std::array<uint64_t, 2>{ low, hi };
}

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
    ASSERT(uint256_t(low_bits_in) < (uint256_t(1) << (NUM_CONVERSION_LIMB_BITS * 2)));
    ASSERT(uint256_t(high_bits_in) < (uint256_t(1) << (NUM_CONVERSION_LIMB_BITS * 2)));
    auto low_bit_decomp = decompose_bn254_fr_to_two_limbs(low_bits_in);
    uint256_t tmp;
    tmp.data[0] = low_bit_decomp[0];
    tmp.data[1] = low_bit_decomp[1];
    auto high_bit_decomp = decompose_bn254_fr_to_two_limbs(high_bits_in);
    tmp.data[2] = high_bit_decomp[0];
    tmp.data[3] = high_bit_decomp[1];
    grumpkin::fr result(tmp);
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
    auto tmp = static_cast<uint256_t>(input);
    std::array<bb::fr, 2> result;
    result[0] = static_cast<uint256_t>(tmp.data[0]) + (static_cast<uint256_t>(tmp.data[1]) << NUM_CONVERSION_LIMB_BITS);
    result[1] = static_cast<uint256_t>(tmp.data[2]) + (static_cast<uint256_t>(tmp.data[3]) << NUM_CONVERSION_LIMB_BITS);
    return result;
}

} // namespace bb::field_conversion
