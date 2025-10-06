#include "barretenberg/vm2/simulation/standalone/pure_alu.hpp"

#include <cstdint>
#include <stdexcept>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

namespace bb::avm2::simulation {

MemoryValue PureAlu::add(const MemoryValue& a, const MemoryValue& b)
{
    try {
        return a + b; // This will throw if the tags do not match.
    } catch (const TagMismatchException& e) {
        throw AluException("ADD, " + std::string(e.what()));
    }
}

MemoryValue PureAlu::sub(const MemoryValue& a, const MemoryValue& b)
{
    try {
        return a - b; // This will throw if the tags do not match.
    } catch (const TagMismatchException& e) {
        throw AluException("SUB, " + std::string(e.what()));
    }
}

MemoryValue PureAlu::mul(const MemoryValue& a, const MemoryValue& b)
{
    try {
        return a * b; // This will throw if the tags do not match.
    } catch (const TagMismatchException& e) {
        throw AluException("MUL, " + std::string(e.what()));
    }
}

MemoryValue PureAlu::div(const MemoryValue& a, const MemoryValue& b)
{
    try {
        if (a.get_tag() == MemoryTag::FF) {
            // DIV on a field is not a valid operation
            throw TagMismatchException("Cannot perform integer division on a field element");
        }
        return a / b; // This will throw if the tags do not match or if we divide by 0.
    } catch (const TagMismatchException& e) {
        throw AluException("DIV, " + std::string(e.what()));
    } catch (const DivisionByZero& e) {
        throw AluException("DIV, " + std::string(e.what()));
    }
}

MemoryValue PureAlu::fdiv(const MemoryValue& a, const MemoryValue& b)
{
    try {
        if (a.get_tag() != MemoryTag::FF) {
            throw TagMismatchException("Cannot perform field division on an integer");
        }
        return a / b; // This will throw if the tags do not match or if we divide by 0.
    } catch (const TagMismatchException& e) {
        throw AluException("FDIV, " + std::string(e.what()));
    } catch (const DivisionByZero& e) {
        throw AluException("FDIV, " + std::string(e.what()));
    }
}

MemoryValue PureAlu::eq(const MemoryValue& a, const MemoryValue& b)
{
    // Brillig semantic enforces that tags match for EQ.
    if (a.get_tag() != b.get_tag()) {
        throw AluException("EQ, Tag mismatch between operands.");
    }
    return MemoryValue::from<uint1_t>(a == b ? 1 : 0);
}

MemoryValue PureAlu::lt(const MemoryValue& a, const MemoryValue& b)
{
    // Brillig semantic enforces that tags match for LT.
    if (a.get_tag() != b.get_tag()) {
        throw AluException("LT, Tag mismatch between operands.");
    }
    // Use the built-in comparison operators
    bool res = a < b;
    return MemoryValue::from<uint1_t>(res);
}

MemoryValue PureAlu::lte(const MemoryValue& a, const MemoryValue& b)
{
    // Brillig semantic enforces that tags match for LTE.
    if (a.get_tag() != b.get_tag()) {
        throw AluException("LTE, Tag mismatch between operands.");
    }
    // Use the built-in comparison operators
    bool res = a <= b;
    return MemoryValue::from<uint1_t>(res);
}

MemoryValue PureAlu::op_not(const MemoryValue& a)
{
    try {
        return ~a; // Throws if the tag is not compatible with NOT operation (i.e. it is an FF type).
    } catch (const InvalidOperationTag& e) {
        throw AluException("NOT, " + std::string(e.what()));
    }
}

MemoryValue PureAlu::shl(const MemoryValue& a, const MemoryValue& b)
{
    try {
        return a << b; // This will throw if the tags do not match or are FF.
    } catch (const TagMismatchException& e) {
        throw AluException("SHL, " + std::string(e.what()));
    } catch (const InvalidOperationTag& e) {
        throw AluException("SHL, " + std::string(e.what()));
    }
}

MemoryValue PureAlu::shr(const MemoryValue& a, const MemoryValue& b)
{
    try {
        return a >> b; // This will throw if the tags do not match or are FF.
    } catch (const TagMismatchException& e) {
        throw AluException("SHR, " + std::string(e.what()));
    } catch (const InvalidOperationTag& e) {
        throw AluException("SHR, " + std::string(e.what()));
    }
}

MemoryValue PureAlu::truncate(const FF& a, MemoryTag dst_tag)
{
    return MemoryValue::from_tag_truncating(dst_tag, a);
}

} // namespace bb::avm2::simulation
