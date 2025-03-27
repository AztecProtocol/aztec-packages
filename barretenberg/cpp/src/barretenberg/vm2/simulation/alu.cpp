#include "barretenberg/vm2/simulation/alu.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

#include <cstdint>
#include <memory>

namespace bb::avm2::simulation {

TaggedValueWrapper Alu::add(TaggedValueWrapper a, TaggedValueWrapper b)
{
    // TODO: check types and tags and propagate.
    // TODO: handle different types, wrapping, etc.
    auto c = a + b;

    // TODO: add tags to events.
    events.emit({ .operation = AluOperation::ADD,
                  .a = a.into_memory_value(),
                  .b = b.into_memory_value(),
                  .res = c.into_memory_value() });

    return c;
}

} // namespace bb::avm2::simulation
