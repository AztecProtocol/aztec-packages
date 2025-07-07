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
    if (a.get_tag() != b.get_tag()) {
        debug("ALU operation failed: ", to_string(AluError::TAG_ERROR), " a: ", a.to_string(), ", b: ", b.to_string());
        events.emit({ .operation = AluOperation::ADD,
                      .a = a,
                      .b = b,
                      .c = MemoryValue::from_tag(a.get_tag(), 0),
                      .error = AluError::TAG_ERROR });
        throw AluException();
    }
    // TODO(MW): Apart from tags, how can the below fail and how to catch/assign the errors?
    MemoryValue c = a + b;
    events.emit({ .operation = AluOperation::ADD, .a = a, .b = b, .c = c });
    return c;
}

MemoryValue Alu::eq(const MemoryValue& a, const MemoryValue& b)
{
    const FF diff = a.as_ff() - b.as_ff();
    MemoryValue c = MemoryValue::from<uint1_t>(diff == 0 ? 1 : 0);

    if (a.get_tag() != b.get_tag()) {
        events.emit({ .operation = AluOperation::EQ, .a = a, .b = b, .c = c, .error = AluError::TAG_ERROR });
        debug("ALU operation failed: ", to_string(AluError::TAG_ERROR), " a: ", a.to_string(), ", b: ", b.to_string());
        throw AluException();
    }

    events.emit({ .operation = AluOperation::EQ, .a = a, .b = b, .c = c });
    return c;
}

MemoryValue Alu::lt(const MemoryValue& a, const MemoryValue& b)
{
    if (a.get_tag() != b.get_tag()) {
        debug("ALU operation failed: ", to_string(AluError::TAG_ERROR));
        events.emit({ .operation = AluOperation::LT,
                      .a = a,
                      .b = b,
                      .c = MemoryValue::from<uint1_t>(0),
                      .error = AluError::TAG_ERROR });
        throw AluException();
    }
    uint128_t lt_abs_diff = 0;
    FF a_ff = a.as_ff();
    FF b_ff = b.as_ff();
    // NOTE: We cannot do a_ff < b_ff since fields do not have explicit ordering:
    bool res = static_cast<uint256_t>(a_ff) < static_cast<uint256_t>(b_ff);
    MemoryValue c = MemoryValue::from<uint1_t>(res);
    // We must split FF and non FF cases:
    if (a.get_tag() == ValueTag::FF) {
        // Emit the ff check event required (see lookup FF_LT) - note that we check b > a:
        field_gt.ff_gt(b, a);
    } else {
        // We have excluded the field case => safe to downcast here for the max 128 bit range check:
        lt_abs_diff = res ? static_cast<uint128_t>(b_ff - a_ff) - 1 : static_cast<uint128_t>(a_ff - b_ff);
    }
    range_check.assert_range(lt_abs_diff, get_tag_bits(a.get_tag()));
    events.emit({ .operation = AluOperation::LT, .a = a, .b = b, .c = c });
    return c;
}

} // namespace bb::avm2::simulation
