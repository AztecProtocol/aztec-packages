#include "barretenberg/vm2/simulation/alu.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"

#include <cstdint>
#include <memory>

namespace bb::avm2::simulation {

MemoryValue Alu::add(const MemoryValue& a, const MemoryValue& b)
{
    if (a.get_tag() != b.get_tag()) {
        debug("ALU operation failed: ", to_string(AluError::TAG_ERROR), " a: ", a.to_string(), ", b: ", b.to_string());
        events.emit({ .operation = AluOperation::ADD, .a = a, .b = b, .error = AluError::TAG_ERROR });
        throw AluException();
    }
    // TODO(MW): Apart from tags, how can the below fail and how to catch/assign the errors?
    MemoryValue c = a + b;
    events.emit({ .operation = AluOperation::ADD, .a = a, .b = b, .c = c });
    return c;
}

MemoryValue Alu::eq(const MemoryValue& a, const MemoryValue& b)
{
    // Brillig semantic enforces that tags match for EQ.
    if (a.get_tag() != b.get_tag()) {
        events.emit({ .operation = AluOperation::EQ, .a = a, .b = b, .error = AluError::TAG_ERROR });
        debug("ALU operation failed: ", to_string(AluError::TAG_ERROR), " a: ", a.to_string(), ", b: ", b.to_string());
        throw AluException();
    }

    MemoryValue c = MemoryValue::from<uint1_t>(a.as_ff() == b.as_ff() ? 1 : 0);

    events.emit({ .operation = AluOperation::EQ, .a = a, .b = b, .c = c });
    return c;
}

MemoryValue Alu::lt(const MemoryValue& a, const MemoryValue& b)
{
    // Brillig semantic enforces that tags match for LT.
    if (a.get_tag() != b.get_tag()) {
        debug("ALU operation failed: ", to_string(AluError::TAG_ERROR));
        events.emit({ .operation = AluOperation::LT, .a = a, .b = b, .error = AluError::TAG_ERROR });
        throw AluException();
    }
    // NOTE: We cannot do a_ff < b_ff since fields do not have explicit ordering:
    bool res = static_cast<uint256_t>(a.as_ff()) < static_cast<uint256_t>(b.as_ff());
    MemoryValue c = MemoryValue::from<uint1_t>(res);
    // Emit the gt check event required (see lookup FF_GT or INT_GT) - note that we check b > a:
    greater_than.gt(b, a);
    events.emit({ .operation = AluOperation::LT, .a = a, .b = b, .c = c });
    return c;
}

MemoryValue Alu::lte(const MemoryValue& a, const MemoryValue& b)
{
    if (a.get_tag() != b.get_tag()) {
        debug("ALU operation failed: ", to_string(AluError::TAG_ERROR));
        events.emit({ .operation = AluOperation::LTE, .a = a, .b = b, .error = AluError::TAG_ERROR });
        throw AluException();
    }
    // NOTE: We cannot do a_ff <= b_ff since fields do not have explicit ordering:
    bool res = static_cast<uint256_t>(a.as_ff()) <= static_cast<uint256_t>(b.as_ff());
    MemoryValue c = MemoryValue::from<uint1_t>(res);
    // Emit the gt check event required (see lookup FF_GT or INT_GT) - note that we check a > b, and in the circuit
    // check this against !c:
    greater_than.gt(a, b);
    events.emit({ .operation = AluOperation::LTE, .a = a, .b = b, .c = c });
    return c;
}

MemoryValue Alu::op_not(const MemoryValue& a)
{
    if (a.get_tag() == ValueTag::FF) {
        events.emit({ .operation = AluOperation::NOT, .a = a, .error = AluError::TAG_ERROR });
        debug("ALU operation failed: ", to_string(AluError::TAG_ERROR));
        throw AluException();
    }
    MemoryValue b = ~a;
    events.emit({ .operation = AluOperation::NOT, .a = a, .b = b });
    return b;
}

} // namespace bb::avm2::simulation
