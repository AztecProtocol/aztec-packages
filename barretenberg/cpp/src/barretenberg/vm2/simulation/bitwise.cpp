#include "barretenberg/vm2/simulation/bitwise.hpp"

#include <cstdint>
#include <stdexcept>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

namespace bb::avm2::simulation {

MemoryValue Bitwise::and_op(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a & b;
        events.emit({ .operation = BitwiseOperation::AND, .a = a, .b = b, .res = static_cast<uint128_t>(c.as_ff()) });
        return c;
    } catch (const std::exception& e) {
        // We emit an event if we fail, but default the result to 0.
        events.emit({ .operation = BitwiseOperation::AND, .a = a, .b = b, .res = 0 });
        throw BitwiseException("AND, " + std::string(e.what()));
    }
}

MemoryValue Bitwise::or_op(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a | b;
        events.emit({ .operation = BitwiseOperation::OR, .a = a, .b = b, .res = static_cast<uint128_t>(c.as_ff()) });
        return c;
    } catch (const std::exception& e) {
        // We emit an event if we fail, but default the result to 0.
        events.emit({ .operation = BitwiseOperation::OR, .a = a, .b = b, .res = 0 });
        throw BitwiseException("OR, " + std::string(e.what()));
    }
}

MemoryValue Bitwise::xor_op(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a ^ b;
        events.emit({
            .operation = BitwiseOperation::XOR,
            .a = a,
            .b = b,
            .res = static_cast<uint128_t>(c.as_ff()),
        });
        return c;
    } catch (const std::exception& e) {
        // We emit an event if we fail, but default the result to 0.
        events.emit({ .operation = BitwiseOperation::XOR, .a = a, .b = b, .res = 0 });
        throw BitwiseException("XOR, " + std::string(e.what()));
    }
}

} // namespace bb::avm2::simulation
