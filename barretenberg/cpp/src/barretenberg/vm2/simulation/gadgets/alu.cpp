#include "barretenberg/vm2/simulation/gadgets/alu.hpp"

#include <cstdint>
#include <memory>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/simulation/lib/uint_decomposition.hpp"

namespace bb::avm2::simulation {

MemoryValue Alu::add(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a + b; // This will throw if the tags do not match.
        events.emit({ .operation = AluOperation::ADD, .a = a, .b = b, .c = c });
        return c;
    } catch (const TagMismatchException& e) {
        events.emit({ .operation = AluOperation::ADD, .a = a, .b = b, .error = AluError::TAG_ERROR });
        throw AluException("ADD, " + std::string(e.what()));
    }
}

MemoryValue Alu::sub(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a - b; // This will throw if the tags do not match.
        events.emit({ .operation = AluOperation::SUB, .a = a, .b = b, .c = c });
        return c;
    } catch (const TagMismatchException& e) {
        events.emit({ .operation = AluOperation::SUB, .a = a, .b = b, .error = AluError::TAG_ERROR });
        throw AluException("SUB, " + std::string(e.what()));
    }
}

MemoryValue Alu::mul(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a * b; // This will throw if the tags do not match.
        uint256_t a_int = static_cast<uint256_t>(a.as_ff());
        uint256_t b_int = static_cast<uint256_t>(b.as_ff());
        MemoryTag tag = a.get_tag();
        if (tag == MemoryTag::U128) {
            // For u128, we decompose a and b into 64 bit chunks and discard the highest bits given by the product:
            auto a_decomp = decompose(static_cast<uint128_t>(a.as_ff()));
            auto b_decomp = decompose(static_cast<uint128_t>(b.as_ff()));
            range_check.assert_range(a_decomp.lo, 64);
            range_check.assert_range(a_decomp.hi, 64);
            range_check.assert_range(b_decomp.lo, 64);
            range_check.assert_range(b_decomp.hi, 64);
            auto hi_operand = static_cast<uint256_t>(a_decomp.hi) * static_cast<uint256_t>(b_decomp.hi);
            // c_hi = old_c_hi - a_hi * b_hi % 2^64
            uint256_t c_hi = (((a_int * b_int) >> 128) - hi_operand) % (uint256_t(1) << 64);
            range_check.assert_range(static_cast<uint128_t>(c_hi), 64);
        }
        events.emit({ .operation = AluOperation::MUL, .a = a, .b = b, .c = c });
        return c;
    } catch (const TagMismatchException& e) {
        events.emit({ .operation = AluOperation::MUL, .a = a, .b = b, .error = AluError::TAG_ERROR });
        throw AluException("MUL, " + std::string(e.what()));
    }
}

MemoryValue Alu::div(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a / b; // This will throw if the tags do not match or if we divide by 0.
        MemoryValue remainder = a - c * b;
        MemoryTag tag = a.get_tag();

        if (tag == MemoryTag::FF) {
            // DIV on a field is not a valid operation, but should be recoverable.
            // TODO(MW): cleanup - It comes under the umbrella of tag errors (like NOT) but MemoryValue c = a / b does
            // not throw, so I sin here and throw a not relevant error we know will create a TAG_ERROR:
            throw TagMismatchException("Cannot perform integer division on a field element");
        }

        // Check remainder < b:
        greater_than.gt(b, remainder);
        if (tag == MemoryTag::U128) {
            // For u128, we decompose c and b into 64 bit chunks and discard the highest bits given by the product:
            auto c_decomp = decompose(static_cast<uint128_t>(c.as_ff()));
            auto b_decomp = decompose(static_cast<uint128_t>(b.as_ff()));
            range_check.assert_range(c_decomp.lo, 64);
            range_check.assert_range(c_decomp.hi, 64);
            range_check.assert_range(b_decomp.lo, 64);
            range_check.assert_range(b_decomp.hi, 64);
        }
        events.emit({ .operation = AluOperation::DIV, .a = a, .b = b, .c = c });
        return c;
    } catch (const TagMismatchException& e) {
        events.emit({ .operation = AluOperation::DIV, .a = a, .b = b, .error = AluError::TAG_ERROR });
        throw AluException("DIV, " + std::string(e.what()));
    } catch (const DivisionByZero& e) {
        events.emit({ .operation = AluOperation::DIV, .a = a, .b = b, .error = AluError::DIV_0_ERROR });
        throw AluException("DIV, " + std::string(e.what()));
    }
}

MemoryValue Alu::fdiv(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a / b; // This will throw if the tags do not match or if we divide by 0.

        if (a.get_tag() != MemoryTag::FF) {
            // We cannot reach this case from execution because the tags are forced to be FF (see below*).
            // TODO(MW): cleanup - It comes under the umbrella of tag errors (like NOT) but MemoryValue c = a / b does
            // not throw, so I sin here and throw a not relevant error we know will create a TAG_ERROR:
            throw TagMismatchException("Cannot perform field division on an integer");
        }

        events.emit({ .operation = AluOperation::FDIV, .a = a, .b = b, .c = c });
        return c;
    } catch (const TagMismatchException& e) {
        // *This is unreachable from execution and exists to manage and test tag errors:
        events.emit({ .operation = AluOperation::FDIV, .a = a, .b = b, .error = AluError::TAG_ERROR });
        throw AluException("FDIV, " + std::string(e.what()));
    } catch (const DivisionByZero& e) {
        events.emit({ .operation = AluOperation::FDIV, .a = a, .b = b, .error = AluError::DIV_0_ERROR });
        throw AluException("FDIV, " + std::string(e.what()));
    }
}

MemoryValue Alu::eq(const MemoryValue& a, const MemoryValue& b)
{
    // Brillig semantic enforces that tags match for EQ.
    if (a.get_tag() != b.get_tag()) {
        events.emit({ .operation = AluOperation::EQ, .a = a, .b = b, .error = AluError::TAG_ERROR });
        throw AluException("EQ, Tag mismatch between operands.");
    }

    MemoryValue c = MemoryValue::from<uint1_t>(a == b ? 1 : 0);
    events.emit({ .operation = AluOperation::EQ, .a = a, .b = b, .c = c });
    return c;
}

MemoryValue Alu::lt(const MemoryValue& a, const MemoryValue& b)
{
    // Brillig semantic enforces that tags match for LT.
    // This is special cased because comparison operators do not throw on tag mismatch.
    if (a.get_tag() != b.get_tag()) {
        events.emit({ .operation = AluOperation::LT, .a = a, .b = b, .error = AluError::TAG_ERROR });
        throw AluException("LT, Tag mismatch between operands.");
    }
    // Use the greater_than interface to check if b > a, which is the same as a < b.
    bool res = greater_than.gt(b, a);
    MemoryValue c = MemoryValue::from<uint1_t>(res);
    events.emit({ .operation = AluOperation::LT, .a = a, .b = b, .c = c });
    return c;
}

MemoryValue Alu::lte(const MemoryValue& a, const MemoryValue& b)
{
    // Brillig semantic enforces that tags match for LTE.
    if (a.get_tag() != b.get_tag()) {
        events.emit({ .operation = AluOperation::LTE, .a = a, .b = b, .error = AluError::TAG_ERROR });
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

MemoryValue Alu::op_not(const MemoryValue& a)
{
    try {
        MemoryValue b = ~a; // Throws if the tag is not compatible with NOT operation (i.e. it is an FF type).
        events.emit({ .operation = AluOperation::NOT, .a = a, .b = b });
        return b;
    } catch (const InvalidOperationTag& e) {
        events.emit({ .operation = AluOperation::NOT, .a = a, .error = AluError::TAG_ERROR });
        throw AluException("NOT, " + std::string(e.what()));
    }
}

MemoryValue Alu::shl(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a << b; // This will throw if the tags do not match or are FF.
        auto tag_bits = get_tag_bits(a.get_tag());
        auto b_num = static_cast<uint128_t>(b.as_ff());

        bool overflow = b_num > tag_bits;
        uint8_t a_lo_bits = overflow ? tag_bits : tag_bits - static_cast<uint8_t>(b_num);
        auto a_lo =
            overflow ? b_num - tag_bits : static_cast<uint128_t>(a.as_ff()) % (static_cast<uint128_t>(1) << a_lo_bits);
        range_check.assert_range(a_lo, a_lo_bits);
        range_check.assert_range(static_cast<uint128_t>(a.as_ff()) >> a_lo_bits,
                                 overflow ? tag_bits : static_cast<uint8_t>(b_num));
        events.emit({ .operation = AluOperation::SHL, .a = a, .b = b, .c = c });
        return c;
    } catch (const TagMismatchException& e) {
        events.emit({ .operation = AluOperation::SHL, .a = a, .b = b, .error = AluError::TAG_ERROR });
        throw AluException("SHL, " + std::string(e.what()));
    } catch (const InvalidOperationTag& e) {
        events.emit({ .operation = AluOperation::SHL, .a = a, .b = b, .error = AluError::TAG_ERROR });
        throw AluException("SHL, " + std::string(e.what()));
    }
}

MemoryValue Alu::shr(const MemoryValue& a, const MemoryValue& b)
{
    try {
        MemoryValue c = a >> b; // This will throw if the tags do not match or are FF.
        auto tag_bits = get_tag_bits(a.get_tag());
        auto b_num = static_cast<uint128_t>(b.as_ff());

        bool overflow = b_num > tag_bits;
        uint8_t a_lo_bits = overflow ? tag_bits : static_cast<uint8_t>(b_num);
        auto a_lo =
            overflow ? b_num - tag_bits : static_cast<uint128_t>(a.as_ff()) % (static_cast<uint128_t>(1) << a_lo_bits);
        range_check.assert_range(a_lo, a_lo_bits);
        range_check.assert_range(static_cast<uint128_t>(a.as_ff()) >> a_lo_bits,
                                 overflow ? tag_bits : tag_bits - static_cast<uint8_t>(b_num));
        events.emit({ .operation = AluOperation::SHR, .a = a, .b = b, .c = c });
        return c;
    } catch (const TagMismatchException& e) {
        events.emit({ .operation = AluOperation::SHR, .a = a, .b = b, .error = AluError::TAG_ERROR });
        throw AluException("SHR, " + std::string(e.what()));
    } catch (const InvalidOperationTag& e) {
        events.emit({ .operation = AluOperation::SHR, .a = a, .b = b, .error = AluError::TAG_ERROR });
        throw AluException("SHR, " + std::string(e.what()));
    } catch (const std::exception& e) {
        // We have some err not handled by TAG_ERROR, so we rethrow back to execution:
        throw e;
    }
}

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
