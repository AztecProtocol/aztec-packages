#include "barretenberg/vm2/simulation/alu.hpp"

#include <cstdint>
#include <memory>

namespace bb::avm2::simulation {

AvmTaggedMemoryWrapper Alu::add(const AvmTaggedMemoryWrapper& a, const AvmTaggedMemoryWrapper& b)
{
    // TODO: check types and tags and propagate.
    // TODO(ilyas): need big switch here for different types, wrapping
    // TODO(ilyas): come up with a better way than a big switch
    AvmTaggedMemoryWrapper c = a + b;

    // TODO: add tags to events.
    events.emit({ .operation = AluOperation::ADD,
                  .a = a.get_memory_value(),
                  .b = b.get_memory_value(),
                  .c = c.get_memory_value() });
    return c;
}

} // namespace bb::avm2::simulation
