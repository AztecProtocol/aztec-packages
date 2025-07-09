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

MemoryValue Alu::op_not(const MemoryValue& a)
{
    if (a.get_tag() == ValueTag::FF) {
        // Set b to FF(0) as this corresponds to execution.register[1] == 0 and execution.mem_tag_reg[1] == 0 and we
        // need this to have a correct permutation between ALU and Execution. Namely, as we throw an exception, the
        // output in execution trace will all be zero.
        events.emit(
            { .operation = AluOperation::NOT, .a = a, .b = MemoryValue::from<FF>(0), .error = AluError::TAG_ERROR });
        debug("ALU operation failed: ", to_string(AluError::TAG_ERROR));
        throw AluException();
    }
    MemoryValue b = ~a;
    events.emit({ .operation = AluOperation::NOT, .a = a, .b = b });
    return b;
}

} // namespace bb::avm2::simulation
