#include "barretenberg/vm2/simulation/alu.hpp"

#include <cstdint>
#include <memory>

namespace bb::avm2::simulation {

MemoryValue Alu::add(const MemoryValue& a, const MemoryValue& b)
{
    // TODO: check types and tags and propagate.
    MemoryValue c = a + b;

    events.emit({ .operation = AluOperation::ADD, .a = a, .b = b, .c = c });
    return c;
}

} // namespace bb::avm2::simulation
