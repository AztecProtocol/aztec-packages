#include "barretenberg/vm2/tracegen/alu_trace.hpp"

#include <array>
#include <cstddef>
#include <cstdint>
#include <stdexcept>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_alu.hpp"
#include "barretenberg/vm2/simulation/lib/uint_decomposition.hpp"

namespace bb::avm2::tracegen {

namespace {

/**
 * @brief Get the tag inverse value from a precomputed array where the index is the tag value.
 *
 * @param index The index of the tag in the precomputed array. Range is 0 to NUM_TAGS - 1.
 * @return The inverse of the tag.
 */
const FF& get_tag_inverse(size_t index)
{
    constexpr size_t NUM_TAGS = static_cast<size_t>(MemoryTag::MAX) + 1;
    static const std::array<FF, NUM_TAGS> tag_inverses = []() {
        std::array<FF, NUM_TAGS> inverses;
        for (size_t i = 0; i < NUM_TAGS; i++) {
            inverses.at(i) = FF(i);
        }
        FF::batch_invert(inverses);
        return inverses;
    }();

    return tag_inverses.at(index);
}

/**
 * @brief Get the inverse of the difference between two tags.
 *
 * @param a_tag The first tag.
 * @param b_tag The second tag.
 * @return The inverse of the difference between the two tags. (a_tag - b_tag)^(-1).
 */
FF get_tag_diff_inverse(const MemoryTag a_tag, const MemoryTag b_tag)
{
    if (static_cast<uint8_t>(a_tag) >= static_cast<uint8_t>(b_tag)) {
        return get_tag_inverse(static_cast<uint8_t>(a_tag) - static_cast<uint8_t>(b_tag));
    }

    return -get_tag_inverse(static_cast<uint8_t>(b_tag) - static_cast<uint8_t>(a_tag));
}

/**
 * @brief Get the columns for a given ALU operation. This is used to populate operation specific values in the trace.
 *
 * @param event The ALU event.
 * @return A vector of column-value pairs for the given ALU operation.
 */
std::vector<std::pair<Column, FF>> get_operation_specific_columns(const simulation::AluEvent& event)
{
    const MemoryTag a_tag = event.a.get_tag();
    bool is_ff = a_tag == MemoryTag::FF;
    bool is_u128 = a_tag == MemoryTag::U128;
    bool has_error = event.error;

    switch (event.operation) {
    case simulation::AluOperation::ADD:
        return { { Column::alu_sel_op_add, 1 },
                 { Column::alu_op_id, AVM_EXEC_OP_ID_ALU_ADD },
                 // a + b = cf * 2^(max_bits) + c so cf == 1 iff a + b != c over the integers.
                 // For FF, cf is always 0, therefore we can make the comparison over FF as this field is much larger
                 // than 128 bits.
                 { Column::alu_cf, !has_error && (event.a.as_ff() + event.b.as_ff() != event.c.as_ff()) ? 1 : 0 } };
    case simulation::AluOperation::SUB:
        return { { Column::alu_sel_op_sub, 1 },
                 { Column::alu_op_id, AVM_EXEC_OP_ID_ALU_SUB },
                 // a - b + cf * 2^(max_bits) = c so cf == 1 iff a - b != c over the integers.
                 // For FF, cf is always 0, therefore we can make the comparison over FF as this field is much larger
                 // than 128 bits.
                 { Column::alu_cf, !has_error && (event.a.as_ff() - event.b.as_ff() != event.c.as_ff()) ? 1 : 0 } };
    case simulation::AluOperation::MUL: {
        uint256_t a_int = static_cast<uint256_t>(event.a.as_ff());
        uint256_t b_int = static_cast<uint256_t>(event.b.as_ff());

        // Columns shared for all tags in a MUL:
        std::vector<std::pair<Column, FF>> res = {
            { Column::alu_sel_op_mul, 1 },
            { Column::alu_op_id, AVM_EXEC_OP_ID_ALU_MUL },
            { Column::alu_constant_64, 64 },
            { Column::alu_sel_mul_no_err_non_ff, (has_error || is_ff) ? 0 : 1 },
        };

        if (!has_error) {
            if (is_u128) {
                // For u128s, we decompose a and b into 64 bit chunks:
                auto a_decomp = simulation::decompose_128(static_cast<uint128_t>(a_int));
                auto b_decomp = simulation::decompose_128(static_cast<uint128_t>(b_int));
                // c_hi = (c_hi_full - a_hi * b_hi) % 2^64 (see alu.pil for more details)
                // cf == (c_hi_full - a_hi * b_hi)/2^64
                uint256_t hi_operand = (((a_int * b_int) >> 128) -
                                        static_cast<uint256_t>(a_decomp.hi) * static_cast<uint256_t>(b_decomp.hi));
                res.insert(res.end(),
                           {
                               { Column::alu_sel_mul_div_u128, 1 },
                               { Column::alu_sel_decompose_a, 1 },
                               { Column::alu_a_lo_bits, 64 },
                               { Column::alu_a_hi_bits, 64 },
                               { Column::alu_a_lo, a_decomp.lo },
                               { Column::alu_a_hi, a_decomp.hi },
                               { Column::alu_b_lo, b_decomp.lo },
                               { Column::alu_b_hi, b_decomp.hi },
                               { Column::alu_c_hi, hi_operand & static_cast<uint256_t>(MASK_64) },
                               { Column::alu_cf, hi_operand >> 64 },
                           });
            } else {
                // For non-u128s, we just take the top bits of a*b:
                res.insert(res.end(),
                           { { Column::alu_c_hi,
                               is_ff ? 0 : (a_int * b_int) >> static_cast<uint256_t>(get_tag_bits(a_tag)) } });
            }
        }

        return res;
    }
    case simulation::AluOperation::DIV: {
        // Columns shared for all tags in a DIV:
        std::vector<std::pair<Column, FF>> res = {
            { Column::alu_sel_op_div, 1 },
            { Column::alu_op_id, AVM_EXEC_OP_ID_ALU_DIV },
            { Column::alu_constant_64, 64 },
            { Column::alu_b_inv, event.b.as_ff() }, // Will be inverted in batch later
        };

        if (!has_error) {
            auto remainder = event.a - event.b * event.c;
            res.insert(res.end(),
                       {
                           { Column::alu_sel_div_no_err, 1 },
                           { Column::alu_helper1, remainder.as_ff() },
                           { Column::alu_sel_int_gt, 1 },
                           { Column::alu_gt_input_a, event.b.as_ff() },
                           { Column::alu_gt_input_b, remainder.as_ff() },
                           { Column::alu_gt_result_c, 1 },
                       });
            if (is_u128) {
                // For u128s, we decompose c and b into 64 bit chunks:
                auto c_decomp = simulation::decompose_128(static_cast<uint128_t>(event.c.as_ff()));
                auto b_decomp = simulation::decompose_128(static_cast<uint128_t>(event.b.as_ff()));
                res.insert(res.end(),
                           {
                               { Column::alu_sel_mul_div_u128, 1 },
                               { Column::alu_sel_decompose_a, 1 },
                               { Column::alu_a_lo_bits, 64 },
                               { Column::alu_a_hi_bits, 64 },
                               { Column::alu_a_lo, c_decomp.lo },
                               { Column::alu_a_hi, c_decomp.hi },
                               { Column::alu_b_lo, b_decomp.lo },
                               { Column::alu_b_hi, b_decomp.hi },
                           });
            }
        }
        return res;
    };
    case simulation::AluOperation::FDIV: {
        return {
            { Column::alu_sel_op_fdiv, 1 },
            { Column::alu_op_id, AVM_EXEC_OP_ID_ALU_FDIV },
            { Column::alu_b_inv, event.b.as_ff() }, // Will be inverted in batch later
        };
    }
    case simulation::AluOperation::EQ: {
        const FF diff = event.a.as_ff() - event.b.as_ff();
        return {
            { Column::alu_sel_op_eq, 1 },
            { Column::alu_op_id, AVM_EXEC_OP_ID_ALU_EQ },
            { Column::alu_ab_diff_inv, has_error ? 0 : diff }, // Will be inverted in batch later
        };
    }
    case simulation::AluOperation::LT: {
        // Unconditional columns:
        std::vector<std::pair<Column, FF>> res = {
            { Column::alu_sel_op_lt, 1 },
            { Column::alu_op_id, AVM_EXEC_OP_ID_ALU_LT },
            { Column::alu_gt_input_a, event.b },
            { Column::alu_gt_input_b, event.a },
        };

        // Columns when there is no error:
        if (!has_error) {
            res.insert(res.end(),
                       {
                           { Column::alu_gt_result_c, event.c.as_ff() == 1 ? 1 : 0 },
                           { Column::alu_sel_ff_gt, is_ff ? 1 : 0 },
                           { Column::alu_sel_int_gt, is_ff ? 0 : 1 },
                       });
        }
        return res;
    }
    case simulation::AluOperation::LTE: {
        // Unconditional columns:
        std::vector<std::pair<Column, FF>> res = {
            { Column::alu_sel_op_lte, 1 },
            { Column::alu_op_id, AVM_EXEC_OP_ID_ALU_LTE },
            { Column::alu_gt_input_a, event.a },
            { Column::alu_gt_input_b, event.b },
        };

        // Columns when there is no error:
        if (!has_error) {
            res.insert(res.end(),
                       {
                           { Column::alu_gt_result_c, event.c.as_ff() == 0 ? 1 : 0 },
                           { Column::alu_sel_ff_gt, is_ff ? 1 : 0 },
                           { Column::alu_sel_int_gt, is_ff ? 0 : 1 },
                       });
        }
        return res;
    }
    case simulation::AluOperation::NOT: {
        return {
            { Column::alu_sel_op_not, 1 },
            { Column::alu_op_id, AVM_EXEC_OP_ID_ALU_NOT },
        };
    }
    case simulation::AluOperation::SHL: {
        // Unconditional columns:
        std::vector<std::pair<Column, FF>> res = {
            { Column::alu_sel_op_shl, 1 },
            { Column::alu_op_id, AVM_EXEC_OP_ID_ALU_SHL },
        };

        if (!has_error) {
            uint128_t a_num = static_cast<uint128_t>(event.a.as_ff());
            uint128_t b_num = static_cast<uint128_t>(event.b.as_ff());
            uint128_t max_bits = static_cast<uint128_t>(get_tag_bits(a_tag));
            // Whether we shift by more than the bit size (=> result is 0):
            bool overflow = b_num > max_bits;
            // The bit size of the low limb of decomposed input a (if overflow, assigned as max_bits to range check
            // otherwise b - max_bits):
            uint128_t a_lo_bits = overflow ? max_bits : max_bits - b_num;
            // Cast to uint256_t to be sure that the shift 1 << a_lo_bits is cpp defined behaviour.
            const uint128_t mask =
                static_cast<uint128_t>((static_cast<uint256_t>(1) << uint256_t::from_uint128(a_lo_bits)) - 1);
            // The low limb of decomposed input a (if overflow, assigned as b - max_bits to range check and
            // prove b > max_bits).
            uint128_t a_lo =
                overflow ? b_num - max_bits : a_num & mask; // Make use of x % pow_of_two = x & (pow_of_two - 1)
            uint128_t a_hi = a_lo_bits >= 128 ? 0 : a_num >> a_lo_bits; // 128-bit shift undefined behaviour guard.
            uint128_t a_hi_bits = overflow ? max_bits : b_num;
            res.insert(
                res.end(),
                {
                    { Column::alu_sel_shift_ops_no_overflow, overflow ? 0 : 1 },
                    { Column::alu_sel_decompose_a, 1 },
                    { Column::alu_a_lo, a_lo },
                    { Column::alu_a_lo_bits, a_lo_bits },
                    { Column::alu_a_hi, a_hi },
                    { Column::alu_a_hi_bits, a_hi_bits },
                    { Column::alu_shift_lo_bits, a_lo_bits },
                    { Column::alu_two_pow_shift_lo_bits,
                      overflow ? 0 : static_cast<uint256_t>(1) << uint256_t::from_uint128(a_lo_bits) },
                    { Column::alu_helper1, overflow ? 0 : static_cast<uint256_t>(1) << uint256_t::from_uint128(b_num) },
                });
        }
        return res;
    }
    case simulation::AluOperation::SHR: {
        // Unconditional columns:
        std::vector<std::pair<Column, FF>> res = {
            { Column::alu_sel_op_shr, 1 },
            { Column::alu_op_id, AVM_EXEC_OP_ID_ALU_SHR },
        };

        if (!has_error) {
            uint128_t a_num = static_cast<uint128_t>(event.a.as_ff());
            uint128_t b_num = static_cast<uint128_t>(event.b.as_ff());
            uint8_t max_bits = get_tag_bits(a_tag);
            // Whether we shift by more than the bit size (=> result is 0):
            bool overflow = b_num > max_bits;
            // The bit size of the low limb of decomposed input a (if overflow, assigned as max_bits to range check
            // otherwise b.
            uint8_t a_lo_bits = overflow ? max_bits : static_cast<uint8_t>(b_num);
            // Cast to uint256_t to be sure that the shift 1 << a_lo_bits is cpp defined behaviour.
            const uint128_t mask =
                static_cast<uint128_t>((static_cast<uint256_t>(1) << static_cast<uint256_t>(a_lo_bits)) - 1);
            // The low limb of decomposed input a (if overflow, assigned as b - max_bits to range check and
            // prove b > max_bits).
            uint128_t a_lo =
                overflow ? b_num - max_bits : a_num & mask; // Make use of x % pow_of_two = x & (pow_of_two - 1)
            uint128_t a_hi = a_lo_bits >= 128 ? 0 : a_num >> a_lo_bits; // 128-bit shift undefined behaviour guard.
            uint128_t a_hi_bits = overflow ? max_bits : max_bits - b_num;
            res.insert(res.end(),
                       {
                           { Column::alu_sel_shift_ops_no_overflow, overflow ? 0 : 1 },
                           { Column::alu_sel_decompose_a, 1 },
                           { Column::alu_a_lo, a_lo },
                           { Column::alu_a_lo_bits, a_lo_bits },
                           { Column::alu_a_hi, a_hi },
                           { Column::alu_a_hi_bits, a_hi_bits },
                           { Column::alu_shift_lo_bits, a_lo_bits },
                           { Column::alu_two_pow_shift_lo_bits,
                             overflow ? 0 : static_cast<uint256_t>(1) << uint256_t::from_uint128(a_lo_bits) },
                       });
        }
        return res;
    }
    case simulation::AluOperation::TRUNCATE: {
        const uint256_t value = static_cast<uint256_t>(event.a.as_ff());
        const MemoryTag dst_tag = static_cast<MemoryTag>(static_cast<uint8_t>(event.b.as_ff()));
        bool is_trivial = dst_tag == MemoryTag::FF || value <= get_tag_max_value(dst_tag);
        bool is_lt_128 = !is_trivial && value < (static_cast<uint256_t>(1) << 128);
        bool is_gte_128 = !is_trivial && !is_lt_128;
        // Make use of x % pow_of_two = x & (pow_of_two - 1)
        const uint256_t lo_128 = is_trivial ? 0 : value & MASK_128;
        const uint8_t dst_bits = get_tag_bits(dst_tag);
        const uint256_t mid = is_trivial ? 0 : lo_128 >> static_cast<uint256_t>(dst_bits);

        return {
            { Column::alu_sel_op_truncate, 1 },
            { Column::alu_op_id, AVM_EXEC_OP_ID_ALU_TRUNCATE },
            { Column::alu_sel_trunc_trivial, is_trivial ? 1 : 0 },
            { Column::alu_sel_trunc_lt_128, is_lt_128 ? 1 : 0 },
            { Column::alu_sel_trunc_gte_128, is_gte_128 ? 1 : 0 },
            { Column::alu_sel_trunc_non_trivial, is_trivial ? 0 : 1 },
            { Column::alu_a_lo, lo_128 },
            { Column::alu_mid, mid },
            { Column::alu_mid_bits, is_trivial ? 0 : 128 - dst_bits },
        };
    }
    default:
        throw std::runtime_error("Unknown ALU operation");
        break;
    }
}

/**
 * @brief Get the error columns for a given ALU event. This is used to populate error specific values in the trace.
 *        We consider the following errors simultaneously:
 *        Tag errors:
 *          1. Input tagged as a field for NOT, SHL, SHR, DIV operations or non-field for FDIV.
 *          2. Mismatched tags for inputs a and b for all opcodes apart from TRUNC
 *        Division by zero errors:
 *          3. DIV or FDIV operation with b = 0
 *
 * @param event The ALU event.
 * @return A vector of column-value pairs for the error columns.
 */
std::vector<std::pair<Column, FF>> get_error_columns(const simulation::AluEvent& event)
{
    const MemoryTag a_tag = event.a.get_tag();
    const FF a_tag_ff = static_cast<FF>(static_cast<uint8_t>(a_tag));
    const MemoryTag b_tag = event.b.get_tag();
    const FF b_tag_ff = static_cast<FF>(static_cast<uint8_t>(b_tag));

    std::vector<std::pair<Column, FF>> error_columns = {
        { Column::alu_sel_err, 1 },
    };

    // Case 1:
    bool ff_tag_err =
        ((a_tag == MemoryTag::FF) &&
         (event.operation == simulation::AluOperation::NOT || event.operation == simulation::AluOperation::DIV ||
          event.operation == simulation::AluOperation::SHL || event.operation == simulation::AluOperation::SHR)) ||
        ((a_tag != MemoryTag::FF) && (event.operation == simulation::AluOperation::FDIV));

    // Case 2:
    bool ab_tags_mismatch = (a_tag_ff != b_tag_ff) && (event.operation != simulation::AluOperation::TRUNCATE);

    // Case 3:
    bool div_0_error =
        (event.operation == simulation::AluOperation::DIV || event.operation == simulation::AluOperation::FDIV) &&
        event.b.as_ff() == 0;

    if (ab_tags_mismatch || ff_tag_err) {
        error_columns.push_back({ Column::alu_sel_tag_err, 1 });
        // Note: There is no 'alu_sel_ff_tag_err' because we can handle this with existing selectors:
        // (sel_op_div + sel_op_not) * sel_is_ff
    }

    if (ab_tags_mismatch) {
        error_columns.push_back({ Column::alu_sel_ab_tag_mismatch, 1 });
        error_columns.push_back({ Column::alu_ab_tags_diff_inv, get_tag_diff_inverse(a_tag, b_tag) });
    }

    if (div_0_error) {
        error_columns.push_back({ Column::alu_sel_div_0_err, 1 });
    }

    // We shouldn't have emitted an event with an error when one doesn't exist:
    BB_ASSERT(error_columns.size() != 1, "ALU Event emitted with an error, but none exists");

    return error_columns;
}

} // namespace

/**
 * @brief Process the ALU events and populate the ALU relevant columns in the trace.
 *
 * @param events The container of ALU events to process.
 * @param trace The trace container.
 */
void AluTraceBuilder::process(const simulation::EventEmitterInterface<simulation::AluEvent>::Container& events,
                              TraceContainer& trace)
{
    // We rely on this for NOT opcode, where b's tag is set to 0 (FF) when a is of FF type.
    static_assert(static_cast<uint8_t>(MemoryTag::FF) == 0);

    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {
        // For TRUNCATE, the destination tag is passed through b in the event, but will be
        // set to ia_tag in the ALU subtrace. (See alu.pil for more details.).
        const MemoryTag a_tag = event.operation == simulation::AluOperation::TRUNCATE
                                    ? static_cast<MemoryTag>(static_cast<uint8_t>(event.b.as_ff()))
                                    : event.a.get_tag();
        const FF b_tag = static_cast<FF>(static_cast<uint8_t>(event.b.get_tag()));
        const FF c_tag = static_cast<FF>(static_cast<uint8_t>(event.c.get_tag()));

        if (event.error) {
            trace.set(row, get_error_columns(event));
        }

        // Operation specific columns:
        trace.set(row, get_operation_specific_columns(event));

        // For TRUNCATE, we set b to 0 as the destination tag is passed through b in the event, but will be
        // set to ia_tag in the ALU subtrace. (See alu.pil for more details.).
        // Note that setting b to 0 is not required to satisfy the relations but makes the trace cleaner.
        const FF b_ff = event.operation != simulation::AluOperation::TRUNCATE ? event.b.as_ff() : 0;

        trace.set(row,
                  { {
                      { C::alu_sel, 1 },
                      { C::alu_ia, event.a },
                      { C::alu_ib, b_ff },
                      { C::alu_ic, event.c },
                      { C::alu_ia_tag, static_cast<uint8_t>(a_tag) },
                      { C::alu_ib_tag, b_tag },
                      { C::alu_ic_tag, c_tag },
                      { C::alu_max_bits, get_tag_bits(a_tag) },
                      { C::alu_max_value, get_tag_max_value(a_tag) },
                      { Column::alu_sel_is_ff, a_tag == MemoryTag::FF ? 1 : 0 },
                      { Column::alu_tag_ff_diff_inv, get_tag_diff_inverse(a_tag, MemoryTag::FF) },
                      { Column::alu_sel_is_u128, a_tag == MemoryTag::U128 ? 1 : 0 },
                      { Column::alu_tag_u128_diff_inv, get_tag_diff_inverse(a_tag, MemoryTag::U128) },
                  } });

        row++;
    }

    // Batch invert the columns.
    trace.invert_columns({ { C::alu_ab_diff_inv, C::alu_b_inv } });
}

const InteractionDefinition AluTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_alu_tag_max_bits_value_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_alu_range_check_decomposition_a_lo_settings, InteractionType::LookupGeneric>(
            Column::range_check_sel)
        .add<lookup_alu_range_check_decomposition_a_hi_settings, InteractionType::LookupGeneric>(
            Column::range_check_sel)
        .add<lookup_alu_range_check_decomposition_b_lo_settings, InteractionType::LookupGeneric>(
            Column::range_check_sel)
        .add<lookup_alu_range_check_decomposition_b_hi_settings, InteractionType::LookupGeneric>(
            Column::range_check_sel)
        .add<lookup_alu_range_check_mul_c_hi_settings, InteractionType::LookupGeneric>(Column::range_check_sel)
        .add<lookup_alu_ff_gt_settings, InteractionType::LookupGeneric>()
        .add<lookup_alu_int_gt_settings, InteractionType::LookupGeneric>(Column::gt_sel)
        .add<lookup_alu_shifts_two_pow_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_alu_range_check_trunc_mid_settings, InteractionType::LookupGeneric>(Column::range_check_sel)
        .add<lookup_alu_large_trunc_canonical_dec_settings, InteractionType::LookupGeneric>();

} // namespace bb::avm2::tracegen
