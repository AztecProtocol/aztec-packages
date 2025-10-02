#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"

#include <cassert>
#include <cstdint>

namespace bb::avm2::simulation {

void RangeCheck::assert_range(uint128_t value, uint8_t num_bits)
{
    assert(num_bits <= 128 && "Range checks aren't supported for bit-sizes > 128");

    events.emit({ .value = value, .num_bits = num_bits });
}

} // namespace bb::avm2::simulation
