#include "barretenberg/vm2/simulation/gadgets/bitwise.hpp"

#include <cstdint>

#include "barretenberg/common/assert.hpp"
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
        events.emit({
            .operation = BitwiseOperation::AND,
            .a = a,
            .b = b,
            .res = static_cast<uint128_t>(c.as_ff()),
            .simd_64 = false,
        });
        return c;
    } catch (const TaggedValueException& e) {
        events.emit({ .operation = BitwiseOperation::AND, .a = a, .b = b, .res = 0, .simd_64 = false });
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
        events.emit({
            .operation = BitwiseOperation::OR,
            .a = a,
            .b = b,
            .res = static_cast<uint128_t>(c.as_ff()),
            .simd_64 = false,
        });
        return c;
    } catch (const TaggedValueException& e) {
        events.emit({ .operation = BitwiseOperation::OR, .a = a, .b = b, .res = 0, .simd_64 = false });
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
            .simd_64 = false,
        });
        return c;
    } catch (const TaggedValueException& e) {
        events.emit({ .operation = BitwiseOperation::XOR, .a = a, .b = b, .res = 0, .simd_64 = false });
        throw BitwiseException("XOR, " + std::string(e.what()));
    }
}

namespace {

// Pack two U64 lanes (lane 0 = low, lane 1 = high) into a single U128.
MemoryValue pack_lanes_64(const MemoryValue& lo, const MemoryValue& hi)
{
    return MemoryValue::from<uint128_t>(static_cast<uint128_t>(lo.as<uint64_t>()) |
                                        (static_cast<uint128_t>(hi.as<uint64_t>()) << 64));
}

} // namespace

/**
 * @brief Two independent U64 ANDs packed into one U128 sub-trace row (SIMD-64).
 *
 * AND is bit-independent, so the low and high 64-bit lanes do not interact. Emits a single
 * BitwiseEvent with simd_64=true holding the packed U128 operands/result.
 *
 * @return The two U64 results (lane 0, lane 1).
 */
std::pair<MemoryValue, MemoryValue> Bitwise::simd_and_op_64(const MemoryValue& a1,
                                                            const MemoryValue& b1,
                                                            const MemoryValue& a2,
                                                            const MemoryValue& b2)
{
    BB_ASSERT_DEBUG(a1.get_tag() == MemoryTag::U64 && a2.get_tag() == MemoryTag::U64 &&
                        b1.get_tag() == MemoryTag::U64 && b2.get_tag() == MemoryTag::U64,
                    "SIMD-64 AND operands must have U64 tags");

    const MemoryValue a = pack_lanes_64(a1, a2);
    const MemoryValue b = pack_lanes_64(b1, b2);
    const MemoryValue c = a & b;
    const uint128_t res = static_cast<uint128_t>(c.as_ff());
    events.emit({ .operation = BitwiseOperation::AND, .a = a, .b = b, .res = res, .simd_64 = true });
    return { MemoryValue::from<uint64_t>(static_cast<uint64_t>(res)),
             MemoryValue::from<uint64_t>(static_cast<uint64_t>(res >> 64)) };
}

/**
 * @brief Two independent U64 XORs packed into one U128 sub-trace row (SIMD-64). See simd_and_op_64.
 */
std::pair<MemoryValue, MemoryValue> Bitwise::simd_xor_op_64(const MemoryValue& a1,
                                                            const MemoryValue& b1,
                                                            const MemoryValue& a2,
                                                            const MemoryValue& b2)
{
    BB_ASSERT_DEBUG(a1.get_tag() == MemoryTag::U64 && a2.get_tag() == MemoryTag::U64 &&
                        b1.get_tag() == MemoryTag::U64 && b2.get_tag() == MemoryTag::U64,
                    "SIMD-64 XOR operands must have U64 tags");

    const MemoryValue a = pack_lanes_64(a1, a2);
    const MemoryValue b = pack_lanes_64(b1, b2);
    const MemoryValue c = a ^ b;
    const uint128_t res = static_cast<uint128_t>(c.as_ff());
    events.emit({ .operation = BitwiseOperation::XOR, .a = a, .b = b, .res = res, .simd_64 = true });
    return { MemoryValue::from<uint64_t>(static_cast<uint64_t>(res)),
             MemoryValue::from<uint64_t>(static_cast<uint64_t>(res >> 64)) };
}

} // namespace bb::avm2::simulation
