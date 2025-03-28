#include "barretenberg/vm2/simulation/alu.hpp"

#include <cstdint>
#include <memory>

namespace bb::avm2::simulation {

FF Alu::add(const ValueRefAndTag& a, const ValueRefAndTag& b)
{
    // TODO: check types and tags and propagate.
    // TODO(ilyas): need big switch here for different types, wrapping
    // TODO(ilyas): come up with a better way than a big switch
    FF c = a.value + b.value;

    // TODO: add tags to events.
    events.emit({ .operation = AluOperation::ADD, .a = a.value, .b = b.value, .c = c });
    return c;
}

} // namespace bb::avm2::simulation
