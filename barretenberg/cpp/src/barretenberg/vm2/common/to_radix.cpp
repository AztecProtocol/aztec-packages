#include "barretenberg/vm2/common/to_radix.hpp"

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2 {

namespace {

// The number of limbs that the field modulus, p, decomposes into given a radix.
const std::array<size_t, 257> p_limbs_per_radix_sizes = {
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

// The little endian decompositions of Fr modulus into limbs for each radix.
// Radix goes up to 256 so we need 257 decompositions.
std::array<std::vector<uint8_t>, 257> create_p_limbs_per_radix()
{
    std::array<std::vector<uint8_t>, 257> limbs_per_radix;

    for (size_t radix = 2; radix < 257; ++radix) {
        std::vector<uint8_t> p_limbs{};
        p_limbs.reserve(31);
        uint256_t p = FF::modulus;
        while (p != 0) {
            auto [quotient, remainder] = p.divmod(radix);
            p_limbs.push_back(static_cast<uint8_t>(remainder));
            p = quotient;
        }

        limbs_per_radix[radix] = p_limbs;
    }

    return limbs_per_radix;
}

} // namespace

const std::array<std::vector<uint8_t>, 257>& get_p_limbs_per_radix()
{
    static const std::array<std::vector<uint8_t>, 257> limbs_per_radix = create_p_limbs_per_radix();
    return limbs_per_radix;
}

size_t get_p_limbs_per_radix_size(size_t radix)
{
    assert(radix <= 256);
    return p_limbs_per_radix_sizes[radix];
}

} // namespace bb::avm2
