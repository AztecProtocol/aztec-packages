#include "barretenberg/vm2/simulation/bitwise.hpp"

#include <cstdint>

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

AvmTaggedMemoryWrapper Bitwise::and_op(const AvmTaggedMemoryWrapper& a, const AvmTaggedMemoryWrapper& b)
{
    if (a.get_tag() != b.get_tag() || a.get_tag() == MemoryTag::FF) {
        throw std::runtime_error("Cannot AND different types");
    }

    auto c = a & b;
    events.emit({
        .operation = BitwiseOperation::AND,
        .tag = a.get_tag(),
        .a = static_cast<uint128_t>(a.get_memory_value()),
        .b = static_cast<uint128_t>(b.get_memory_value()),
        .res = static_cast<uint128_t>(c.get_memory_value()),
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
