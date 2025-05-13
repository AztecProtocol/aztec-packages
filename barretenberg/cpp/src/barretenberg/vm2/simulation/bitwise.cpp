#include "barretenberg/vm2/simulation/bitwise.hpp"

#include <cassert>
#include <cstdint>

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

MemoryValue Bitwise::and_op(const MemoryValue& a, const MemoryValue& b)
{
    // Tag compatibility should be checked at the caller... should it?
    assert(a.get_tag() == b.get_tag());

    MemoryValue c = a & b;

    events.emit({
        .operation = BitwiseOperation::AND,
        .a = a,
        .b = b,
        .res = c,
    });

    return c;
}

MemoryValue Bitwise::or_op(const MemoryValue& a, const MemoryValue& b)
{
    // Tag compatibility should be checked at the caller... should it?
    assert(a.get_tag() == b.get_tag());

    MemoryValue c = a | b;

    events.emit({
        .operation = BitwiseOperation::OR,
        .a = a,
        .b = b,
        .res = c,
    });

    return c;
}

MemoryValue Bitwise::xor_op(const MemoryValue& a, const MemoryValue& b)
{
    // Tag compatibility should be checked at the caller... should it?
    assert(a.get_tag() == b.get_tag());

    MemoryValue c = a ^ b;

    events.emit({
        .operation = BitwiseOperation::XOR,
        .a = a,
        .b = b,
        .res = c,
    });

    return c;
}

} // namespace bb::avm2::simulation
