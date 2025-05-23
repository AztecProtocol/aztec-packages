#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <memory>
#include <vector>

#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/instr_fetching.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_indexed_by_clk.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::BytecodeTraceBuilder;
using tracegen::LookupIntoDynamicTableGeneric;
using tracegen::LookupIntoDynamicTableSequential;
using tracegen::LookupIntoIndexedByClk;
using tracegen::PrecomputedTraceBuilder;
using tracegen::RangeCheckTraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;

using instr_fetching = instr_fetching<FF>;

using simulation::BytecodeDecompositionEvent;
using simulation::BytecodeId;
using simulation::InstrDeserializationError;
using simulation::Instruction;
using simulation::InstructionFetchingEvent;
using simulation::Operand;
using simulation::RangeCheckEvent;

using instr_abs_diff_positive_lookup = lookup_instr_fetching_instr_abs_diff_positive_relation<FF>;
using pc_abs_diff_positive_lookup = lookup_instr_fetching_pc_abs_diff_positive_relation<FF>;
using wire_instr_spec_lookup = lookup_instr_fetching_wire_instruction_info_relation<FF>;
using bc_decomposition_lookup = lookup_instr_fetching_bytes_from_bc_dec_relation<FF>;
using bytecode_size_bc_decomposition_lookup = lookup_instr_fetching_bytecode_size_from_bc_dec_relation<FF>;
using tag_validation_lookup = lookup_instr_fetching_tag_value_validation_relation<FF>;

using testing::random_bytes;

TEST(InstrFetchingConstrainingTest, EmptyRow)
{
    check_relation<instr_fetching>(testing::empty_trace());
}

// Basic positive test with a hardcoded bytecode for ADD_8
TEST(InstrFetchingConstrainingTest, Add8WithTraceGen)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder builder;
    PrecomputedTraceBuilder precomputed_builder;

    Instruction add_8_instruction = {
        .opcode = WireOpCode::ADD_8,
        .indirect = 3,
        .operands = { Operand::from<uint8_t>(0x34), Operand::from<uint8_t>(0x35), Operand::from<uint8_t>(0x36) },
    };

    std::vector<uint8_t> bytecode = add_8_instruction.serialize();

    builder.process_instruction_fetching({ { .bytecode_id = 1,
                                             .pc = 0,
                                             .instruction = add_8_instruction,
                                             .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } },
                                         trace);
    precomputed_builder.process_misc(trace, trace.get_num_rows()); // Limit to the number of rows we need.

    EXPECT_EQ(trace.get_num_rows(), 2);
    check_relation<instr_fetching>(trace);
}

// Basic positive test with a hardcoded bytecode for ECADD
// Cover the longest amount of operands.
TEST(InstrFetchingConstrainingTest, EcaddWithTraceGen)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder builder;
    PrecomputedTraceBuilder precomputed_builder;

    Instruction ecadd_instruction = {
        .opcode = WireOpCode::ECADD,
        .indirect = 0x1f1f,
        .operands = { Operand::from<uint16_t>(0x1279),
                      Operand::from<uint16_t>(0x127a),
                      Operand::from<uint16_t>(0x127b),
                      Operand::from<uint16_t>(0x127c),
                      Operand::from<uint16_t>(0x127d),
                      Operand::from<uint16_t>(0x127e),
                      Operand::from<uint16_t>(0x127f) },
    };

    std::vector<uint8_t> bytecode = ecadd_instruction.serialize();
    builder.process_instruction_fetching({ { .bytecode_id = 1,
                                             .pc = 0,
                                             .instruction = ecadd_instruction,
                                             .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } },
                                         trace);
    precomputed_builder.process_misc(trace, trace.get_num_rows()); // Limit to the number of rows we need.

    EXPECT_EQ(trace.get_num_rows(), 2);
    check_relation<instr_fetching>(trace);
}

// Helper routine generating a vector of instruction fetching events for each
// opcode.
std::vector<InstructionFetchingEvent> gen_instr_events_each_opcode()
{
    std::vector<uint8_t> bytecode;
    std::vector<Instruction> instructions;
    constexpr auto num_opcodes = static_cast<size_t>(WireOpCode::LAST_OPCODE_SENTINEL);
    instructions.reserve(num_opcodes);
    std::array<uint32_t, num_opcodes> pc_positions;

    for (size_t i = 0; i < num_opcodes; i++) {
        pc_positions.at(i) = static_cast<uint32_t>(bytecode.size());
        const auto instr = testing::random_instruction(static_cast<WireOpCode>(i));
        instructions.emplace_back(instr);
        const auto instruction_bytes = instr.serialize();
        bytecode.insert(bytecode.end(),
                        std::make_move_iterator(instruction_bytes.begin()),
                        std::make_move_iterator(instruction_bytes.end()));
    }

    const auto bytecode_ptr = std::make_shared<std::vector<uint8_t>>(std::move(bytecode));
    // Always use *bytecode_ptr from now on instead of bytecode as this one was moved.

    std::vector<InstructionFetchingEvent> instr_events;
    instr_events.reserve(num_opcodes);
    for (size_t i = 0; i < num_opcodes; i++) {
        instr_events.emplace_back(InstructionFetchingEvent{
            .bytecode_id = 1, .pc = pc_positions.at(i), .instruction = instructions.at(i), .bytecode = bytecode_ptr });
    }
    return instr_events;
}

// Positive test for each opcode. We assume that decode instruction is working correctly.
// It works as long as the relations are not constraining the correct range for TAG nor indirect.
TEST(InstrFetchingConstrainingTest, EachOpcodeWithTraceGen)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder builder;
    PrecomputedTraceBuilder precomputed_builder;

    builder.process_instruction_fetching(gen_instr_events_each_opcode(), trace);
    precomputed_builder.process_misc(trace, trace.get_num_rows()); // Limit to the number of rows we need.

    constexpr auto num_opcodes = static_cast<size_t>(WireOpCode::LAST_OPCODE_SENTINEL);
    EXPECT_EQ(trace.get_num_rows(), num_opcodes + 1);
    check_relation<instr_fetching>(trace);
}

// Negative test about decomposition of operands. We mutate correct operand values in the trace.
// This also covers wrong operands which are not "involved" by the instruction.
// We perform this for a random instruction for opcodes: REVERT_16, CAST_8, TORADIXBE
TEST(InstrFetchingConstrainingTest, NegativeWrongOperand)
{
    BytecodeTraceBuilder builder;
    PrecomputedTraceBuilder precomputed_builder;

    std::vector<WireOpCode> opcodes = { WireOpCode::REVERT_16, WireOpCode::CAST_8, WireOpCode::TORADIXBE };
    std::vector<size_t> sub_relations = {
        instr_fetching::SR_INDIRECT_BYTES_DECOMPOSITION, instr_fetching::SR_OP1_BYTES_DECOMPOSITION,
        instr_fetching::SR_OP2_BYTES_DECOMPOSITION,      instr_fetching::SR_OP3_BYTES_DECOMPOSITION,
        instr_fetching::SR_OP4_BYTES_DECOMPOSITION,      instr_fetching::SR_OP5_BYTES_DECOMPOSITION,
        instr_fetching::SR_OP6_BYTES_DECOMPOSITION,      instr_fetching::SR_OP7_BYTES_DECOMPOSITION,
    };

    constexpr std::array<C, 8> operand_cols = {
        C::instr_fetching_indirect, C::instr_fetching_op1, C::instr_fetching_op2, C::instr_fetching_op3,
        C::instr_fetching_op4,      C::instr_fetching_op5, C::instr_fetching_op6, C::instr_fetching_op7,
    };

    for (const auto& opcode : opcodes) {
        TestTraceContainer trace;
        const auto instr = testing::random_instruction(opcode);
        builder.process_instruction_fetching(
            { { .bytecode_id = 1,
                .pc = 0,
                .instruction = instr,
                .bytecode = std::make_shared<std::vector<uint8_t>>(instr.serialize()) } },
            trace);
        precomputed_builder.process_misc(trace, trace.get_num_rows()); // Limit to the number of rows we need.

        check_relation<instr_fetching>(trace);

        EXPECT_EQ(trace.get_num_rows(), 2);

        for (size_t i = 0; i < operand_cols.size(); i++) {
            auto mutated_trace = trace;
            const FF mutated_operand = trace.get(operand_cols.at(i), 0) + 1; // Mutate to value + 1
            mutated_trace.set(operand_cols.at(i), 0, mutated_operand);
            EXPECT_THROW_WITH_MESSAGE(check_relation<instr_fetching>(mutated_trace, sub_relations.at(i)),
                                      instr_fetching::get_subrelation_label(sub_relations.at(i)));
        }
    }
}

// Positive test for interaction with instruction spec table using same events as for the test
// EachOpcodeWithTraceGen, i.e., one event/row is generated per wire opcode.
// It works as long as the relations are not constraining the correct range for TAG nor indirect.
TEST(InstrFetchingConstrainingTest, WireInstructionSpecInteractions)
{
    using wire_instr_spec_lookup = lookup_instr_fetching_wire_instruction_info_relation<FF>;

    TestTraceContainer trace;
    BytecodeTraceBuilder bytecode_builder;
    PrecomputedTraceBuilder precomputed_builder;

    precomputed_builder.process_wire_instruction_spec(trace);
    precomputed_builder.process_sel_range_8(trace);
    bytecode_builder.process_instruction_fetching(gen_instr_events_each_opcode(), trace);
    precomputed_builder.process_misc(trace, trace.get_num_rows()); // Limit to the number of rows we need.

    LookupIntoIndexedByClk<wire_instr_spec_lookup::Settings>().process(trace);

    EXPECT_EQ(trace.get_num_rows(), 1 << 8); // 2^8 for selector against wire_instruction_spec

    check_relation<instr_fetching>(trace);
}

std::vector<RangeCheckEvent> gen_range_check_events(const std::vector<InstructionFetchingEvent>& instr_events)
{
    std::vector<RangeCheckEvent> range_check_events;
    range_check_events.reserve(instr_events.size());

    for (const auto& instr_event : instr_events) {
        range_check_events.emplace_back(RangeCheckEvent{
            .value = instr_event.error == InstrDeserializationError::PC_OUT_OF_RANGE
                         ? instr_event.pc - instr_event.bytecode->size()
                         : instr_event.bytecode->size() - instr_event.pc - 1,
            .num_bits = AVM_PC_SIZE_IN_BITS,
        });
    }
    return range_check_events;
}

// Positive test for the interaction with bytecode decomposition table.
// One event/row is generated per wire opcode (same as for test WireInstructionSpecInteractions).
TEST(InstrFetchingConstrainingTest, BcDecompositionInteractions)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder bytecode_builder;
    PrecomputedTraceBuilder precomputed_builder;

    const auto instr_fetch_events = gen_instr_events_each_opcode();
    bytecode_builder.process_instruction_fetching(instr_fetch_events, trace);
    bytecode_builder.process_decomposition({ {
                                               .bytecode_id = instr_fetch_events.at(0).bytecode_id,
                                               .bytecode = instr_fetch_events.at(0).bytecode,
                                           } },
                                           trace);
    precomputed_builder.process_misc(trace, trace.get_num_rows()); // Limit to the number of rows we need.

    LookupIntoDynamicTableGeneric<bc_decomposition_lookup::Settings>().process(trace);
    LookupIntoDynamicTableGeneric<bytecode_size_bc_decomposition_lookup::Settings>().process(trace);

    // BC Decomposition trace is the longest here.
    EXPECT_EQ(trace.get_num_rows(), instr_fetch_events.at(0).bytecode->size() + 1);

    check_relation<instr_fetching>(trace);
}

void check_all(const std::vector<InstructionFetchingEvent>& instr_events,
               const std::vector<RangeCheckEvent>& range_check_events,
               const std::vector<BytecodeDecompositionEvent>& decomposition_events)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder bytecode_builder;
    PrecomputedTraceBuilder precomputed_builder;
    RangeCheckTraceBuilder range_check_builder;

    precomputed_builder.process_wire_instruction_spec(trace);
    precomputed_builder.process_sel_range_8(trace);
    precomputed_builder.process_sel_range_16(trace);
    precomputed_builder.process_memory_tag_range(trace);
    bytecode_builder.process_instruction_fetching(instr_events, trace);
    bytecode_builder.process_decomposition(decomposition_events, trace);
    range_check_builder.process(range_check_events, trace);
    precomputed_builder.process_misc(trace, trace.get_num_rows()); // Limit to the number of rows we need.

    LookupIntoIndexedByClk<instr_abs_diff_positive_lookup::Settings>().process(trace);
    LookupIntoDynamicTableGeneric<pc_abs_diff_positive_lookup::Settings>().process(trace);
    LookupIntoIndexedByClk<wire_instr_spec_lookup::Settings>().process(trace);
    LookupIntoIndexedByClk<tag_validation_lookup::Settings>().process(trace);
    LookupIntoDynamicTableGeneric<bc_decomposition_lookup::Settings>().process(trace);
    LookupIntoDynamicTableGeneric<bytecode_size_bc_decomposition_lookup::Settings>().process(trace);

    EXPECT_EQ(trace.get_num_rows(), 1 << 16); // 2^16 for range checks

    check_relation<instr_fetching>(trace);
}

void check_without_range_check(const std::vector<InstructionFetchingEvent>& instr_events,
                               const std::vector<BytecodeDecompositionEvent>& decomposition_events)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder bytecode_builder;
    PrecomputedTraceBuilder precomputed_builder;

    precomputed_builder.process_wire_instruction_spec(trace);
    precomputed_builder.process_sel_range_8(trace);
    precomputed_builder.process_memory_tag_range(trace);
    bytecode_builder.process_instruction_fetching(instr_events, trace);
    bytecode_builder.process_decomposition(decomposition_events, trace);
    precomputed_builder.process_misc(trace, trace.get_num_rows()); // Limit to the number of rows we need.

    LookupIntoIndexedByClk<instr_abs_diff_positive_lookup::Settings>().process(trace);
    LookupIntoIndexedByClk<wire_instr_spec_lookup::Settings>().process(trace);
    LookupIntoIndexedByClk<tag_validation_lookup::Settings>().process(trace);
    LookupIntoDynamicTableGeneric<bc_decomposition_lookup::Settings>().process(trace);
    LookupIntoDynamicTableGeneric<bytecode_size_bc_decomposition_lookup::Settings>().process(trace);

    EXPECT_EQ(trace.get_num_rows(), 1 << 8); // 2^8 for range checks

    check_relation<instr_fetching>(trace);
}

// Positive test with 5 five bytecodes and bytecode_id = 0,1,2,3,4
// Bytecode i is generated by truncating instr_fetch_events to i * 6 instructions.
// Check relations and all interactions.
TEST(InstrFetchingConstrainingTest, MultipleBytecodes)
{
    const auto instr_fetch_events = gen_instr_events_each_opcode();
    constexpr size_t num_of_bytecodes = 5;
    std::vector<BytecodeDecompositionEvent> decomposition_events;
    std::vector<InstructionFetchingEvent> instr_events;

    for (size_t i = 0; i < num_of_bytecodes; i++) {
        std::vector<uint8_t> bytecode;
        const auto num_of_instr = i * 6;

        for (size_t j = 0; j < num_of_instr; j++) {
            const auto& instr = instr_fetch_events.at(j).instruction;
            const auto instruction_bytes = instr.serialize();
            bytecode.insert(bytecode.end(),
                            std::make_move_iterator(instruction_bytes.begin()),
                            std::make_move_iterator(instruction_bytes.end()));
        }

        const auto bytecode_ptr = std::make_shared<std::vector<uint8_t>>(std::move(bytecode));

        for (size_t j = 0; j < num_of_instr; j++) {
            auto instr_event = instr_fetch_events.at(j);
            instr_event.bytecode_id = static_cast<BytecodeId>(i);
            instr_event.bytecode = bytecode_ptr;
            instr_events.emplace_back(instr_event);
        }

        decomposition_events.emplace_back(BytecodeDecompositionEvent{
            .bytecode_id = static_cast<BytecodeId>(i),
            .bytecode = bytecode_ptr,
        });
    }

    check_all(instr_events, gen_range_check_events(instr_events), decomposition_events);
}

// Positive test with one single instruction with error INSTRUCTION_OUT_OF_RANGE.
// The bytecode consists into a serialized single instruction with pc = 0 and
// the bytecode had the last byte removed. This byte corresponds to a full operand.
TEST(InstrFetchingConstrainingTest, SingleInstructionOutOfRange)
{
    Instruction add_8_instruction = {
        .opcode = WireOpCode::ADD_8,
        .indirect = 3,
        .operands = { Operand::from<uint8_t>(0x34), Operand::from<uint8_t>(0x35), Operand::from<uint8_t>(0x36) },
    };

    std::vector<uint8_t> bytecode = add_8_instruction.serialize();
    bytecode.pop_back(); // Remove last byte
    const auto bytecode_ptr = std::make_shared<std::vector<uint8_t>>(std::move(bytecode));

    const std::vector<InstructionFetchingEvent> instr_events = {
        {
            .bytecode_id = 1,
            .pc = 0,
            .bytecode = bytecode_ptr,
            .error = InstrDeserializationError::INSTRUCTION_OUT_OF_RANGE,
        },
    };

    const std::vector<BytecodeDecompositionEvent> decomposition_events = {
        {
            .bytecode_id = 1,
            .bytecode = bytecode_ptr,
        },
    };

    check_without_range_check(instr_events, decomposition_events);
}

// Positive test with one single instruction (SET_FF) with error INSTRUCTION_OUT_OF_RANGE.
// The bytecode consists into a serialized single instruction with pc = 0 and
// the bytecode had the two last bytes removed. The truncated instruction is cut
// in the middle of an operand.
TEST(InstrFetchingConstrainingTest, SingleInstructionOutOfRangeSplitOperand)
{
    Instruction set_ff_instruction = {
        .opcode = WireOpCode::SET_FF,
        .indirect = 0x01,
        .operands = { Operand::from<uint16_t>(0x1279),
                      Operand::from<uint8_t>(static_cast<uint8_t>(MemoryTag::FF)),
                      Operand::from<FF>(FF::modulus_minus_two) },
    };

    std::vector<uint8_t> bytecode = set_ff_instruction.serialize();
    bytecode.resize(bytecode.size() - 2); // Remove last two bytes)
    const auto bytecode_ptr = std::make_shared<std::vector<uint8_t>>(std::move(bytecode));

    const std::vector<InstructionFetchingEvent> instr_events = {
        {
            .bytecode_id = 1,
            .pc = 0,
            .bytecode = bytecode_ptr,
            .error = InstrDeserializationError::INSTRUCTION_OUT_OF_RANGE,
        },
    };

    const std::vector<BytecodeDecompositionEvent> decomposition_events = {
        {
            .bytecode_id = 1,
            .bytecode = bytecode_ptr,
        },
    };

    check_without_range_check(instr_events, decomposition_events);
}

// Positive test with error case PC_OUT_OF_RANGE. We pass a pc which is out of range.
TEST(InstrFetchingConstrainingTest, SingleInstructionPcOutOfRange)
{
    Instruction add_8_instruction = {
        .opcode = WireOpCode::SUB_8,
        .indirect = 3,
        .operands = { Operand::from<uint8_t>(0x34), Operand::from<uint8_t>(0x35), Operand::from<uint8_t>(0x36) },
    };

    std::vector<uint8_t> bytecode = add_8_instruction.serialize();
    const auto bytecode_ptr = std::make_shared<std::vector<uint8_t>>(std::move(bytecode));

    const std::vector<InstructionFetchingEvent> instr_events = {
        // We first need a first instruction at pc == 0 as the trace assumes this.
        {
            .bytecode_id = 1,
            .pc = 0,
            .instruction = add_8_instruction,
            .bytecode = bytecode_ptr,
        },
        {
            .bytecode_id = 1,
            .pc = static_cast<uint32_t>(bytecode_ptr->size() + 1),
            .bytecode = bytecode_ptr,
            .error = InstrDeserializationError::PC_OUT_OF_RANGE,
        },
    };

    const std::vector<BytecodeDecompositionEvent> decomposition_events = {
        {
            .bytecode_id = 1,
            .bytecode = bytecode_ptr,
        },
    };

    check_all(instr_events, gen_range_check_events(instr_events), decomposition_events);
}

// Positive test with error case OPCODE_OUT_OF_RANGE. We generate bytecode of a SET_128 instruction and
// move the PC to a position corresponding to the beginning of the 128-bit immediate value of SET_128.
// The immediate value in SET_128 starts with byte 0xFF (which we know is not a valid opcode).
TEST(InstrFetchingConstrainingTest, SingleInstructionOpcodeOutOfRange)
{
    Instruction set_128_instruction = {
        .opcode = WireOpCode::SET_128,
        .indirect = 0,
        .operands = { Operand::from<uint16_t>(0x1234),
                      Operand::from<uint8_t>(static_cast<uint8_t>(MemoryTag::U128)),
                      Operand::from<uint128_t>(static_cast<uint128_t>(0xFF) << 120) },
    };

    std::vector<uint8_t> bytecode = set_128_instruction.serialize();
    const auto bytecode_ptr = std::make_shared<std::vector<uint8_t>>(std::move(bytecode));

    const std::vector<InstructionFetchingEvent> instr_events = {
        {
            .bytecode_id = 1,
            .pc = 0,
            .instruction = set_128_instruction,
            .bytecode = bytecode_ptr,
        },
        {
            .bytecode_id = 1,
            .pc = 5, // We move pc to the beginning of the 128-bit immediate value.
            .bytecode = bytecode_ptr,
            .error = InstrDeserializationError::OPCODE_OUT_OF_RANGE,
        },
    };

    const std::vector<BytecodeDecompositionEvent> decomposition_events = {
        {
            .bytecode_id = 1,
            .bytecode = bytecode_ptr,
        },
    };

    check_without_range_check(instr_events, decomposition_events);
}

// Positive test with one single instruction (SET_16) with error TAG_OUT_OF_RANGE.
// The bytecode consists into a serialized single instruction with pc = 0.
// The operand at index 1 is wrongly set to value 12
TEST(InstrFetchingConstrainingTest, SingleInstructionTagOutOfRange)
{
    Instruction set_16_instruction = {
        .opcode = WireOpCode::SET_16,
        .indirect = 0,
        .operands = { Operand::from<uint16_t>(0x1234), Operand::from<uint8_t>(12), Operand::from<uint16_t>(0x5678) },
    };

    std::vector<uint8_t> bytecode = set_16_instruction.serialize();
    const auto bytecode_ptr = std::make_shared<std::vector<uint8_t>>(std::move(bytecode));

    const std::vector<InstructionFetchingEvent> instr_events = {
        {
            .bytecode_id = 1,
            .pc = 0,
            .instruction = set_16_instruction,
            .bytecode = bytecode_ptr,
            .error = InstrDeserializationError::TAG_OUT_OF_RANGE,
        },
    };

    const std::vector<BytecodeDecompositionEvent> decomposition_events = {
        {
            .bytecode_id = 1,
            .bytecode = bytecode_ptr,
        },
    };

    check_without_range_check(instr_events, decomposition_events);
}

// TODO(jeanmon): Reconsider this test after #13140
// Negative interaction test with some values not matching the instruction spec table.
TEST(InstrFetchingConstrainingTest, DISABLED_NegativeWrongWireInstructionSpecInteractions)
{
    BytecodeTraceBuilder bytecode_builder;
    PrecomputedTraceBuilder precomputed_builder;

    // Some arbitrary chosen opcodes. We limit to one as this unit test is costly.
    // Test works if the following vector is extended to other opcodes though.
    std::vector<WireOpCode> opcodes = { WireOpCode::CALLDATACOPY };

    for (const auto& opcode : opcodes) {
        TestTraceContainer trace;
        const auto instr = testing::random_instruction(opcode);
        bytecode_builder.process_instruction_fetching(
            { { .bytecode_id = 1,
                .pc = 0,
                .instruction = instr,
                .bytecode = std::make_shared<std::vector<uint8_t>>(instr.serialize()) } },
            trace);
        precomputed_builder.process_wire_instruction_spec(trace);
        precomputed_builder.process_sel_range_8(trace);
        precomputed_builder.process_misc(trace, trace.get_num_rows()); // Limit to the number of rows we need.

        LookupIntoIndexedByClk<wire_instr_spec_lookup::Settings>().process(trace);

        ASSERT_EQ(trace.get(C::lookup_instr_fetching_wire_instruction_info_counts, static_cast<uint32_t>(opcode)), 1);

        constexpr std::array<C, 22> mutated_cols = {
            C::instr_fetching_exec_opcode,    C::instr_fetching_instr_size,   C::instr_fetching_sel_has_tag,
            C::instr_fetching_sel_tag_is_op2, C::instr_fetching_sel_op_dc_0,  C::instr_fetching_sel_op_dc_1,
            C::instr_fetching_sel_op_dc_2,    C::instr_fetching_sel_op_dc_3,  C::instr_fetching_sel_op_dc_4,
            C::instr_fetching_sel_op_dc_5,    C::instr_fetching_sel_op_dc_6,  C::instr_fetching_sel_op_dc_7,
            C::instr_fetching_sel_op_dc_8,    C::instr_fetching_sel_op_dc_9,  C::instr_fetching_sel_op_dc_10,
            C::instr_fetching_sel_op_dc_11,   C::instr_fetching_sel_op_dc_12, C::instr_fetching_sel_op_dc_13,
            C::instr_fetching_sel_op_dc_14,   C::instr_fetching_sel_op_dc_15, C::instr_fetching_sel_op_dc_16,
        };

        // Mutate execution opcode
        for (const auto& col : mutated_cols) {
            auto mutated_trace = trace;
            const FF mutated_value = trace.get(col, 1) + 1; // Mutate to value + 1
            mutated_trace.set(col, 1, mutated_value);

            // We do not need to re-run LookupIntoIndexedByClk<wire_instr_spec_lookup::Settings>().process(trace);
            // because we never mutate the indexing column for this lookup (clk) and for this lookup
            // find_in_dst only uses column C::instr_fetching_bd0 mapped to (clk). So, the counts are still valid.
            // EXPECT_THROW_WITH_MESSAGE(check_interaction<wire_instr_spec_lookup>(mutated_trace),
            //                           "Relation.*WIRE_INSTRUCTION_INFO.* ACCUMULATION.* is non-zero");
        }
    }
}

// Negative interaction test with some values not matching the bytecode decomposition table.
TEST(InstrFetchingConstrainingTest, NegativeWrongBcDecompositionInteractions)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder bytecode_builder;

    // Some arbitrary chosen opcodes. We limit to one as this unit test is costly.
    // Test works if the following vector is extended to other opcodes though.
    std::vector<WireOpCode> opcodes = { WireOpCode::STATICCALL };

    for (const auto& opcode : opcodes) {
        TestTraceContainer trace;
        const auto instr = testing::random_instruction(opcode);
        auto bytecode_ptr = std::make_shared<std::vector<uint8_t>>(instr.serialize());
        bytecode_builder.process_instruction_fetching({ {
                                                          .bytecode_id = 1,
                                                          .pc = 0,
                                                          .instruction = instr,
                                                          .bytecode = bytecode_ptr,
                                                      } },
                                                      trace);
        bytecode_builder.process_decomposition({ {
                                                   .bytecode_id = 1,
                                                   .bytecode = bytecode_ptr,
                                               } },
                                               trace);

        auto valid_trace = trace; // Keep original trace before lookup processing
        LookupIntoDynamicTableSequential<bc_decomposition_lookup::Settings>().process(valid_trace);

        constexpr std::array<C, 39> mutated_cols = {
            C::instr_fetching_pc,   C::instr_fetching_bytecode_id, C::instr_fetching_bd0,  C::instr_fetching_bd1,
            C::instr_fetching_bd2,  C::instr_fetching_bd3,         C::instr_fetching_bd4,  C::instr_fetching_bd5,
            C::instr_fetching_bd6,  C::instr_fetching_bd7,         C::instr_fetching_bd8,  C::instr_fetching_bd9,
            C::instr_fetching_bd10, C::instr_fetching_bd11,        C::instr_fetching_bd12, C::instr_fetching_bd13,
            C::instr_fetching_bd14, C::instr_fetching_bd15,        C::instr_fetching_bd16, C::instr_fetching_bd17,
            C::instr_fetching_bd18, C::instr_fetching_bd19,        C::instr_fetching_bd20, C::instr_fetching_bd21,
            C::instr_fetching_bd22, C::instr_fetching_bd23,        C::instr_fetching_bd24, C::instr_fetching_bd25,
            C::instr_fetching_bd26, C::instr_fetching_bd27,        C::instr_fetching_bd28, C::instr_fetching_bd29,
            C::instr_fetching_bd30, C::instr_fetching_bd31,        C::instr_fetching_bd32, C::instr_fetching_bd33,
            C::instr_fetching_bd34, C::instr_fetching_bd35,        C::instr_fetching_bd36,
        };

        // Mutate execution opcode
        for (const auto& col : mutated_cols) {
            auto mutated_trace = trace;
            const FF mutated_value = trace.get(col, 1) + 1; // Mutate to value + 1
            mutated_trace.set(col, 1, mutated_value);

            // This sets the length of the inverse polynomial via SetDummyInverses, so we
            // still need to call this even though we know it will fail.
            EXPECT_THROW_WITH_MESSAGE(
                LookupIntoDynamicTableSequential<bc_decomposition_lookup::Settings>().process(mutated_trace),
                "Failed.*BYTES_FROM_BC_DEC. Could not find tuple in destination.");
        }
    }
}

// Negative interaction test for #[BYTECODE_SIZE_FROM_BC_DEC] where bytecode_size has the wrong value.
// We set pc different from zero.
TEST(InstrFetchingConstrainingTest, NegativeWrongBytecodeSizeBcDecompositionInteractions)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder bytecode_builder;
    PrecomputedTraceBuilder precomputed_builder;

    const uint32_t pc = 15;
    std::vector<uint8_t> bytecode(pc, 0x23);

    // Some arbitrary chosen opcodes. We limit to one as this unit test is costly.
    // Test works if the following vector is extended to other opcodes though.
    std::vector<WireOpCode> opcodes = { WireOpCode::KECCAKF1600 };

    for (const auto& opcode : opcodes) {
        TestTraceContainer trace;

        const auto instr = testing::random_instruction(opcode);
        const auto instr_bytecode = instr.serialize();
        bytecode.insert(bytecode.end(),
                        std::make_move_iterator(instr_bytecode.begin()),
                        std::make_move_iterator(instr_bytecode.end()));
        auto bytecode_ptr = std::make_shared<std::vector<uint8_t>>(bytecode);

        bytecode_builder.process_instruction_fetching({ {
                                                          .bytecode_id = 1,
                                                          .pc = pc,
                                                          .instruction = instr,
                                                          .bytecode = bytecode_ptr,
                                                      } },
                                                      trace);
        bytecode_builder.process_decomposition({ {
                                                   .bytecode_id = 1,
                                                   .bytecode = bytecode_ptr,
                                               } },
                                               trace);
        precomputed_builder.process_misc(trace, trace.get_num_rows()); // Limit to the number of rows we need.

        auto valid_trace = trace; // Keep original trace before lookup processing
        LookupIntoDynamicTableSequential<bytecode_size_bc_decomposition_lookup::Settings>().process(valid_trace);

        auto mutated_trace = trace;
        const FF mutated_value = trace.get(C::instr_fetching_bytecode_size, 1) + 1; // Mutate to value + 1
        mutated_trace.set(C::instr_fetching_bytecode_size, 1, mutated_value);

        // This sets the length of the inverse polynomial via SetDummyInverses, so we still need to call this
        // even though we know it will fail.
        EXPECT_THROW_WITH_MESSAGE(
            LookupIntoDynamicTableSequential<bytecode_size_bc_decomposition_lookup::Settings>().process(mutated_trace),
            "Failed.*BYTECODE_SIZE_FROM_BC_DEC. Could not find tuple in destination.");
    }
}

// TODO(jeanmon): Reconsider this test after #13140
// Negative interaction test for #[TAG_VALUE_VALIDATION] where tag_out_of_range is wrongly mutated
TEST(InstrFetchingConstrainingTest, DISABLED_NegativeWrongTagValidationInteractions)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder bytecode_builder;
    PrecomputedTraceBuilder precomputed_builder;

    // Some chosen opcode with a tag. We limit to one as this unit test is costly.
    // Test works if the following vector is extended to other opcodes though.
    std::vector<WireOpCode> opcodes = { WireOpCode::SET_8 };

    for (const auto& opcode : opcodes) {
        TestTraceContainer trace;
        const auto instr = testing::random_instruction(opcode);
        bytecode_builder.process_instruction_fetching(
            { { .bytecode_id = 1,
                .pc = 0,
                .instruction = instr,
                .bytecode = std::make_shared<std::vector<uint8_t>>(instr.serialize()) } },
            trace);
        precomputed_builder.process_memory_tag_range(trace);
        precomputed_builder.process_sel_range_8(trace);
        precomputed_builder.process_misc(trace, trace.get_num_rows()); // Limit to the number of rows we need.

        LookupIntoIndexedByClk<tag_validation_lookup::Settings>().process(trace);

        auto valid_trace = trace; // Keep original trace before lookup processing

        // Mutate tag out-of-range error
        auto mutated_trace = trace;
        ASSERT_EQ(trace.get(C::instr_fetching_tag_out_of_range, 1), 0);
        mutated_trace.set(C::instr_fetching_tag_out_of_range, 1, 1); // Mutate by toggling the error.

        // We do not need to re-run LookupIntoIndexedByClk<tag_validation_lookup::Settings>().process(trace);
        // because we never mutate the indexing column for this lookup (clk) and for this lookup
        // find_in_dst only uses column C::instr_fetching_tag_value mapped to (clk). So, the counts are still valid.
        // EXPECT_THROW_WITH_MESSAGE(check_interaction<tag_validation_lookup>(mutated_trace),
        //                           "Relation.*TAG_VALUE_VALIDATION.* ACCUMULATION.* is non-zero");
    }
}

// Negative test on not toggling instr_out_of_range when instr_size > bytes_to_read
TEST(InstrFetchingConstrainingTest, NegativeNotTogglingInstrOutOfRange)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
        {
            .instr_fetching_bytes_to_read = 11,
            .instr_fetching_instr_abs_diff = 0,
            .instr_fetching_instr_out_of_range = 1, // Will be mutated to zero
            .instr_fetching_instr_size = 12,
            .instr_fetching_sel = 1,
        },
    });

    check_relation<instr_fetching>(trace, instr_fetching::SR_INSTR_OUT_OF_RANGE_TOGGLE);

    trace.set(C::instr_fetching_instr_out_of_range, 1, 0); // Mutate to wrong value

    EXPECT_THROW_WITH_MESSAGE(check_relation<instr_fetching>(trace, instr_fetching::SR_INSTR_OUT_OF_RANGE_TOGGLE),
                              "INSTR_OUT_OF_RANGE_TOGGLE");
}

// Negative test on wrongly toggling instr_out_of_range when instr_size <= bytes_to_read
TEST(InstrFetchingConstrainingTest, NegativeTogglingInstrInRange)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
        {
            .instr_fetching_bytes_to_read = 12,
            .instr_fetching_instr_abs_diff = 0,
            .instr_fetching_instr_out_of_range = 0, // Will be mutated to 1
            .instr_fetching_instr_size = 12,
            .instr_fetching_sel = 1,
        },
    });

    check_relation<instr_fetching>(trace, instr_fetching::SR_INSTR_OUT_OF_RANGE_TOGGLE);

    trace.set(C::instr_fetching_instr_out_of_range, 1, 1); // Mutate to wrong value

    EXPECT_THROW_WITH_MESSAGE(check_relation<instr_fetching>(trace, instr_fetching::SR_INSTR_OUT_OF_RANGE_TOGGLE),
                              "INSTR_OUT_OF_RANGE_TOGGLE");
}

// Negative test on not toggling pc_out_of_range when pc >= bytecode_size
TEST(InstrFetchingConstrainingTest, NegativeNotTogglingPcOutOfRange)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
        {
            .instr_fetching_bytecode_size = 12,
            .instr_fetching_pc = 12,
            .instr_fetching_pc_abs_diff = 0,
            .instr_fetching_pc_out_of_range = 1, // Will be mutated to 0
            .instr_fetching_sel = 1,
        },
    });

    check_relation<instr_fetching>(trace, instr_fetching::SR_PC_OUT_OF_RANGE_TOGGLE);

    trace.set(C::instr_fetching_pc_out_of_range, 1, 0); // Mutate to wrong value

    EXPECT_THROW_WITH_MESSAGE(check_relation<instr_fetching>(trace, instr_fetching::SR_PC_OUT_OF_RANGE_TOGGLE),
                              "PC_OUT_OF_RANGE_TOGGLE");
}

// Negative test on wrongly toggling pc_out_of_range when pc < bytecode_size
TEST(InstrFetchingConstrainingTest, NegativeTogglingPcInRange)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
        {
            .instr_fetching_bytecode_size = 12,
            .instr_fetching_pc = 11,
            .instr_fetching_pc_abs_diff = 0,
            .instr_fetching_pc_out_of_range = 0, // Will be mutated to 1
            .instr_fetching_sel = 1,
        },
    });

    check_relation<instr_fetching>(trace, instr_fetching::SR_PC_OUT_OF_RANGE_TOGGLE);

    trace.set(C::instr_fetching_pc_out_of_range, 1, 1); // Mutate to wrong value

    EXPECT_THROW_WITH_MESSAGE(check_relation<instr_fetching>(trace, instr_fetching::SR_PC_OUT_OF_RANGE_TOGGLE),
                              "PC_OUT_OF_RANGE_TOGGLE");
}

} // namespace
} // namespace bb::avm2::constraining
