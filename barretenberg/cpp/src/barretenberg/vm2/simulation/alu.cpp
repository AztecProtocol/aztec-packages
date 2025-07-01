#include "barretenberg/vm2/simulation/alu.hpp"

#include <cstdint>
#include <memory>

namespace bb::avm2::simulation {

MemoryValue Alu::add(const MemoryValue& a, const MemoryValue& b)
{
    MemoryValue c;
    try {
        if (a.get_tag() != b.get_tag()) {
            throw AluError::TAG_ERROR;
        }
        // TODO(MW): Apart from tags, how can the below fail and how to catch/assign the errors?
        c = a + b;
        events.emit({ .operation = AluOperation::ADD, .a = a, .b = b, .c = c });
    } catch (AluError e) {
        events.emit({ .operation = AluOperation::ADD, .a = a, .b = b, .c = c, .error = e });
        throw e;
    }
    return c;
}

} // namespace bb::avm2::simulation
