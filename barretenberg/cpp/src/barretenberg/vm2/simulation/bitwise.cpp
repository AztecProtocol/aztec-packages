#include "barretenberg/vm2/simulation/bitwise.hpp"

#include <cstdint>

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

uint128_t Bitwise::and_op(MemoryTag tag, const uint128_t& a, const uint128_t& b)
{
    const uint128_t c = a & b;

    events.emit({
        .operation = BitwiseOperation::AND,
        .tag = tag,
        .a = a,
        .b = b,
        .res = c,
    });

    return c;
}

uint128_t Bitwise::or_op(MemoryTag tag, const uint128_t& a, const uint128_t& b)
{
    const uint128_t c = a | b;

    events.emit({
        .operation = BitwiseOperation::OR,
        .tag = tag,
        .a = a,
        .b = b,
        .res = c,
    });

    return c;
}

uint128_t Bitwise::xor_op(MemoryTag tag, const uint128_t& a, const uint128_t& b)
{
    const uint128_t c = a ^ b;

    events.emit({
        .operation = BitwiseOperation::XOR,
        .tag = tag,
        .a = a,
        .b = b,
        .res = c,
    });

    return c;
}

} // namespace bb::avm2::simulation