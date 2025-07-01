#include "barretenberg/vm2/simulation/alu.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

#include <cstdint>
#include <memory>

namespace bb::avm2::simulation {

MemoryValue Alu::add(const MemoryValue& a, const MemoryValue& b)
{
    MemoryValue c;
    try {
        if (a.get_tag() != b.get_tag()) {
            throw AluError::TAG_ERROR;
        }
        // TODO(MW): Apart from tags, how can the below fail and how to catch/assign the errors?
        c = a + b;
        events.emit({ .operation = AluOperation::ADD, .a = a, .b = b, .c = c });
    } catch (AluError e) {
        events.emit({ .operation = AluOperation::ADD, .a = a, .b = b, .c = c, .error = e });
        throw e;
    }
    return c;
}

MemoryValue Alu::lt(const MemoryValue& a, const MemoryValue& b)
{
    std::optional<AluError> error;
    MemoryValue c;
    try {
        if (a.get_tag() != b.get_tag()) {
            throw AluError::TAG_ERROR;
        }
        bool res = a.as_ff() < b.as_ff();
        c = MemoryValue::from<uint1_t>(res);

        if (a.get_tag() != ValueTag::FF) {
            // emit the range check event required (see relation ALU_LT_RESULT):
            range_check.assert_range(res ? (b - a).as<uint128_t>() - 1 : (a - b).as<uint128_t>(),
                                     get_tag_bits(a.get_tag()));
        } else {
            // emit the ff check event required (see lookup FF_LT) - note that we check b > a:
            field_gt.ff_gt(b, a);
        }
    } catch (AluError e) {
        error = e;
    }

    events.emit({ .operation = AluOperation::LT, .a = a, .b = b, .c = c, .error = error });
    return c;
}

} // namespace bb::avm2::simulation
