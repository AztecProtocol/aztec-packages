#include "barretenberg/vm2/simulation/bitwise.hpp"

#include <cstdint>

namespace bb::avm2::simulation {

// TODO: Retrieving inputs and tag from memory(with error handling) should be performed in common helper routines.

void Bitwise::op_and(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr)
{
    auto& memory = context.get_memory();

    // TODO: check that both tags are equal and non-FF
    auto a = memory.get(a_addr);
    auto b = memory.get(b_addr);

    const auto tag = a.tag;

    const MemoryValue c = uint256_t::from_uint128(static_cast<uint128_t>(a.value) & static_cast<uint128_t>(b.value));
    memory.set(dst_addr, c, tag);
    events.emit({ .operation = BitwiseOperation::AND, .a = a.value, .b = b.value, .tag = tag, .res = c });
}

void Bitwise::op_or(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr)
{
    auto& memory = context.get_memory();

    // TODO: check that both tags are equal and non-FF
    auto a = memory.get(a_addr);
    auto b = memory.get(b_addr);

    const auto tag = a.tag;

    const MemoryValue c = uint256_t::from_uint128(static_cast<uint128_t>(a.value) | static_cast<uint128_t>(b.value));
    memory.set(dst_addr, c, tag);
    events.emit({ .operation = BitwiseOperation::AND, .a = a.value, .b = b.value, .tag = tag, .res = c });
}

void Bitwise::op_xor(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr)
{
    auto& memory = context.get_memory();

    // TODO: check that both tags are equal and non-FF
    auto a = memory.get(a_addr);
    auto b = memory.get(b_addr);

    const auto tag = a.tag;

    const MemoryValue c = uint256_t::from_uint128(static_cast<uint128_t>(a.value) ^ static_cast<uint128_t>(b.value));
    memory.set(dst_addr, c, tag);
    events.emit({ .operation = BitwiseOperation::AND, .a = a.value, .b = b.value, .tag = tag, .res = c });
}

} // namespace bb::avm2::simulation