#include "barretenberg/vm2/common/to_radix.hpp"

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2 {

namespace {

// The little endian decompositions of Fr modulus into limbs for each radix.
// Radix goes up to 256 so we need 257 decompositions.
std::array<std::vector<uint8_t>, 257> create_p_limbs_per_radix()
{
    std::array<std::vector<uint8_t>, 257> limbs_per_radix;

    for (size_t radix = 2; radix < 257; ++radix) {
        std::vector<uint8_t> p_limbs{};
        p_limbs.reserve(31);
        uint256_t p = FF::modulus;
        while (p > 0) {
            p_limbs.push_back(static_cast<uint8_t>(p % radix));
            p /= radix;
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

} // namespace bb::avm2
