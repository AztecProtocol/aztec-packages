#include "barretenberg/vm2/simulation/testing/fakes/fake_to_radix.hpp"

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/to_radix.hpp"
#include "barretenberg/vm2/simulation/events/to_radix_event.hpp"

#include <algorithm>
#include <cstdint>
#include <vector>

namespace bb::avm2::simulation {

std::vector<uint8_t> FakeToRadix::to_le_radix(const FF& value, uint32_t num_limbs, uint32_t radix)
{
    uint256_t value_integer = static_cast<uint256_t>(value);
    auto limbs = std::vector<uint8_t>();
    limbs.reserve(num_limbs);

    while (value_integer > 0) {
        limbs.push_back(static_cast<uint8_t>(value_integer % radix));
        value_integer /= radix;
    }

    if (num_limbs > limbs.size()) {
        limbs.insert(limbs.end(), num_limbs - limbs.size(), 0);
    }
    return limbs;
}
std::vector<bool> FakeToRadix::to_le_bits(const FF& value, uint32_t num_limbs)
{
    std::vector<uint8_t> limbs = to_le_radix(value, num_limbs, 2);
    std::vector<bool> bits(limbs.size());

    std::transform(limbs.begin(), limbs.end(), bits.begin(), [](uint8_t val) {
        return val != 0; // Convert nonzero values to `true`, zero to `false`
    });
    return bits;
}

} // namespace bb::avm2::simulation
