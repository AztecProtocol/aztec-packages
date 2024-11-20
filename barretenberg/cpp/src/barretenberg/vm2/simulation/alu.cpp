#include "barretenberg/vm2/simulation/alu.hpp"

#include <cstdint>
#include <memory>

namespace bb::avm2::simulation {

void Alu::add(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr)
{
    auto& memory = context.get_memory();

    // TODO: check types and tags and propagate.
    auto a = memory.get(a_addr);
    auto b = memory.get(b_addr);
    // TODO: handle different types, wrapping, etc.
    auto c = a.value + b.value;
    memory.set(dst_addr, c, a.tag);

    // TODO: add tags to events.
    events.emit({ .operation = AluOperation::ADD,
                  .a_addr = a_addr,
                  .b_addr = b_addr,
                  .dst_addr = dst_addr,
                  .a = a.value,
                  .b = b.value,
                  .res = c });
}

} // namespace bb::avm2::simulation