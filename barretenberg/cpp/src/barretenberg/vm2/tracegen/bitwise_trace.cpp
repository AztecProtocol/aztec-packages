#include "barretenberg/vm2/tracegen/bitwise_trace.hpp"

#include <array>
#include <cstddef>
#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_bitwise.hpp"

namespace bb::avm2::tracegen {
namespace {

using C = Column;

// Per-limb column handles, indexed by byte position 0..15.
constexpr std::array<C, 16> IA_BYTE = { C::bitwise_ia_byte_0_,  C::bitwise_ia_byte_1_,  C::bitwise_ia_byte_2_,
                                        C::bitwise_ia_byte_3_,  C::bitwise_ia_byte_4_,  C::bitwise_ia_byte_5_,
                                        C::bitwise_ia_byte_6_,  C::bitwise_ia_byte_7_,  C::bitwise_ia_byte_8_,
                                        C::bitwise_ia_byte_9_,  C::bitwise_ia_byte_10_, C::bitwise_ia_byte_11_,
                                        C::bitwise_ia_byte_12_, C::bitwise_ia_byte_13_, C::bitwise_ia_byte_14_,
                                        C::bitwise_ia_byte_15_ };
constexpr std::array<C, 16> IB_BYTE = { C::bitwise_ib_byte_0_,  C::bitwise_ib_byte_1_,  C::bitwise_ib_byte_2_,
                                        C::bitwise_ib_byte_3_,  C::bitwise_ib_byte_4_,  C::bitwise_ib_byte_5_,
                                        C::bitwise_ib_byte_6_,  C::bitwise_ib_byte_7_,  C::bitwise_ib_byte_8_,
                                        C::bitwise_ib_byte_9_,  C::bitwise_ib_byte_10_, C::bitwise_ib_byte_11_,
                                        C::bitwise_ib_byte_12_, C::bitwise_ib_byte_13_, C::bitwise_ib_byte_14_,
                                        C::bitwise_ib_byte_15_ };
constexpr std::array<C, 16> OUTPUT_AND = {
    C::bitwise_output_and_0_,  C::bitwise_output_and_1_,  C::bitwise_output_and_2_,  C::bitwise_output_and_3_,
    C::bitwise_output_and_4_,  C::bitwise_output_and_5_,  C::bitwise_output_and_6_,  C::bitwise_output_and_7_,
    C::bitwise_output_and_8_,  C::bitwise_output_and_9_,  C::bitwise_output_and_10_, C::bitwise_output_and_11_,
    C::bitwise_output_and_12_, C::bitwise_output_and_13_, C::bitwise_output_and_14_, C::bitwise_output_and_15_
};
constexpr std::array<C, 16> OUTPUT_OR = { C::bitwise_output_or_0_,  C::bitwise_output_or_1_,  C::bitwise_output_or_2_,
                                          C::bitwise_output_or_3_,  C::bitwise_output_or_4_,  C::bitwise_output_or_5_,
                                          C::bitwise_output_or_6_,  C::bitwise_output_or_7_,  C::bitwise_output_or_8_,
                                          C::bitwise_output_or_9_,  C::bitwise_output_or_10_, C::bitwise_output_or_11_,
                                          C::bitwise_output_or_12_, C::bitwise_output_or_13_, C::bitwise_output_or_14_,
                                          C::bitwise_output_or_15_ };
constexpr std::array<C, 16> OUTPUT_XOR = {
    C::bitwise_output_xor_0_,  C::bitwise_output_xor_1_,  C::bitwise_output_xor_2_,  C::bitwise_output_xor_3_,
    C::bitwise_output_xor_4_,  C::bitwise_output_xor_5_,  C::bitwise_output_xor_6_,  C::bitwise_output_xor_7_,
    C::bitwise_output_xor_8_,  C::bitwise_output_xor_9_,  C::bitwise_output_xor_10_, C::bitwise_output_xor_11_,
    C::bitwise_output_xor_12_, C::bitwise_output_xor_13_, C::bitwise_output_xor_14_, C::bitwise_output_xor_15_
};

} // namespace

void BitwiseTraceBuilder::process(const simulation::EventEmitterInterface<simulation::BitwiseEvent>::Container& events,
                                  TraceContainer& trace)
{
    // Inverses of small integers, used for the tag error-check helpers. Tag enum values and their
    // pairwise differences are in [0, 6], so [0, 6] suffices (0 and 1 are their own trivial cases).
    static constexpr std::array<FF, 7> precomputed_inverses = [] {
        std::array<FF, 7> inverses{ 0, 1 };
        for (size_t i = 2; i < 7; i++) {
            inverses[i] = FF(i).invert();
        }
        return inverses;
    }();

    // Lambda to map an operation to its op_id selector column.
    const auto get_op_id_column_selector = [](BitwiseOperation op) {
        switch (op) {
        case BitwiseOperation::AND:
            return C::bitwise_sel_and;
        case BitwiseOperation::OR:
            return C::bitwise_sel_or;
        case BitwiseOperation::XOR:
            return C::bitwise_sel_xor;
        default:
            __builtin_unreachable();
        }
    };

    // We do not use any shifted columns so we start at row 0.
    uint32_t row = 0;

    for (const auto& event : events) {
        const auto tag = event.a.get_tag();

        const uint128_t input_a = static_cast<uint128_t>(event.a.as_ff());
        const uint128_t input_b = static_cast<uint128_t>(event.b.as_ff());
        const uint128_t output_c = event.res;

        // Error Handling: tag a is FF or tag a != tag b.
        const bool is_tag_ff = event.a.get_tag() == MemoryTag::FF;
        const bool is_tag_mismatch = event.a.get_tag() != event.b.get_tag();
        // Rely below on MemoryTag::FF being 0.
        static_assert(static_cast<uint8_t>(MemoryTag::FF) == 0);
        const uint8_t tag_a_u8 = static_cast<uint8_t>(event.a.get_tag());
        const uint8_t tag_b_u8 = static_cast<uint8_t>(event.b.get_tag());

        const FF tag_a_inv = precomputed_inverses[tag_a_u8];
        // For tag_a != tag_b: (-x)^(-1) = -x^(-1) for a field element x.
        const FF tag_ab_diff_inv = tag_a_u8 > tag_b_u8 ? precomputed_inverses[tag_a_u8 - tag_b_u8]
                                                       : -precomputed_inverses[tag_b_u8 - tag_a_u8];

        if (is_tag_ff || is_tag_mismatch) {
            // Error row (single row): sel=1, err=1, sel_compute=0.
            trace.set(row,
                      { {
                          { C::bitwise_sel, 1 },
                          { C::bitwise_op_id, static_cast<uint8_t>(event.operation) },
                          { C::bitwise_ia, event.a.as_ff() },
                          { C::bitwise_ib, event.b.as_ff() },
                          { C::bitwise_ic, output_c },
                          { C::bitwise_tag_a, tag_a_u8 },
                          { C::bitwise_tag_b, tag_b_u8 },
                          // tag_c stays 0 (FF) on error
                          { C::bitwise_sel_tag_ff_err, is_tag_ff ? 1 : 0 },
                          { C::bitwise_sel_tag_mismatch_err, is_tag_mismatch ? 1 : 0 },
                          { C::bitwise_err, 1 },
                          { C::bitwise_tag_a_inv, tag_a_inv },
                          { C::bitwise_tag_ab_diff_inv, tag_ab_diff_inv },
                      } });
            row++;
            continue;
        }

        // Compute row: one row processes the whole operation across its byte limbs.
        // (For tag U1 we take only one bit; the byte mask correctly extracts it.)
        const uint8_t len = get_tag_bytes(tag);

        // For SIMD-64 rows the U128 packs two U64 lanes: ia/ib/ic hold lane 0 (low 64 bits) and
        // ia_simd/ib_simd/ic_simd hold lane 1 (high 64 bits). For ordinary rows ia/ib/ic hold the
        // whole value and ia_simd/ib_simd/ic_simd are 0.
        constexpr uint128_t mask_low_64 = (static_cast<uint128_t>(1) << 64) - 1;
        const bool simd = event.simd_64;
        const BitwiseOperation op = event.operation;
        const auto lane0 = [&](uint128_t v) { return simd ? (v & mask_low_64) : v; };
        const auto lane1 = [&](uint128_t v) -> uint128_t { return simd ? (v >> 64) : 0; };

        trace.set(row,
                  { {
                      { C::bitwise_sel, 1 },
                      { C::bitwise_sel_compute, 1 },
                      { C::bitwise_sel_simd_64, simd ? 1 : 0 },
                      { C::bitwise_sel_u16, len >= 2 ? 1 : 0 },
                      { C::bitwise_sel_u32, len >= 4 ? 1 : 0 },
                      { C::bitwise_sel_u64, len >= 8 ? 1 : 0 },
                      { C::bitwise_sel_u128, len >= 16 ? 1 : 0 },
                      { C::bitwise_tag_byte_len, len },
                      { get_op_id_column_selector(op), 1 },
                      { C::bitwise_op_id, static_cast<uint8_t>(op) },
                      { C::bitwise_ia, lane0(input_a) },
                      { C::bitwise_ib, lane0(input_b) },
                      { C::bitwise_ic, lane0(output_c) },
                      { C::bitwise_ia_simd, lane1(input_a) },
                      { C::bitwise_ib_simd, lane1(input_b) },
                      { C::bitwise_ic_simd, lane1(output_c) },
                      { C::bitwise_tag_a, tag_a_u8 },
                      { C::bitwise_tag_b, tag_b_u8 },
                      { C::bitwise_tag_c, tag_a_u8 }, // same as tag_a
                      { C::bitwise_tag_a_inv, tag_a_inv },
                      { C::bitwise_tag_ab_diff_inv, tag_ab_diff_inv },
                  } });

        // Fill the active byte limbs; inactive (high-order) limbs are left at zero.
        for (uint8_t i = 0; i < len; i++) {
            const uint8_t ia_byte = static_cast<uint8_t>(input_a >> (8 * i));
            const uint8_t ib_byte = static_cast<uint8_t>(input_b >> (8 * i));
            trace.set(row,
                      { {
                          { IA_BYTE[i], ia_byte },
                          { IB_BYTE[i], ib_byte },
                          { OUTPUT_AND[i], ia_byte & ib_byte },
                          { OUTPUT_OR[i], ia_byte | ib_byte },
                          { OUTPUT_XOR[i], ia_byte ^ ib_byte },
                      } });
        }
        row++;
    }
}

const InteractionDefinition BitwiseTraceBuilder::interactions =
    InteractionDefinition()
        .add<InteractionType::LookupIntoBitwise, lookup_bitwise_byte_operations_0_settings>(C::precomputed_sel_range_16)
        .add<InteractionType::LookupIntoBitwise, lookup_bitwise_byte_operations_1_settings>(C::precomputed_sel_range_16)
        .add<InteractionType::LookupIntoBitwise, lookup_bitwise_byte_operations_2_settings>(C::precomputed_sel_range_16)
        .add<InteractionType::LookupIntoBitwise, lookup_bitwise_byte_operations_3_settings>(C::precomputed_sel_range_16)
        .add<InteractionType::LookupIntoBitwise, lookup_bitwise_byte_operations_4_settings>(C::precomputed_sel_range_16)
        .add<InteractionType::LookupIntoBitwise, lookup_bitwise_byte_operations_5_settings>(C::precomputed_sel_range_16)
        .add<InteractionType::LookupIntoBitwise, lookup_bitwise_byte_operations_6_settings>(C::precomputed_sel_range_16)
        .add<InteractionType::LookupIntoBitwise, lookup_bitwise_byte_operations_7_settings>(C::precomputed_sel_range_16)
        .add<InteractionType::LookupIntoBitwise, lookup_bitwise_byte_operations_8_settings>(C::precomputed_sel_range_16)
        .add<InteractionType::LookupIntoBitwise, lookup_bitwise_byte_operations_9_settings>(C::precomputed_sel_range_16)
        .add<InteractionType::LookupIntoBitwise, lookup_bitwise_byte_operations_10_settings>(
            C::precomputed_sel_range_16)
        .add<InteractionType::LookupIntoBitwise, lookup_bitwise_byte_operations_11_settings>(
            C::precomputed_sel_range_16)
        .add<InteractionType::LookupIntoBitwise, lookup_bitwise_byte_operations_12_settings>(
            C::precomputed_sel_range_16)
        .add<InteractionType::LookupIntoBitwise, lookup_bitwise_byte_operations_13_settings>(
            C::precomputed_sel_range_16)
        .add<InteractionType::LookupIntoBitwise, lookup_bitwise_byte_operations_14_settings>(
            C::precomputed_sel_range_16)
        .add<InteractionType::LookupIntoBitwise, lookup_bitwise_byte_operations_15_settings>(
            C::precomputed_sel_range_16)
        .add<InteractionType::LookupIntoIndexedByRow, lookup_bitwise_bitw_tag_byte_length_settings>();

} // namespace bb::avm2::tracegen
