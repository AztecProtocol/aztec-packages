#include "barretenberg/vm2/simulation/bitwise.hpp"

#include <cstdint>

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

void Bitwise::and_op(MemoryTag tag, uint128_t a, uint128_t b, uint128_t c)
{
    events.emit({
        .operation = BitwiseOperation::AND,
        .tag = tag,
        .a = a,
        .b = b,
        .res = c,
    });
}

void Bitwise::or_op(MemoryTag tag, uint128_t a, uint128_t b, uint128_t c)
{
    events.emit({
        .operation = BitwiseOperation::OR,
        .tag = tag,
        .a = a,
        .b = b,
        .res = c,
    });
}

void Bitwise::xor_op(MemoryTag tag, uint128_t a, uint128_t b, uint128_t c)
{
    events.emit({
        .operation = BitwiseOperation::XOR,
        .tag = tag,
        .a = a,
        .b = b,
        .res = c,
    });
}

} // namespace bb::avm2::simulation