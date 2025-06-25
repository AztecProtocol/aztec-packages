#include "barretenberg/vm2/simulation/alu.hpp"

#include <cstdint>
#include <memory>

namespace bb::avm2::simulation {

MemoryValue Alu::add(const MemoryValue& a, const MemoryValue& b)
{

    // TODO(MW): make into error
    assert(a.get_tag() == b.get_tag());
    MemoryValue c = a + b;

    events.emit({ .operation = AluOperation::ADD, .a = a, .b = b, .c = c });
    return c;
}

} // namespace bb::avm2::simulation
