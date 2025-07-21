#include "barretenberg/vm2/simulation/alu.hpp"

#include <cstdint>
#include <memory>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

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

MemoryValue Alu::truncate(const FF& a, MemoryTag dst_tag)
{
    const MemoryValue c = MemoryValue::from_tag_truncating(dst_tag, a);

    // Circuit leakage: range check for `mid` value defined by a = ic + mid * 2^dst_tag_bits + hi_128 * 2^128 and
    // mid is (128 - dst_tag_bits) bits.
    bool is_trivial = dst_tag == ValueTag::FF || static_cast<uint256_t>(a) <= get_tag_max_value(dst_tag);
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
