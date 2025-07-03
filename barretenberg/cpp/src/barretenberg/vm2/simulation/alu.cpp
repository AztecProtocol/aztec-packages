#include "barretenberg/vm2/simulation/alu.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

#include <cstdint>
#include <memory>

namespace bb::avm2::simulation {

MemoryValue Alu::add(const MemoryValue& a, const MemoryValue& b)
{
    MemoryValue c = MemoryValue::from_tag(a.get_tag(), 0); // Initialize c with the same tag as a
    try {
        if (a.get_tag() != b.get_tag()) {
            throw AluError::TAG_ERROR;
        }
        // TODO(MW): Apart from tags, how can the below fail and how to catch/assign the errors?
        c = a + b;
        events.emit({ .operation = AluOperation::ADD, .a = a, .b = b, .c = c });
    } catch (const AluError& e) {
        debug("ALU operation failed: ", to_string(e));
        events.emit({ .operation = AluOperation::ADD, .a = a, .b = b, .c = c, .error = e });
        throw AluException();
    }
    return c;
}

MemoryValue Alu::lt(const MemoryValue& a, const MemoryValue& b)
{
    MemoryValue c = MemoryValue::from<uint1_t>(0); // Initialize c as false
    try {
        if (a.get_tag() != b.get_tag()) {
            throw AluError::TAG_ERROR;
        }
        // TODO(MW): rename
        uint128_t lt_result_to_range_check = 0;
        FF a_ff = a.as_ff();
        FF b_ff = b.as_ff();
        // NOTE: We cannot do a_ff < b_ff since fields do not have explicit ordering:
        bool res = static_cast<uint256_t>(a_ff) < static_cast<uint256_t>(b_ff);
        c = MemoryValue::from<uint1_t>(res);
        // We must split FF and non FF cases:
        if (a.get_tag() == ValueTag::FF) {
            // Emit the ff check event required (see lookup FF_LT) - note that we check b > a:
            field_gt.ff_gt(b, a);
        } else {
            // We have excluded the field case => safe to downcast here for the max 128 bit range check:
            lt_result_to_range_check =
                res ? static_cast<uint128_t>(b_ff - a_ff) - 1 : static_cast<uint128_t>(a_ff - b_ff);
        }
        range_check.assert_range(lt_result_to_range_check, get_tag_bits(a.get_tag()));
        events.emit({ .operation = AluOperation::LT, .a = a, .b = b, .c = c });
    } catch (const AluError& e) {
        debug("ALU operation failed: ", to_string(e));
        events.emit({ .operation = AluOperation::ADD, .a = a, .b = b, .c = c, .error = e });
        throw AluException();
    }
    return c;
}

} // namespace bb::avm2::simulation
