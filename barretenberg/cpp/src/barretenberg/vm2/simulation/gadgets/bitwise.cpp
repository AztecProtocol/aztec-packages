#include "barretenberg/vm2/simulation/gadgets/bitwise.hpp"

#include <cstdint>

#include "barretenberg/vm2/common/tagged_value.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Perform bitwise AND on two tagged memory values.
 *
 * On success, emits a BitwiseEvent with the computed result and returns it.
 * On error (FF tag or tag mismatch), emits the event with res=0, then throws.
 *
 * @param a Left operand.
 * @param b Right operand.
 * @return The AND result with the same tag as the inputs.
 * @throws BitwiseException If either tag is FF or tags don't match.
 */
MemoryValue Bitwise::and_op(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a & b;
        events.emit({ .operation = BitwiseOperation::AND, .a = a, .b = b, .res = static_cast<uint128_t>(c.as_ff()) });
        return c;
    } catch (const TaggedValueException& e) {
        events.emit({ .operation = BitwiseOperation::AND, .a = a, .b = b, .res = 0 });
        throw BitwiseException("AND, " + std::string(e.what()));
    }
}

/**
 * @brief Perform bitwise OR on two tagged memory values.
 *
 * On success, emits a BitwiseEvent with the computed result and returns it.
 * On error (FF tag or tag mismatch), emits the event with res=0, then throws.
 *
 * @param a Left operand.
 * @param b Right operand.
 * @return The OR result with the same tag as the inputs.
 * @throws BitwiseException If either tag is FF or tags don't match.
 */
MemoryValue Bitwise::or_op(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a | b;
        events.emit({ .operation = BitwiseOperation::OR, .a = a, .b = b, .res = static_cast<uint128_t>(c.as_ff()) });
        return c;
    } catch (const TaggedValueException& e) {
        events.emit({ .operation = BitwiseOperation::OR, .a = a, .b = b, .res = 0 });
        throw BitwiseException("OR, " + std::string(e.what()));
    }
}

/**
 * @brief Perform bitwise XOR on two tagged memory values.
 *
 * On success, emits a BitwiseEvent with the computed result and returns it.
 * On error (FF tag or tag mismatch), emits the event with res=0, then throws.
 *
 * @param a Left operand.
 * @param b Right operand.
 * @return The XOR result with the same tag as the inputs.
 * @throws BitwiseException If either tag is FF or tags don't match.
 */
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
    } catch (const TaggedValueException& e) {
        events.emit({ .operation = BitwiseOperation::XOR, .a = a, .b = b, .res = 0 });
        throw BitwiseException("XOR, " + std::string(e.what()));
    }
}

} // namespace bb::avm2::simulation
