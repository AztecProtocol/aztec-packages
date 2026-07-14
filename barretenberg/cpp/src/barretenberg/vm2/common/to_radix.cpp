#include "barretenberg/vm2/common/to_radix.hpp"

#include "barretenberg/common/assert.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2 {

namespace {

// The number of limbs that the field modulus, p, decomposes into given a radix.
const std::array<size_t, NUM_RADIXES> p_limbs_per_radix_sizes = {
    0,  0,  254, 161, 127, 110, 99, 91, 85, 81, 77, 74, 71, 69, 67, 65, 64, 63, 61, 60, 59, 58, 57, 57, 56, 55,
    54, 54, 53,  53,  52,  52,  51, 51, 50, 50, 50, 49, 49, 48, 48, 48, 48, 47, 47, 47, 46, 46, 46, 46, 45, 45,
    45, 45, 45,  44,  44,  44,  44, 44, 43, 43, 43, 43, 43, 43, 42, 42, 42, 42, 42, 42, 42, 41, 41, 41, 41, 41,
    41, 41, 41,  41,  40,  40,  40, 40, 40, 40, 40, 40, 40, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 38,
    38, 38, 38,  38,  38,  38,  38, 38, 38, 38, 38, 38, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37,
    37, 37, 36,  36,  36,  36,  36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 35, 35, 35, 35,
    35, 35, 35,  35,  35,  35,  35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 35, 34, 34, 34, 34, 34, 34,
    34, 34, 34,  34,  34,  34,  34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 34, 33, 33,
    33, 33, 33,  33,  33,  33,  33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33,
    33, 33, 33,  33,  33,  33,  33, 33, 33, 33, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32,
};

/**
 * @brief Creates the array of little-endian decompositions of the Fr modulus into limbs for each radix in [2, 256].
 *        Entries at indices 0 and 1 are left empty.
 *
 * @return The NUM_RADIXES-entry array where entry[radix] contains the LE limb decomposition of p for that radix.
 */
std::array<std::vector<uint8_t>, NUM_RADIXES> create_p_limbs_per_radix()
{
    std::array<std::vector<uint8_t>, NUM_RADIXES> limbs_per_radix;

    for (size_t radix = 2; radix < NUM_RADIXES; ++radix) {
        std::vector<uint8_t> p_limbs;
        p_limbs.reserve(p_limbs_per_radix_sizes[radix]);
        uint256_t p = FF::modulus;

        while (p != 0) {
            const auto [quotient, remainder] = p.divmod(static_cast<uint64_t>(radix));
            p_limbs.push_back(static_cast<uint8_t>(remainder));
            p = quotient;
        }

        limbs_per_radix[radix] = p_limbs;
    }

    return limbs_per_radix;
}

} // namespace

/**
 * @brief Gets the p limbs per radix array. Each element is a vector containing the little endian decompositions of Fr
 *        modulus into limbs for each radix. Radix goes up to 256 so we need NUM_RADIXES decompositions.
 *
 * @return A const reference to the lazily-initialized static array of LE p-limb decompositions indexed by radix.
 */
const std::array<std::vector<uint8_t>, NUM_RADIXES>& get_p_limbs_per_radix()
{
    static const std::array<std::vector<uint8_t>, NUM_RADIXES> limbs_per_radix = create_p_limbs_per_radix();
    return limbs_per_radix;
}

/**
 * @brief Gets the number of limbs that the modulus, p, decomposes into for a given radix.
 *
 * @note Asserts that radix <= 256.
 *
 * @param radix The radix to get the number of limbs for. Must be in the range [0, 256]. For 0 and 1, the number of
 * limbs is 0.
 * @return The number of limbs for the given radix.
 */
size_t get_p_limbs_per_radix_size(size_t radix)
{
    BB_ASSERT_LTE(radix, static_cast<decltype(radix)>(256), "Radix out of bounds");
    return p_limbs_per_radix_sizes[radix];
}

} // namespace bb::avm2
