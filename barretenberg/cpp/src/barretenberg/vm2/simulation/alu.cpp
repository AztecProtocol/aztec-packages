#include "barretenberg/vm2/simulation/alu.hpp"

#include <cstdint>
#include <memory>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

namespace bb::avm2::simulation {

MemoryValue Alu::add(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a + b; // This will throw if the tags do not match.
        events.emit({ .operation = AluOperation::ADD, .a = a, .b = b, .c = c });
        return c;
    } catch (const TagMismatchException& e) {
        events.emit({ .operation = AluOperation::ADD, .a = a, .b = b, .error = AluError::TAG_ERROR });
        throw AluException("ADD, " + std::string(e.what()));
    }
}

MemoryValue Alu::eq(const MemoryValue& a, const MemoryValue& b)
{
    // Brillig semantic enforces that tags match for EQ.
    if (a.get_tag() != b.get_tag()) {
        events.emit({ .operation = AluOperation::EQ, .a = a, .b = b, .error = AluError::TAG_ERROR });
        throw AluException("EQ, Tag mismatch between operands.");
    }

    MemoryValue c = MemoryValue::from<uint1_t>(a == b ? 1 : 0);
    events.emit({ .operation = AluOperation::EQ, .a = a, .b = b, .c = c });
    return c;
}

MemoryValue Alu::lt(const MemoryValue& a, const MemoryValue& b)
{
    // Brillig semantic enforces that tags match for LT.
    // This is special cased because comparison operators do not throw on tag mismatch.
    if (a.get_tag() != b.get_tag()) {
        events.emit({ .operation = AluOperation::LT, .a = a, .b = b, .error = AluError::TAG_ERROR });
        throw AluException("LT, Tag mismatch between operands.");
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
        events.emit({ .operation = AluOperation::LTE, .a = a, .b = b, .error = AluError::TAG_ERROR });
        throw AluException("LT, Tag mismatch between operands.");
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
    try {
        MemoryValue b = ~a; // Throws if the tag is not compatible with NOT operation (i.e. it is an FF type).
        events.emit({ .operation = AluOperation::NOT, .a = a, .b = b });
        return b;
    } catch (const InvalidOperationTag& e) {
        events.emit({ .operation = AluOperation::NOT, .a = a, .error = AluError::TAG_ERROR });
        throw AluException("NOT, " + std::string(e.what()));
    }
}

} // namespace bb::avm2::simulation
