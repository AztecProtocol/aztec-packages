#include "barretenberg/vm2/simulation/alu.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"

#include <cstdint>
#include <memory>

namespace bb::avm2::simulation {

MemoryValue Alu::add(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a + b; // This will throw if the tags do not match.
        events.emit({ .operation = AluOperation::ADD, .a = a, .b = b, .c = c });
        return c;
    } catch (const TagMismatchException& e) {
        events.emit({ .operation = AluOperation::ADD,
                      .a = a,
                      .b = b,
                      .c = MemoryValue::from_tag(a.get_tag(), 0),
                      .error = AluError::TAG_ERROR });
        throw AluException("ADD, " + std::string(e.what()));
    }
}

MemoryValue Alu::eq(const MemoryValue& a, const MemoryValue& b)
{
    MemoryValue c = MemoryValue::from<uint1_t>(a.as_ff() == b.as_ff() ? 1 : 0);

    // Brillig semantic enforces that tags match for EQ.
    if (a.get_tag() != b.get_tag()) {
        events.emit({ .operation = AluOperation::EQ, .a = a, .b = b, .c = c, .error = AluError::TAG_ERROR });
        throw AluException("EQ, Tag mismatch between operands.");
    }

    events.emit({ .operation = AluOperation::EQ, .a = a, .b = b, .c = c });
    return c;
}

MemoryValue Alu::lt(const MemoryValue& a, const MemoryValue& b)
{
    // Brillig semantic enforces that tags match for LT.
    // This is special cased because comparison operators do not throw on tag mismatch.
    if (a.get_tag() != b.get_tag()) {
        events.emit({ .operation = AluOperation::LT,
                      .a = a,
                      .b = b,
                      .c = MemoryValue::from<uint1_t>(0),
                      .error = AluError::TAG_ERROR });
        throw AluException("LT, Tag mismatch between operands.");
    }

    // We must split FF and non FF cases:
    if (a.get_tag() == ValueTag::FF) {
        // Emit the ff check event required (see lookup FF_LT) - note that we check b > a:
        bool res = field_gt.ff_gt(b, a);

        // This is an artifact of the circuit, we cannot range check > 128bits but in this case get_tag_bits(FF) = 0,
        range_check.assert_range(0, get_tag_bits(a.get_tag()));

        MemoryValue c = MemoryValue::from<uint1_t>(res);
        events.emit({ .operation = AluOperation::LT, .a = a, .b = b, .c = c });
        return c;
    }

    bool res = a < b;
    MemoryValue c = MemoryValue::from<uint1_t>(res);
    FF a_ff = a.as_ff();
    FF b_ff = b.as_ff();

    // This is circuit leakage, we need to range check the absolute difference to ensure that they are 0 < x < 2^tag
    uint128_t lt_abs_diff = res ? static_cast<uint128_t>(b_ff - a_ff) - 1 : static_cast<uint128_t>(a_ff - b_ff);
    range_check.assert_range(lt_abs_diff, get_tag_bits(a.get_tag()));
    events.emit({ .operation = AluOperation::LT, .a = a, .b = b, .c = c });
    return c;
}

} // namespace bb::avm2::simulation
