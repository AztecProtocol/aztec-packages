#include "barretenberg/vm2/simulation/bitwise.hpp"

#include <cstdint>
#include <stdexcept>

#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

MemoryValue Bitwise::and_op(const MemoryValue& a, const MemoryValue& b)
{
    try {
        // If either memory tag is FF, we throw an error.
        if (a.get_tag() == ValueTag::FF || b.get_tag() == ValueTag::FF) {
            throw BitwiseTagError::INVALID_FF_TAG;
        }
        // If the memory tags of the inputs are different we throw an error.
        if (a.get_tag() != b.get_tag()) {
            throw BitwiseTagError::TAG_MISMATCH;
        }

        MemoryValue c = a & b;

        events.emit({ .operation = BitwiseOperation::AND, .a = a, .b = b, .res = static_cast<uint128_t>(c.as_ff()) });
        return c;
    } catch (const BitwiseTagError& e) {
        debug("Bitwise AND operation failed: ", to_string(e));
        // We emit an event if we fail, but default the result to 0.
        events.emit({ .operation = BitwiseOperation::OR, .a = a, .b = b, .res = 0 });
        throw BitwiseException();
    }
}

MemoryValue Bitwise::or_op(const MemoryValue& a, const MemoryValue& b)
{
    try {
        // If either memory tag is FF, we throw an error.
        if (a.get_tag() == ValueTag::FF || b.get_tag() == ValueTag::FF) {
            throw BitwiseTagError::INVALID_FF_TAG;
        }
        // If the memory tags of the inputs are different we throw an error.
        if (a.get_tag() != b.get_tag()) {
            throw BitwiseTagError::TAG_MISMATCH;
        }

        MemoryValue c = a | b;

        events.emit({ .operation = BitwiseOperation::OR, .a = a, .b = b, .res = static_cast<uint128_t>(c.as_ff()) });
        return c;
    } catch (const BitwiseTagError& e) {
        debug("Bitwise OR operation failed: ", to_string(e));
        // We emit an event if we fail, but default the result to 0.
        events.emit({ .operation = BitwiseOperation::OR, .a = a, .b = b, .res = 0 });
        throw BitwiseException();
    }
}

MemoryValue Bitwise::xor_op(const MemoryValue& a, const MemoryValue& b)
{
    try {
        // If either memory tag is FF, we throw an error.
        if (a.get_tag() == ValueTag::FF || b.get_tag() == ValueTag::FF) {
            throw BitwiseTagError::INVALID_FF_TAG;
        }
        // If the memory tags of the inputs are different we throw an error.
        if (a.get_tag() != b.get_tag()) {
            throw BitwiseTagError::TAG_MISMATCH;
        }

        MemoryValue c = a ^ b;

        events.emit({
            .operation = BitwiseOperation::XOR,
            .a = a,
            .b = b,
            .res = static_cast<uint128_t>(c.as_ff()),
        });
        return c;
    } catch (const BitwiseTagError& e) {
        debug("Bitwise XOR operation failed: ", to_string(e));
        // We emit an event if we fail, but default the result to 0.
        events.emit({ .operation = BitwiseOperation::OR, .a = a, .b = b, .res = 0 });
        throw BitwiseException();
    }
}

} // namespace bb::avm2::simulation
