#include "barretenberg/vm2/simulation/alu.hpp"

#include <cstdint>
#include <memory>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

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
    // Use the greater_than interface to check if b > a, which is the same as a < b.
    bool res = greater_than.gt(b, a);
    MemoryValue c = MemoryValue::from<uint1_t>(res);
    events.emit({ .operation = AluOperation::LT, .a = a, .b = b, .c = c });
    return c;
}

MemoryValue Alu::lte(const MemoryValue& a, const MemoryValue& b)
{
    // Brillig semantic enforces that tags match for LTE.
    if (a.get_tag() != b.get_tag()) {
        debug("ALU operation failed: ", to_string(AluError::TAG_ERROR));
        events.emit({ .operation = AluOperation::LTE, .a = a, .b = b, .error = AluError::TAG_ERROR });
        throw AluException();
    }
    // Note: the result of LTE is the opposite of GT
    // Use the greater_than interface to check if a > b
    bool res = greater_than.gt(a, b);
    // The result of LTE is the opposite of the result of GT
    MemoryValue c = MemoryValue::from<uint1_t>(!res);
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
