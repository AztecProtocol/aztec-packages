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
        .a = uint256_t::from_uint128(a),
        .b = uint256_t::from_uint128(b),
        .res = uint256_t::from_uint128(c),
    });
}

void Bitwise::or_op(MemoryTag tag, uint128_t a, uint128_t b, uint128_t c)
{
    events.emit({
        .operation = BitwiseOperation::OR,
        .tag = tag,
        .a = uint256_t::from_uint128(a),
        .b = uint256_t::from_uint128(b),
        .res = uint256_t::from_uint128(c),
    });
}

void Bitwise::xor_op(MemoryTag tag, uint128_t a, uint128_t b, uint128_t c)
{
    events.emit({
        .operation = BitwiseOperation::XOR,
        .tag = tag,
        .a = uint256_t::from_uint128(a),
        .b = uint256_t::from_uint128(b),
        .res = uint256_t::from_uint128(c),
    });
}

} // namespace bb::avm2::simulation