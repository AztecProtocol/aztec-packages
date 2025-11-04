#include "barretenberg/vm2/simulation/gadgets/alu.hpp"

#include <cstdint>
#include <stdexcept>
#include <string>

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/simulation/lib/uint_decomposition.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Add two memory values and emit an event of type AluEvent.
 *
 * @throws AluException if the tags of a and b do not match.
 * @param a The first memory value.
 * @param b The second memory value.
 * @return The sum of the two memory values. (same tag as a and b)
 */
MemoryValue Alu::add(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a + b; // This will throw if the tags do not match.
        events.emit({ .operation = AluOperation::ADD, .a = a, .b = b, .c = c });
        return c;
    } catch (const TagMismatchException& e) {
        events.emit({ .operation = AluOperation::ADD, .a = a, .b = b, .error = true });
        throw AluException("ADD, " + std::string(e.what()));
    }
}

/**
 * @brief Subtract two memory values and emit an event of type AluEvent.
 *
 * @throws AluException if the tags of a and b do not match.
 * @param a The first memory value (minuend).
 * @param b The second memory value (subtrahend).
 * @return The difference of the two memory values. (same tag as a and b)
 */
MemoryValue Alu::sub(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a - b; // This will throw if the tags do not match.
        events.emit({ .operation = AluOperation::SUB, .a = a, .b = b, .c = c });
        return c;
    } catch (const TagMismatchException& e) {
        events.emit({ .operation = AluOperation::SUB, .a = a, .b = b, .error = true });
        throw AluException("SUB, " + std::string(e.what()));
    }
}

/**
 * @brief Multiply two memory values and emit an event of type AluEvent.
 *
 * @throws AluException if the tags of a and b do not match.
 * @param a The first memory value.
 * @param b The second memory value.
 * @return The product of the two memory values. (same tag as a and b)
 */
MemoryValue Alu::mul(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a * b; // This will throw if the tags do not match.
        uint256_t a_int = static_cast<uint256_t>(a.as_ff());
        uint256_t b_int = static_cast<uint256_t>(b.as_ff());
        MemoryTag tag = a.get_tag();
        uint256_t c_hi = 0;
        if (tag == MemoryTag::U128) {
            // For u128, we decompose a and b into 64-bit chunks and discard the highest bits given by the product:
            auto a_decomp = decompose_128(static_cast<uint128_t>(a.as_ff()));
            auto b_decomp = decompose_128(static_cast<uint128_t>(b.as_ff()));
            range_check.assert_range(a_decomp.lo, 64);
            range_check.assert_range(a_decomp.hi, 64);
            range_check.assert_range(b_decomp.lo, 64);
            range_check.assert_range(b_decomp.hi, 64);
            uint256_t hi_operand = static_cast<uint256_t>(a_decomp.hi) * static_cast<uint256_t>(b_decomp.hi);
            // c_hi = (old_c_hi - a_hi * b_hi) % 2^64
            // Make use of x % pow_of_two = x & (pow_of_two - 1)
            c_hi = (((a_int * b_int) >> 128) - hi_operand) & static_cast<uint256_t>(MASK_64);
        } else if (tag != MemoryTag::FF) {
            c_hi = (a_int * b_int) >> static_cast<uint256_t>(get_tag_bits(tag));
        }

        range_check.assert_range(static_cast<uint128_t>(c_hi), 64);
        events.emit({ .operation = AluOperation::MUL, .a = a, .b = b, .c = c });
        return c;
    } catch (const TagMismatchException& e) {
        events.emit({ .operation = AluOperation::MUL, .a = a, .b = b, .error = true });
        throw AluException("MUL, " + std::string(e.what()));
    }
}

/**
 * @brief Divide two memory values and emit an event of type AluEvent.
 *
 * @throws AluException if (in order):
 *        - the tags of a and b do not match
 *        - the divisor (b) zero
 *        - both a and b are field elements
 * @param a The dividend memory value.
 * @param b The divisor memory value.
 * @return The quotient of the division. (same tag as a and b)
 */
MemoryValue Alu::div(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a / b; // This will throw if the tags do not match or if we divide by 0.
        MemoryValue remainder = a - c * b;
        MemoryTag tag = a.get_tag();

        if (tag == MemoryTag::FF) {
            // DIV on a field is not a valid operation, but should be recoverable.
            // It comes under the umbrella of tag errors (like NOT) but MemoryValue c = a / b does
            // not throw.
            events.emit({ .operation = AluOperation::DIV, .a = a, .b = b, .error = true });
            throw AluException("DIV, Cannot perform integer division on a field element");
        }

        // Check remainder < b:
        greater_than.gt(b, remainder);
        if (tag == MemoryTag::U128) {
            // For u128, we decompose c and b into 64 bit chunks and discard the highest bits given by the product:
            auto c_decomp = decompose_128(static_cast<uint128_t>(c.as_ff()));
            auto b_decomp = decompose_128(static_cast<uint128_t>(b.as_ff()));
            range_check.assert_range(c_decomp.lo, 64);
            range_check.assert_range(c_decomp.hi, 64);
            range_check.assert_range(b_decomp.lo, 64);
            range_check.assert_range(b_decomp.hi, 64);
        }
        events.emit({ .operation = AluOperation::DIV, .a = a, .b = b, .c = c });
        return c;
    } catch (const TagMismatchException& e) {
        events.emit({ .operation = AluOperation::DIV, .a = a, .b = b, .error = true });
        throw AluException("DIV, " + std::string(e.what()));
    } catch (const DivisionByZero& e) {
        events.emit({ .operation = AluOperation::DIV, .a = a, .b = b, .error = true });
        throw AluException("DIV, " + std::string(e.what()));
    }
}

/**
 * @brief Perform field division on two memory values and emit an event of type AluEvent.
 *
 * @throws AluException if (in order):
 *        - the tags of a and b do not match
 *        - the divisor (b) zero
 *        - both a and b are non-field elements
 * @param a The dividend memory value.
 * @param b The divisor memory value.
 * @return The quotient of the field division (field element).
 */
MemoryValue Alu::fdiv(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a / b; // This will throw if the tags do not match or if we divide by 0.

        if (a.get_tag() != MemoryTag::FF) {
            // We cannot reach this case from execution because the tags are forced to be FF (see below*).
            // It comes under the umbrella of tag errors (like NOT) but MemoryValue c = a / b does
            // not throw.
            events.emit({ .operation = AluOperation::FDIV, .a = a, .b = b, .error = true });
            throw AluException("FDIV, Cannot perform field division on an integer");
        }

        events.emit({ .operation = AluOperation::FDIV, .a = a, .b = b, .c = c });
        return c;
    } catch (const TagMismatchException& e) {
        // *This is unreachable from execution and exists to manage and test tag errors:
        events.emit({ .operation = AluOperation::FDIV, .a = a, .b = b, .error = true });
        throw AluException("FDIV, " + std::string(e.what()));
    } catch (const DivisionByZero& e) {
        events.emit({ .operation = AluOperation::FDIV, .a = a, .b = b, .error = true });
        throw AluException("FDIV, " + std::string(e.what()));
    }
}

/**
 * @brief Check if two memory values are equal and emit an event of type AluEvent.
 *
 * @throws AluException if the tags of a and b do not match.
 * @param a The first memory value.
 * @param b The second memory value.
 * @return A boolean memory value (1 if equal, 0 if not equal).
 */
MemoryValue Alu::eq(const MemoryValue& a, const MemoryValue& b)
{
    // Brillig semantic enforces that tags match for EQ.
    if (a.get_tag() != b.get_tag()) {
        events.emit({ .operation = AluOperation::EQ, .a = a, .b = b, .error = true });
        throw AluException("EQ, Tag mismatch between operands.");
    }

    MemoryValue c = MemoryValue::from<uint1_t>(a == b ? 1 : 0);
    events.emit({ .operation = AluOperation::EQ, .a = a, .b = b, .c = c });
    return c;
}

/**
 * @brief Check if the first memory value is less than the second and emit an event of type AluEvent.
 *
 * @throws AluException if the tags of a and b do not match.
 * @param a The first memory value.
 * @param b The second memory value.
 * @return A boolean memory value (1 if a < b, 0 otherwise).
 */
MemoryValue Alu::lt(const MemoryValue& a, const MemoryValue& b)
{
    // Brillig semantic enforces that tags match for LT.
    // This is special cased because comparison operators do not throw on tag mismatch.
    if (a.get_tag() != b.get_tag()) {
        events.emit({ .operation = AluOperation::LT, .a = a, .b = b, .error = true });
        throw AluException("LT, Tag mismatch between operands.");
    }
    // Use the greater_than interface to check if b > a, which is the same as a < b.
    bool res = greater_than.gt(b, a);
    MemoryValue c = MemoryValue::from<uint1_t>(res);
    events.emit({ .operation = AluOperation::LT, .a = a, .b = b, .c = c });
    return c;
}

/**
 * @brief Check if the first memory value is less than or equal to the second and emit an event of type AluEvent.
 *
 * @throws AluException if the tags of a and b do not match.
 * @param a The first memory value.
 * @param b The second memory value.
 * @return A boolean memory value (1 if a <= b, 0 otherwise).
 */
MemoryValue Alu::lte(const MemoryValue& a, const MemoryValue& b)
{
    // Brillig semantic enforces that tags match for LTE.
    if (a.get_tag() != b.get_tag()) {
        events.emit({ .operation = AluOperation::LTE, .a = a, .b = b, .error = true });
        throw AluException("LT, Tag mismatch between operands.");
    }
    // Note: the result of LTE is the opposite of GT
    // Use the greater_than interface to check if a > b
    bool res = greater_than.gt(a, b);
    // The result of LTE is the opposite of the result of GT
    MemoryValue c = MemoryValue::from<uint1_t>(!res);
    events.emit({ .operation = AluOperation::LTE, .a = a, .b = b, .c = c });
    return c;
}

/**
 * @brief Perform bitwise NOT operation on a memory value and emit an event of type AluEvent.
 *
 * @throws AluException for field elements.
 * @param a The memory value to negate.
 * @return The bitwise NOT of the memory value (same tag as a).
 */
MemoryValue Alu::op_not(const MemoryValue& a)
{
    try {
        MemoryValue b = ~a; // Throws if the tag is not compatible with NOT operation (i.e. it is an FF type).
        events.emit({ .operation = AluOperation::NOT, .a = a, .b = b });
        return b;
    } catch (const InvalidOperationTag& e) {
        events.emit({ .operation = AluOperation::NOT, .a = a, .error = true });
        throw AluException("NOT, " + std::string(e.what()));
    }
}

/**
 * @brief Perform left shift operation on a memory value and emit an event of type AluEvent.
 *
 * @throws AluException if the tags (in order):
 *        - do not match
 *        - both a and b are field elements
 * @param a The memory value to shift.
 * @param b The number of positions to shift left.
 * @return The result of the left shift operation (same tag as a and b).
 */
MemoryValue Alu::shl(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a << b; // This will throw if the tags do not match or are FF.
        uint128_t a_num = static_cast<uint128_t>(a.as_ff());
        uint128_t b_num = static_cast<uint128_t>(b.as_ff());
        uint128_t max_bits = static_cast<uint128_t>(get_tag_bits(a.get_tag()));

        bool overflow = b_num > max_bits;
        uint128_t a_lo_bits = overflow ? max_bits : max_bits - b_num;
        // We cast to uint256_t to be sure that the shift 1 << a_lo_bits has a defined behaviour.
        // 1 << 128 is undefined behavior on uint128_t.
        const uint128_t mask =
            static_cast<uint128_t>((static_cast<uint256_t>(1) << uint256_t::from_uint128(a_lo_bits)) - 1);
        // Make use of x % pow_of_two = x & (pow_of_two - 1)
        uint128_t a_lo = overflow ? b_num - max_bits : a_num & mask;
        uint128_t a_hi = a_lo_bits >= 128 ? 0 : a_num >> a_lo_bits; // 128-bit shift undefined behaviour guard.
        uint128_t a_hi_bits = overflow ? max_bits : b_num;

        range_check.assert_range(a_lo, static_cast<uint8_t>(a_lo_bits));
        range_check.assert_range(a_hi, static_cast<uint8_t>(a_hi_bits));
        events.emit({ .operation = AluOperation::SHL, .a = a, .b = b, .c = c });
        return c;
    } catch (const TagMismatchException& e) {
        events.emit({ .operation = AluOperation::SHL, .a = a, .b = b, .error = true });
        throw AluException("SHL, " + std::string(e.what()));
    } catch (const InvalidOperationTag& e) {
        events.emit({ .operation = AluOperation::SHL, .a = a, .b = b, .error = true });
        throw AluException("SHL, " + std::string(e.what()));
    }
}

/**
 * @brief Perform right shift operation on a memory value and emit an event of type AluEvent.
 *
 * @throws AluException if the tags (in order):
 *        - do not match
 *        - both a and b are field elements
 * @param a The memory value to shift.
 * @param b The number of positions to shift right.
 * @return The result of the right shift operation (same tag as a and b).
 */
MemoryValue Alu::shr(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a >> b; // This will throw if the tags do not match or are FF.
        uint128_t a_num = static_cast<uint128_t>(a.as_ff());
        uint128_t b_num = static_cast<uint128_t>(b.as_ff());
        uint128_t max_bits = static_cast<uint128_t>(get_tag_bits(a.get_tag()));

        bool overflow = b_num > max_bits;
        uint128_t a_lo_bits = overflow ? max_bits : b_num;
        // We cast to uint256_t to be sure that the shift 1 << a_lo_bits has a defined behaviour.
        // 1 << 128 is undefined behavior on uint128_t.
        const uint128_t mask =
            static_cast<uint128_t>((static_cast<uint256_t>(1) << uint256_t::from_uint128(a_lo_bits)) - 1);
        // Make use of x % pow_of_two = x & (pow_of_two - 1)
        uint128_t a_lo = overflow ? b_num - max_bits : a_num & mask;
        uint128_t a_hi = a_lo_bits >= 128 ? 0 : a_num >> a_lo_bits; // 128-bit shift undefined behaviour guard.
        uint128_t a_hi_bits = overflow ? max_bits : max_bits - b_num;

        range_check.assert_range(a_lo, static_cast<uint8_t>(a_lo_bits));
        range_check.assert_range(a_hi, static_cast<uint8_t>(a_hi_bits));
        events.emit({ .operation = AluOperation::SHR, .a = a, .b = b, .c = c });
        return c;
    } catch (const TagMismatchException& e) {
        events.emit({ .operation = AluOperation::SHR, .a = a, .b = b, .error = true });
        throw AluException("SHR, " + std::string(e.what()));
    } catch (const InvalidOperationTag& e) {
        events.emit({ .operation = AluOperation::SHR, .a = a, .b = b, .error = true });
        throw AluException("SHR, " + std::string(e.what()));
    }
}

/**
 * @brief Truncate a field element to a specific memory tag and emit an event of type AluEvent.
 *
 * @param a The field element to truncate.
 * @param dst_tag The target memory tag to truncate to.
 * @return The truncated memory value (with tag dst_tag).
 */
MemoryValue Alu::truncate(const FF& a, MemoryTag dst_tag)
{
    const MemoryValue c = MemoryValue::from_tag_truncating(dst_tag, a);

    // Circuit leakage: range check for `mid` value defined by a = ic + mid * 2^dst_tag_bits + hi_128 * 2^128 and
    // mid is (128 - dst_tag_bits) bits.
    bool is_trivial = dst_tag == MemoryTag::FF || static_cast<uint256_t>(a) <= get_tag_max_value(dst_tag);
    if (!is_trivial) {
        uint128_t a_lo = 0;
        if (static_cast<uint256_t>(a) >= (static_cast<uint256_t>(1) << 128)) {
            // Canonical decomposition
            U256Decomposition decomposition = field_gt.canon_dec(a);
            a_lo = decomposition.lo;
        } else {
            a_lo = static_cast<uint128_t>(a);
        }

        // cpp standard on bitwise shifts:
        // "If the value of rhs is negative or is not less than the number of bits in lhs, the behavior is undefined."
        // For this reason, we handle the case where dst_tag is U128 separately as shifting of 128 bits is undefined.
        const uint128_t mid = dst_tag == MemoryTag::U128 ? 0 : a_lo >> get_tag_bits(dst_tag);
        range_check.assert_range(mid, 128 - get_tag_bits(dst_tag));
    }

    // We put dst_tag in b to have correct deduplication and also to encode it in the event.
    // Note however that in alu subtrace, dst_tag will be set in ia_tag.
    events.emit({ .operation = AluOperation::TRUNCATE,
                  .a = MemoryValue::from_tag(MemoryTag::FF, a),
                  .b = MemoryValue::from_tag(MemoryTag::FF, static_cast<uint8_t>(dst_tag)),
                  .c = c });
    return c;
}

} // namespace bb::avm2::simulation
