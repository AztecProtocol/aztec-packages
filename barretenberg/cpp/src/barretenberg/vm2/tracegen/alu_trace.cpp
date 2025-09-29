#include "barretenberg/vm2/tracegen/alu_trace.hpp"

#include <cstddef>
#include <cstdint>
#include <ranges>
#include <stdexcept>

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/generated/relations/lookups_alu.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/lib/uint_decomposition.hpp"
#include "barretenberg/vm2/tracegen/lib/instruction_spec.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"

namespace bb::avm2::tracegen {

namespace {

// TODO(MW): Rename to something useful! Helper fn to get operation specific values.
std::vector<std::pair<Column, FF>> get_operation_columns(const simulation::AluEvent& event)
{
    bool is_ff = event.a.get_tag() == MemoryTag::FF;
    bool is_u128 = event.a.get_tag() == MemoryTag::U128;
    bool no_tag_err = event.error != simulation::AluError::TAG_ERROR;
    switch (event.operation) {
    case simulation::AluOperation::ADD:
        return { { Column::alu_sel_op_add, 1 },
                 { Column::alu_op_id, SUBTRACE_INFO_MAP.at(ExecutionOpCode::ADD).subtrace_operation_id },
                 // I think the only situation in which a + b != c as fields is when c overflows the bit size
                 // if this in unclear, I can use > or actually check bit sizes:
                 { Column::alu_cf, event.a.as_ff() + event.b.as_ff() != event.c.as_ff() } };
    case simulation::AluOperation::SUB:
        return { { Column::alu_sel_op_sub, 1 },
                 { Column::alu_op_id, SUBTRACE_INFO_MAP.at(ExecutionOpCode::SUB).subtrace_operation_id },
                 { Column::alu_cf, event.a.as_ff() - event.b.as_ff() != event.c.as_ff() } };
    case simulation::AluOperation::MUL: {
        uint256_t a_int = static_cast<uint256_t>(event.a.as_ff());
        uint256_t b_int = static_cast<uint256_t>(event.b.as_ff());
        // Columns shared for all tags in a MUL:
        std::vector<std::pair<Column, FF>> res = {
            { Column::alu_sel_op_mul, 1 },
            { Column::alu_op_id, SUBTRACE_INFO_MAP.at(ExecutionOpCode::MUL).subtrace_operation_id },
            { Column::alu_constant_64, 64 },
            { Column::alu_sel_is_u128, is_u128 },
            { Column::alu_tag_u128_diff_inv,
              is_u128 ? 0
                      : (FF(static_cast<uint8_t>(event.a.get_tag())) - FF(static_cast<uint8_t>(MemoryTag::U128)))
                            .invert() },
        };
        if (is_u128) {
            // For u128s, we decompose a and b into 64 bit chunks:
            auto a_decomp = simulation::decompose(static_cast<uint128_t>(event.a.as_ff()));
            auto b_decomp = simulation::decompose(static_cast<uint128_t>(event.b.as_ff()));
            // c_hi = old_c_hi - a_hi * b_hi % 2^64
            auto hi_operand = static_cast<uint256_t>(a_decomp.hi) * static_cast<uint256_t>(b_decomp.hi);
            res.insert(res.end(),
                       {
                           { Column::alu_sel_mul_u128, 1 },
                           { Column::alu_sel_mul_div_u128, 1 },
                           { Column::alu_sel_decompose_a, 1 },
                           { Column::alu_a_lo, a_decomp.lo },
                           { Column::alu_a_lo_bits, 64 },
                           { Column::alu_a_hi, a_decomp.hi },
                           { Column::alu_a_hi_bits, 64 },
                           { Column::alu_b_lo, b_decomp.lo },
                           { Column::alu_b_hi, b_decomp.hi },
                           { Column::alu_c_hi, (((a_int * b_int) >> 128) - hi_operand) % (uint256_t(1) << 64) },
                           { Column::alu_cf, hi_operand == 0 ? 0 : 1 },
                       });
        } else {
            // For non-u128s, we just take the top bits of a*b:
            res.insert(res.end(),
                       { { Column::alu_c_hi, is_ff ? 0 : (a_int * b_int) >> get_tag_bits(event.a.get_tag()) } });
        }
        return res;
    }
    case simulation::AluOperation::DIV: {
        bool div_0_error = event.error == simulation::AluError::DIV_0_ERROR;
        auto remainder =
            no_tag_err && !div_0_error ? event.a - event.b * event.c : MemoryValue::from_tag(event.a.get_tag(), 0);
        // Columns shared for all tags in a DIV:
        std::vector<std::pair<Column, FF>> res = {
            { Column::alu_sel_op_div, 1 },
            { Column::alu_op_id, SUBTRACE_INFO_MAP.at(ExecutionOpCode::DIV).subtrace_operation_id },
            { Column::alu_helper1, remainder },
            { Column::alu_constant_64, 64 },
            { Column::alu_sel_is_ff, is_ff },
            { Column::alu_tag_ff_diff_inv,
              is_ff
                  ? 0
                  : (FF(static_cast<uint8_t>(event.a.get_tag())) - FF(static_cast<uint8_t>(MemoryTag::FF))).invert() },
            { Column::alu_sel_is_u128, is_u128 },
            { Column::alu_tag_u128_diff_inv,
              is_u128 ? 0
                      : (FF(static_cast<uint8_t>(event.a.get_tag())) - FF(static_cast<uint8_t>(MemoryTag::U128)))
                            .invert() },
            { Column::alu_b_inv, div_0_error ? 0 : event.b.as_ff().invert() },
            { Column::alu_sel_div_no_0_err, div_0_error ? 0 : 1 },
        };
        if (is_u128) {
            // For u128s, we decompose c and b into 64 bit chunks:
            auto c_decomp = simulation::decompose(static_cast<uint128_t>(event.c.as_ff()));
            auto b_decomp = simulation::decompose(static_cast<uint128_t>(event.b.as_ff()));
            res.insert(res.end(),
                       {
                           { Column::alu_sel_mul_div_u128, 1 },
                           { Column::alu_sel_decompose_a, 1 },
                           { Column::alu_a_lo, c_decomp.lo },
                           { Column::alu_a_lo_bits, 64 },
                           { Column::alu_a_hi, c_decomp.hi },
                           { Column::alu_a_hi_bits, 64 },
                           { Column::alu_b_lo, b_decomp.lo },
                           { Column::alu_b_hi, b_decomp.hi },
                       });
        }
        return res;
    }
    case simulation::AluOperation::FDIV: {
        bool div_0_error = event.error == simulation::AluError::DIV_0_ERROR;
        return {
            { Column::alu_sel_op_fdiv, 1 },
            { Column::alu_op_id, SUBTRACE_INFO_MAP.at(ExecutionOpCode::FDIV).subtrace_operation_id },
            { Column::alu_sel_is_ff, is_ff },
            { Column::alu_tag_ff_diff_inv,
              is_ff
                  ? 0
                  : (FF(static_cast<uint8_t>(event.a.get_tag())) - FF(static_cast<uint8_t>(MemoryTag::FF))).invert() },
            { Column::alu_b_inv, div_0_error ? 0 : event.b.as_ff().invert() },
        };
    }
    case simulation::AluOperation::EQ: {
        const FF diff = event.a.as_ff() - event.b.as_ff();
        return { { Column::alu_sel_op_eq, 1 },
                 { Column::alu_op_id, SUBTRACE_INFO_MAP.at(ExecutionOpCode::EQ).subtrace_operation_id },
                 { Column::alu_helper1, diff == 0 ? 0 : diff.invert() } };
    }
    case simulation::AluOperation::LT:
        return {
            { Column::alu_lt_ops_input_a, event.b },
            { Column::alu_lt_ops_input_b, event.a },
            { Column::alu_lt_ops_result_c, event.c },
            { Column::alu_sel_op_lt, 1 },
            { Column::alu_sel_lt_ops, no_tag_err },
            { Column::alu_op_id,
              static_cast<uint8_t>(SUBTRACE_INFO_MAP.at(ExecutionOpCode::LT).subtrace_operation_id) },
            { Column::alu_sel_is_ff, is_ff },
            { Column::alu_sel_ff_lt_ops, is_ff && no_tag_err },
            { Column::alu_sel_int_lt_ops, !is_ff && no_tag_err },
            { Column::alu_tag_ff_diff_inv,
              is_ff
                  ? 0
                  : (FF(static_cast<uint8_t>(event.a.get_tag())) - FF(static_cast<uint8_t>(MemoryTag::FF))).invert() },
        };
    case simulation::AluOperation::LTE:
        return {
            { Column::alu_lt_ops_input_a, event.a },
            { Column::alu_lt_ops_input_b, event.b },
            { Column::alu_lt_ops_result_c, MemoryValue::from<uint1_t>(event.c.as_ff() == 0 && no_tag_err ? 1 : 0) },
            { Column::alu_sel_op_lte, 1 },
            { Column::alu_sel_lt_ops, no_tag_err },
            { Column::alu_op_id,
              static_cast<uint8_t>(SUBTRACE_INFO_MAP.at(ExecutionOpCode::LTE).subtrace_operation_id) },
            { Column::alu_sel_is_ff, is_ff },
            { Column::alu_sel_ff_lt_ops, is_ff && no_tag_err },
            { Column::alu_sel_int_lt_ops, !is_ff && no_tag_err },
            { Column::alu_tag_ff_diff_inv,
              is_ff
                  ? 0
                  : (FF(static_cast<uint8_t>(event.a.get_tag())) - FF(static_cast<uint8_t>(MemoryTag::FF))).invert() },
        };
    case simulation::AluOperation::NOT: {
        const FF tag_diff = static_cast<uint8_t>(event.a.get_tag()) - static_cast<uint8_t>(MemoryTag::FF);
        return {
            { Column::alu_sel_op_not, 1 },
            { Column::alu_op_id, SUBTRACE_INFO_MAP.at(ExecutionOpCode::NOT).subtrace_operation_id },
            { Column::alu_sel_is_ff, is_ff },
            { Column::alu_tag_ff_diff_inv, is_ff ? 0 : tag_diff.invert() },
        };
    }
    case simulation::AluOperation::SHL: {
        auto a_num = static_cast<uint128_t>(event.a.as_ff());
        auto b_num = static_cast<uint128_t>(event.b.as_ff());
        auto tag_bits = get_tag_bits(event.a.get_tag());
        // Whether we shift by more than the bit size (=> result is 0):
        bool overflow = b_num > tag_bits;
        // The bit size of the low limb of decomposed input a (if overflow, assigned as max_bits to range check
        // b - max_bits):
        auto shift_lo_bits = overflow ? tag_bits : tag_bits - b_num;
        // The low limb of decomposed input a (if overflow, assigned as b - max_bits to range check and
        // prove b > max_bits):
        auto a_lo = overflow ? b_num - tag_bits : a_num % (static_cast<uint128_t>(1) << shift_lo_bits);
        return {
            { Column::alu_sel_op_shl, 1 },
            { Column::alu_sel_shift_ops, 1 },
            { Column::alu_sel_shift_ops_no_overflow, overflow ? 0 : 1 },
            { Column::alu_sel_decompose_a, is_ff ? 0 : 1 },
            { Column::alu_a_lo, a_lo },
            { Column::alu_a_lo_bits, shift_lo_bits },
            { Column::alu_a_hi, a_num >> shift_lo_bits },
            { Column::alu_a_hi_bits, overflow ? tag_bits : b_num },
            { Column::alu_shift_lo_bits, shift_lo_bits },
            { Column::alu_two_pow_shift_lo_bits, static_cast<uint128_t>(1) << shift_lo_bits },
            { Column::alu_sel_is_ff, is_ff },
            { Column::alu_tag_ff_diff_inv,
              is_ff
                  ? 0
                  : (FF(static_cast<uint8_t>(event.a.get_tag())) - FF(static_cast<uint8_t>(MemoryTag::FF))).invert() },
            { Column::alu_op_id, SUBTRACE_INFO_MAP.at(ExecutionOpCode::SHL).subtrace_operation_id },
            { Column::alu_helper1, static_cast<uint128_t>(1) << b_num },
        };
    }
    case simulation::AluOperation::SHR: {
        auto a_num = static_cast<uint128_t>(event.a.as_ff());
        auto b_num = static_cast<uint128_t>(event.b.as_ff());
        auto tag_bits = get_tag_bits(event.a.get_tag());
        // Whether we shift by more than the bit size (=> result is 0):
        bool overflow = b_num > tag_bits;
        // The bit size of the low limb of decomposed input a (if overflow, assigned as max_bits to range check
        // b - max_bits):
        auto shift_lo_bits = overflow ? tag_bits : b_num;
        // The low limb of decomposed input a (if overflow, assigned as b - max_bits to range check and
        // prove b > max_bits):
        auto a_lo = overflow ? b_num - tag_bits : a_num % (static_cast<uint128_t>(1) << shift_lo_bits);
        return {
            { Column::alu_sel_op_shr, 1 },
            { Column::alu_sel_shift_ops, 1 },
            { Column::alu_sel_shift_ops_no_overflow, overflow ? 0 : 1 },
            { Column::alu_sel_decompose_a, is_ff ? 0 : 1 },
            { Column::alu_a_lo, a_lo },
            { Column::alu_a_lo_bits, shift_lo_bits },
            { Column::alu_a_hi, a_num >> shift_lo_bits },
            { Column::alu_a_hi_bits, overflow ? tag_bits : tag_bits - b_num },
            { Column::alu_shift_lo_bits, shift_lo_bits },
            { Column::alu_two_pow_shift_lo_bits, static_cast<uint128_t>(1) << shift_lo_bits },
            { Column::alu_sel_is_ff, is_ff },
            { Column::alu_tag_ff_diff_inv,
              is_ff
                  ? 0
                  : (FF(static_cast<uint8_t>(event.a.get_tag())) - FF(static_cast<uint8_t>(MemoryTag::FF))).invert() },
            { Column::alu_op_id, SUBTRACE_INFO_MAP.at(ExecutionOpCode::SHR).subtrace_operation_id },
        };
    }
    case simulation::AluOperation::TRUNCATE: {
        const uint256_t value = static_cast<uint256_t>(event.a.as_ff());
        const MemoryTag dst_tag = static_cast<MemoryTag>(static_cast<uint8_t>(event.b.as_ff()));
        bool is_trivial = dst_tag == MemoryTag::FF || value <= get_tag_max_value(dst_tag);
        bool is_lt_128 = !is_trivial && value < (static_cast<uint256_t>(1) << 128);
        bool is_gte_128 = !is_trivial && !is_lt_128;
        const uint256_t lo_128 = is_trivial ? 0 : value & ((static_cast<uint256_t>(1) << 128) - 1);
        const uint8_t dst_bits = get_tag_bits(dst_tag);
        const uint256_t mid = is_trivial ? 0 : lo_128 >> dst_bits;

        return {
            { Column::alu_sel_op_truncate, 1 },
            { Column::alu_sel_trunc_trivial, is_trivial },
            { Column::alu_sel_trunc_lt_128, is_lt_128 },
            { Column::alu_sel_trunc_gte_128, is_gte_128 },
            { Column::alu_sel_trunc_non_trivial, !is_trivial },
            { Column::alu_a_lo, lo_128 },
            { Column::alu_a_hi, is_gte_128 ? value >> 128 : 0 },
            { Column::alu_mid, mid },
            { Column::alu_op_id, AVM_EXEC_OP_ID_ALU_TRUNCATE },
            { Column::alu_mid_bits, is_trivial ? 0 : 128 - dst_bits },
        };
    }
    default:
        throw std::runtime_error("Unknown ALU operation");
        break;
    }
}

std::vector<std::pair<Column, FF>> get_tag_error_columns(const simulation::AluEvent& event)
{
    const MemoryTag a_tag = event.a.get_tag();
    const FF a_tag_ff = static_cast<FF>(static_cast<uint8_t>(a_tag));
    const MemoryTag b_tag = event.b.get_tag();
    const FF b_tag_ff = static_cast<FF>(static_cast<uint8_t>(b_tag));
    // Tag errors currently have cases:
    // 1. Input tagged as a field for NOT or DIV operations
    // 2. Mismatched tags for inputs a and b for all opcodes apart from TRUNC

    // Case 1:
    bool ff_tag_err =
        ((event.a.get_tag() == MemoryTag::FF) &&
         (event.operation == simulation::AluOperation::NOT || event.operation == simulation::AluOperation::DIV ||
          event.operation == simulation::AluOperation::SHL || event.operation == simulation::AluOperation::SHR)) ||
        ((event.a.get_tag() != MemoryTag::FF) && (event.operation == simulation::AluOperation::FDIV));
    // Case 2:
    bool ab_tags_mismatch = (a_tag_ff != b_tag_ff) && (event.operation != simulation::AluOperation::TRUNCATE);
    // Note: both cases can occur at the same time. Case 1 only requires sel_tag_error to be on, so we
    // check ab_tags_mismatch first:
    if (ab_tags_mismatch) {
        return { { Column::alu_sel_tag_err, 1 },
                 { Column::alu_sel_ab_tag_mismatch, 1 },
                 { Column::alu_ab_tags_diff_inv, (a_tag_ff - b_tag_ff).invert() } };
    }
    if (ff_tag_err) {
        // Note: There is no 'alu_sel_ff_tag_err' because we can handle this with existing selectors:
        // (sel_op_div + sel_op_not) * sel_is_ff
        return { { Column::alu_sel_tag_err, 1 } };
    }
    // We shouldn't have emitted an event with a tag error when one doesn't exist:
    assert(false && "ALU Event emitted with tag error, but none exists");
    return {};
}

} // namespace

void AluTraceBuilder::process(const simulation::EventEmitterInterface<simulation::AluEvent>::Container& events,
                              TraceContainer& trace)
{
    using C = Column;
    using simulation::AluError;

    uint32_t row = 0;
    for (const auto& event : events) {
        // For TRUNCATE, the destination tag is passed through b in the event, but will be
        // set to ia_tag in the ALU subtrace. (See alu.pil for more details.).
        const uint8_t a_tag_u8 = event.operation == simulation::AluOperation::TRUNCATE
                                     ? static_cast<uint8_t>(event.b.as_ff())
                                     : static_cast<uint8_t>(event.a.get_tag());
        const FF b_tag = static_cast<FF>(static_cast<uint8_t>(event.b.get_tag()));
        const FF c_tag = static_cast<FF>(static_cast<uint8_t>(event.c.get_tag()));
        bool tag_check_failed = event.error.has_value() && event.error == AluError::TAG_ERROR;
        if (tag_check_failed) {
            // Tag error specific columns:
            trace.set(row, get_tag_error_columns(event));
        }
        bool div_0_error = event.error.has_value() && event.error == AluError::DIV_0_ERROR;
        if (div_0_error) {
            // TODO(MW): Below needed?
            // Should not emit a divide by 0 error if we are not in DIV or FDIV or have no 0 divisor:
            assert((event.b.as_ff() == FF(0)) &&
                   ((event.operation == simulation::AluOperation::DIV) ||
                    (event.operation == simulation::AluOperation::FDIV)) &&
                   "ALU Event emitted with divide by zero error, but none exists");
        }

        // Operation specific columns:
        trace.set(row, get_operation_columns(event));

        trace.set(row,
                  { {
                      { C::alu_sel, 1 },
                      { C::alu_ia, event.a },
                      { C::alu_ib, event.b },
                      { C::alu_ic, event.c },
                      { C::alu_ia_tag, a_tag_u8 },
                      { C::alu_ib_tag, b_tag },
                      { C::alu_ic_tag, c_tag },
                      { C::alu_max_bits, get_tag_bits(static_cast<MemoryTag>(a_tag_u8)) },
                      { C::alu_max_value, get_tag_max_value(static_cast<MemoryTag>(a_tag_u8)) },
                      { C::alu_sel_div_0_err, div_0_error ? 1 : 0 },
                      { C::alu_sel_err, tag_check_failed || div_0_error ? 1 : 0 },
                  } });

        row++;
    }
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
        .add<lookup_alu_range_check_mul_u128_c_hi_settings, InteractionType::LookupGeneric>(Column::range_check_sel)
        .add<lookup_alu_gt_div_remainder_settings, InteractionType::LookupGeneric>(Column::gt_sel)
        .add<lookup_alu_ff_gt_settings, InteractionType::LookupGeneric>()
        .add<lookup_alu_int_gt_settings, InteractionType::LookupGeneric>(Column::gt_sel)
        .add<lookup_alu_shifts_two_pow_settings, InteractionType::LookupIntoIndexedByClk>()
        .add<lookup_alu_range_check_trunc_mid_settings, InteractionType::LookupGeneric>(Column::range_check_sel)
        .add<lookup_alu_large_trunc_canonical_dec_settings, InteractionType::LookupGeneric>();
} // namespace bb::avm2::tracegen
