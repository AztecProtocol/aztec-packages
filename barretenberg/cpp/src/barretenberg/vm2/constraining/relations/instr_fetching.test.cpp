#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <memory>
#include <vector>

#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/bc_hashing.hpp"
#include "barretenberg/vm2/generated/relations/instr_fetching.hpp"
#include "barretenberg/vm2/generated/relations/lookups_bc_hashing.hpp"
#include "barretenberg/vm2/generated/relations/lookups_instr_fetching.hpp"
#include "barretenberg/vm2/simulation/events/poseidon2_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::BytecodeTraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::RangeCheckTraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;

using instr_fetching = instr_fetching<FF>;

using simulation::BytecodeDecompositionEvent;
using simulation::InstrDeserializationEventError;
using simulation::Instruction;
using simulation::InstructionFetchingEvent;
using simulation::Operand;
using simulation::RangeCheckEvent;

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
        .addressing_mode = 3,
        .operands = { Operand::from<uint8_t>(0x34), Operand::from<uint8_t>(0x35), Operand::from<uint8_t>(0x36) },
    };

    std::vector<uint8_t> bytecode = add_8_instruction.serialize();

    builder.process_instruction_fetching({ { .bytecode_id = 1,
                                             .pc = 0,
                                             .instruction = add_8_instruction,
                                             .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } },
                                         trace);
    precomputed_builder.process_misc(trace, trace.get_num_rows()); // Limit to the number of rows we need.

    EXPECT_EQ(trace.get_num_rows(), 1);
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
        .addressing_mode = 0x1f1f,
        .operands = { Operand::from<uint16_t>(0x1279),
                      Operand::from<uint16_t>(0x127a),
                      Operand::from<uint16_t>(0x127b),
                      Operand::from<uint16_t>(0x127c),
                      Operand::from<uint16_t>(0x127d), },
    };

    std::vector<uint8_t> bytecode = ecadd_instruction.serialize();
    builder.process_instruction_fetching({ { .bytecode_id = 1,
                                             .pc = 0,
                                             .instruction = ecadd_instruction,
                                             .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } },
                                         trace);
    precomputed_builder.process_misc(trace, trace.get_num_rows()); // Limit to the number of rows we need.

    EXPECT_EQ(trace.get_num_rows(), 1);
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
    EXPECT_EQ(trace.get_num_rows(), num_opcodes);
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
        instr_fetching::SR_ADDRESSING_MODE_BYTES_DECOMPOSITION,
        instr_fetching::SR_OP1_BYTES_DECOMPOSITION,
        instr_fetching::SR_OP2_BYTES_DECOMPOSITION,
        instr_fetching::SR_OP3_BYTES_DECOMPOSITION,
        instr_fetching::SR_OP4_BYTES_DECOMPOSITION,
        instr_fetching::SR_OP5_BYTES_DECOMPOSITION,
        instr_fetching::SR_OP6_BYTES_DECOMPOSITION,
        instr_fetching::SR_OP7_BYTES_DECOMPOSITION,
    };

    constexpr std::array<C, 8> operand_cols = {
        C::instr_fetching_addressing_mode,
        C::instr_fetching_op1,
        C::instr_fetching_op2,
        C::instr_fetching_op3,
        C::instr_fetching_op4,
        C::instr_fetching_op5,
        C::instr_fetching_op6,
        C::instr_fetching_op7,
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

        EXPECT_EQ(trace.get_num_rows(), 1);

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
    TestTraceContainer trace;
    BytecodeTraceBuilder bytecode_builder;
    PrecomputedTraceBuilder precomputed_builder;

    precomputed_builder.process_wire_instruction_spec(trace);
    precomputed_builder.process_sel_range_8(trace);
    bytecode_builder.process_instruction_fetching(gen_instr_events_each_opcode(), trace);
    precomputed_builder.process_misc(trace, trace.get_num_rows()); // Limit to the number of rows we need.

    EXPECT_EQ(trace.get_num_rows(), 1 << 8); // 2^8 for selector against wire_instruction_spec

    check_interaction<BytecodeTraceBuilder, lookup_instr_fetching_wire_instruction_info_settings>(trace);
    check_relation<instr_fetching>(trace);
}

std::vector<RangeCheckEvent> gen_range_check_events(const std::vector<InstructionFetchingEvent>& instr_events)
{
    std::vector<RangeCheckEvent> range_check_events;
    range_check_events.reserve(instr_events.size());

    for (const auto& instr_event : instr_events) {
        range_check_events.emplace_back(RangeCheckEvent{
            .value =
                (instr_event.error.has_value() && instr_event.error == InstrDeserializationEventError::PC_OUT_OF_RANGE)
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

    check_interaction<BytecodeTraceBuilder,
                      lookup_instr_fetching_bytes_from_bc_dec_settings,
                      lookup_instr_fetching_bytecode_size_from_bc_dec_settings>(trace);

    // BC Decomposition trace is the longest here and requires an extra prepended row.
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

    check_interaction<BytecodeTraceBuilder,
                      lookup_instr_fetching_bytes_from_bc_dec_settings,
                      lookup_instr_fetching_bytecode_size_from_bc_dec_settings,
                      lookup_instr_fetching_wire_instruction_info_settings,
                      lookup_instr_fetching_tag_value_validation_settings,
                      lookup_instr_fetching_pc_abs_diff_positive_settings,
                      lookup_instr_fetching_instr_abs_diff_positive_settings>(trace);

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

    check_interaction<BytecodeTraceBuilder,
                      lookup_instr_fetching_bytes_from_bc_dec_settings,
                      lookup_instr_fetching_bytecode_size_from_bc_dec_settings,
                      lookup_instr_fetching_wire_instruction_info_settings,
                      lookup_instr_fetching_tag_value_validation_settings,
                      lookup_instr_fetching_instr_abs_diff_positive_settings>(trace);

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
        .addressing_mode = 3,
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
            .error = InstrDeserializationEventError::INSTRUCTION_OUT_OF_RANGE,
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
        .addressing_mode = 0x01,
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
            .error = InstrDeserializationEventError::INSTRUCTION_OUT_OF_RANGE,
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
        .addressing_mode = 3,
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
            .error = InstrDeserializationEventError::PC_OUT_OF_RANGE,
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
        .addressing_mode = 0,
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
            .error = InstrDeserializationEventError::OPCODE_OUT_OF_RANGE,
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
        .addressing_mode = 0,
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
            .error = InstrDeserializationEventError::TAG_OUT_OF_RANGE,
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

// Negative interaction test with some values not matching the instruction spec table.
TEST(InstrFetchingConstrainingTest, NegativeWrongWireInstructionSpecInteractions)
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

        check_interaction<BytecodeTraceBuilder, lookup_instr_fetching_wire_instruction_info_settings>(trace);

        ASSERT_EQ(trace.get(C::lookup_instr_fetching_wire_instruction_info_counts, static_cast<uint32_t>(opcode)), 1);

        constexpr std::array<C, 21> mutated_cols = {
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
            const FF mutated_value = trace.get(col, 0) + 1; // Mutate to value + 1
            mutated_trace.set(col, 0, mutated_value);

            EXPECT_THROW_WITH_MESSAGE(
                (check_interaction<BytecodeTraceBuilder, lookup_instr_fetching_wire_instruction_info_settings>(
                    mutated_trace)),
                "Failed.*LOOKUP_INSTR_FETCHING_WIRE_INSTRUCTION_INFO.*Could not find tuple in destination.");
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
        check_interaction<BytecodeTraceBuilder, lookup_instr_fetching_bytes_from_bc_dec_settings>(valid_trace);

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
            const FF mutated_value = trace.get(col, 0) + 1; // Mutate to value + 1
            mutated_trace.set(col, 0, mutated_value);

            EXPECT_THROW_WITH_MESSAGE(
                (check_interaction<BytecodeTraceBuilder, lookup_instr_fetching_bytes_from_bc_dec_settings>(
                    mutated_trace)),
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
        check_interaction<BytecodeTraceBuilder, lookup_instr_fetching_bytecode_size_from_bc_dec_settings>(valid_trace);

        auto mutated_trace = trace;
        const FF mutated_value = trace.get(C::instr_fetching_bytecode_size, 0) + 1; // Mutate to value + 1
        mutated_trace.set(C::instr_fetching_bytecode_size, 0, mutated_value);

        EXPECT_THROW_WITH_MESSAGE(
            (check_interaction<BytecodeTraceBuilder, lookup_instr_fetching_bytecode_size_from_bc_dec_settings>(
                mutated_trace)),
            "Failed.*BYTECODE_SIZE_FROM_BC_DEC. Could not find tuple in destination.");
    }
}

using ::bb::avm2::testing::InstructionBuilder;
using simulation::EventEmitter;
using simulation::MockExecutionIdManager;
using simulation::MockGreaterThan;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::Poseidon2PermutationMemoryEvent;
using ::testing::StrictMock;
using tracegen::Poseidon2TraceBuilder;

TEST(InstrFetchingConstrainingTest, NegativeTruncatedBytecodeRepro)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder bytecode_builder;
    PrecomputedTraceBuilder precomputed_builder;
    RangeCheckTraceBuilder range_check_builder;
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    EventEmitter<Poseidon2PermutationMemoryEvent> perm_mem_event_emitter;
    StrictMock<MockGreaterThan> mock_gt;
    StrictMock<MockExecutionIdManager> mock_execution_id_manager;
    // Note: this helper expects bytecode fields without the prepended separator and does not complete decomposition
    Poseidon2 poseidon2 =
        Poseidon2(mock_execution_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);

    Poseidon2TraceBuilder poseidon2_builder;

    // Build some good bytecode:
    const uint32_t pc = 15;
    std::vector<uint8_t> bytecode(pc, 0x23);
    const auto add_instr =
        InstructionBuilder(WireOpCode::SUB_8).operand<uint8_t>(5).operand<uint8_t>(5).operand<uint8_t>(0).build();
    const auto instr_bytecode = add_instr.serialize();
    bytecode.insert(
        bytecode.end(), std::make_move_iterator(instr_bytecode.begin()), std::make_move_iterator(instr_bytecode.end()));

    std::vector<FF> fields = simulation::encode_bytecode(bytecode);
    std::vector<FF> prepended_fields = { simulation::compute_public_bytecode_first_field(bytecode.size()) };
    prepended_fields.insert(prepended_fields.end(), fields.begin(), fields.end());
    FF hash = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(prepended_fields);

    // Remove the final byte (which has a value of zero)
    std::vector<uint8_t> trunc_bytecode(pc, 0x23);
    trunc_bytecode.insert(trunc_bytecode.end(),
                          std::make_move_iterator(instr_bytecode.begin()),
                          std::make_move_iterator(instr_bytecode.end()));
    trunc_bytecode.resize(trunc_bytecode.size() - 1);
    std::vector<FF> trunc_fields = simulation::encode_bytecode(trunc_bytecode);
    std::vector<FF> trunc_prepended_fields = { DOM_SEP__PUBLIC_BYTECODE };
    trunc_prepended_fields.insert(trunc_prepended_fields.end(), trunc_fields.begin(), trunc_fields.end());
    FF trunc_hash = poseidon2.hash(trunc_prepended_fields);
    // 'Real' bytecode: [ 23 23 23 23 23 23 23 23 23 23 23 23 23 23 23 02 00 05 05 00 ] of length 20 bytes
    // We could previously process a truncated bytecode with the same id:
    // 'Fake' bytecode: [ 23 23 23 23 23 23 23 23 23 23 23 23 23 23 23 02 00 05 05 ] of length 19 bytes
    // Before introducing  #[BYTECODE_LENGTH_BYTES] in bc_hashing.pil and including the size in
    // compute_public_bytecode_first_field(), (#20254) trunc_hash == hash, meaning we could use truncated bytecode.
    ASSERT_NE(hash, trunc_hash);

    // Now, we cannot process the truncated bytecode and force a good instruction on the full bytecode to fail:
    auto trunc_bytecode_ptr = std::make_shared<std::vector<uint8_t>>(trunc_bytecode);
    auto bytecode_ptr = std::make_shared<std::vector<uint8_t>>(bytecode);
    InstructionFetchingEvent instr_event = {
        .bytecode_id = hash,
        .pc = pc,
        .instruction = add_instr,
        .bytecode = bytecode_ptr,
    };
    bytecode_builder.process_instruction_fetching({ instr_event }, trace);
    bytecode_builder.process_hashing({ {
                                         .bytecode_id = hash,
                                         .bytecode_length_in_bytes = static_cast<uint32_t>(trunc_bytecode.size()),
                                         .bytecode_fields = trunc_fields,
                                     } },
                                     trace);

    bytecode_builder.process_decomposition({ {
                                               .bytecode_id = hash,
                                               .bytecode = trunc_bytecode_ptr,
                                           } },
                                           trace);

    // Prep trace:
    range_check_builder.process(gen_range_check_events({ instr_event }), trace);
    precomputed_builder.process_misc(trace, 256);
    precomputed_builder.process_sel_range_8(trace);
    precomputed_builder.process_wire_instruction_spec(trace);
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);

    tracegen::MultiPermutationBuilder<perm_bc_hashing_get_packed_field_0_settings,
                                      perm_bc_hashing_get_packed_field_1_settings,
                                      perm_bc_hashing_get_packed_field_2_settings>
        perm_builder(C::bc_decomposition_sel_packed);
    perm_builder.process(trace);

    check_relation<bb::avm2::bc_hashing<FF>>(trace);
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<BytecodeTraceBuilder, lookup_bc_hashing_poseidon2_hash_settings>(trace)),
        "Failed.*LOOKUP_BC_HASHING_POSEIDON2_HASH. Could not find tuple in destination.");
}

TEST(InstrFetchingConstrainingTest, NegativeWrongTagValidationInteractions)
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

        check_interaction<BytecodeTraceBuilder, lookup_instr_fetching_tag_value_validation_settings>(trace);

        auto valid_trace = trace; // Keep original trace before lookup processing

        // Mutate tag out-of-range error
        auto mutated_trace = trace;
        ASSERT_EQ(trace.get(C::instr_fetching_tag_out_of_range, 0), 0);
        mutated_trace.set(C::instr_fetching_tag_out_of_range, 0, 1); // Mutate by toggling the error.

        EXPECT_THROW_WITH_MESSAGE(
            (check_interaction<BytecodeTraceBuilder, lookup_instr_fetching_tag_value_validation_settings>(
                mutated_trace)),
            "Failed.*LOOKUP_INSTR_FETCHING_TAG_VALUE_VALIDATION.*Could not find tuple in destination.");
    }
}

// Negative test on wrongly setting tag_out_of_range when the opcode has no tag
TEST(InstrFetchingConstrainingTest, NegativeTagOutOfRangeNoTag)
{
    TestTraceContainer trace;
    BytecodeTraceBuilder bytecode_builder;
    PrecomputedTraceBuilder precomputed_builder;

    // Some chosen opcode without a tag
    WireOpCode opcode = WireOpCode::ADD_8;

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

    check_interaction<BytecodeTraceBuilder, lookup_instr_fetching_tag_value_validation_settings>(trace);

    // Mutate tag out-of-range error
    ASSERT_EQ(trace.get(C::instr_fetching_tag_out_of_range, 1), 0);
    ASSERT_EQ(trace.get(C::instr_fetching_sel_has_tag, 1), 0);
    trace.set(C::instr_fetching_tag_out_of_range, 1, 1); // Mutate by toggling the error.

    EXPECT_THROW_WITH_MESSAGE(check_relation<instr_fetching>(trace, instr_fetching::SR_TAG_OUT_OF_RANGE_ZERO),
                              instr_fetching::get_subrelation_label(instr_fetching::SR_TAG_OUT_OF_RANGE_ZERO));
}

// Negative test on not toggling instr_out_of_range when instr_size > bytes_to_read
TEST(InstrFetchingConstrainingTest, NegativeNotTogglingInstrOutOfRange)
{
    TestTraceContainer trace({
        {
            { C::instr_fetching_bytes_to_read, 11 },
            { C::instr_fetching_instr_abs_diff, 0 },
            { C::instr_fetching_instr_out_of_range, 1 }, // Will be mutated to zero
            { C::instr_fetching_instr_size, 12 },
            { C::instr_fetching_sel, 1 },
        },
    });

    check_relation<instr_fetching>(trace, instr_fetching::SR_INSTR_OUT_OF_RANGE_TOGGLE);

    trace.set(C::instr_fetching_instr_out_of_range, 0, 0); // Mutate to wrong value

    EXPECT_THROW_WITH_MESSAGE(check_relation<instr_fetching>(trace, instr_fetching::SR_INSTR_OUT_OF_RANGE_TOGGLE),
                              instr_fetching::get_subrelation_label(instr_fetching::SR_INSTR_OUT_OF_RANGE_TOGGLE));
}

// Negative test on wrongly toggling instr_out_of_range when instr_size <= bytes_to_read
TEST(InstrFetchingConstrainingTest, NegativeTogglingInstrInRange)
{
    TestTraceContainer trace({
        {
            { C::instr_fetching_bytes_to_read, 12 },
            { C::instr_fetching_instr_abs_diff, 0 },
            { C::instr_fetching_instr_out_of_range, 0 }, // Will be mutated to 1
            { C::instr_fetching_instr_size, 12 },
            { C::instr_fetching_sel, 1 },
        },
    });

    check_relation<instr_fetching>(trace, instr_fetching::SR_INSTR_OUT_OF_RANGE_TOGGLE);

    trace.set(C::instr_fetching_instr_out_of_range, 0, 1); // Mutate to wrong value

    EXPECT_THROW_WITH_MESSAGE(check_relation<instr_fetching>(trace, instr_fetching::SR_INSTR_OUT_OF_RANGE_TOGGLE),
                              instr_fetching::get_subrelation_label(instr_fetching::SR_INSTR_OUT_OF_RANGE_TOGGLE));
}

// Negative test on not toggling pc_out_of_range when pc >= bytecode_size
TEST(InstrFetchingConstrainingTest, NegativeNotTogglingPcOutOfRange)
{
    TestTraceContainer trace({
        {
            { C::instr_fetching_bytecode_size, 12 },
            { C::instr_fetching_pc, 12 },
            { C::instr_fetching_pc_abs_diff, 0 },
            { C::instr_fetching_pc_out_of_range, 1 }, // Will be mutated to 0
            { C::instr_fetching_sel, 1 },
        },
    });

    check_relation<instr_fetching>(trace, instr_fetching::SR_PC_OUT_OF_RANGE_TOGGLE);

    trace.set(C::instr_fetching_pc_out_of_range, 0, 0); // Mutate to wrong value

    EXPECT_THROW_WITH_MESSAGE(check_relation<instr_fetching>(trace, instr_fetching::SR_PC_OUT_OF_RANGE_TOGGLE),
                              instr_fetching::get_subrelation_label(instr_fetching::SR_PC_OUT_OF_RANGE_TOGGLE));
}

// Negative test on setting sel_has_tag when pc >= bytecode_size
TEST(InstrFetchingConstrainingTest, NegativeTagSelPcOutOfRange)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        {
            { C::instr_fetching_bytecode_size, 12 },
            { C::instr_fetching_pc, 12 },
            { C::instr_fetching_pc_abs_diff, 0 },
            { C::instr_fetching_pc_out_of_range, 1 },
            { C::instr_fetching_sel_pc_in_range, 0 },
            { C::instr_fetching_sel_has_tag, 0 }, // Will be mutated to 1
            { C::instr_fetching_sel, 1 },
        },
    });

    check_relation<instr_fetching>(trace, instr_fetching::SR_SEL_HAS_TAG_ZERO);

    trace.set(C::instr_fetching_sel_has_tag, 1, 1); // Mutate to wrong value

    EXPECT_THROW_WITH_MESSAGE(check_relation<instr_fetching>(trace, instr_fetching::SR_SEL_HAS_TAG_ZERO),
                              instr_fetching::get_subrelation_label(instr_fetching::SR_SEL_HAS_TAG_ZERO));
}

// Negative test on wrongly toggling pc_out_of_range when pc < bytecode_size
TEST(InstrFetchingConstrainingTest, NegativeTogglingPcInRange)
{
    TestTraceContainer trace({
        {
            { C::instr_fetching_bytecode_size, 12 },
            { C::instr_fetching_pc, 11 },
            { C::instr_fetching_pc_abs_diff, 0 },
            { C::instr_fetching_pc_out_of_range, 0 }, // Will be mutated to 1
            { C::instr_fetching_sel, 1 },
        },
    });

    check_relation<instr_fetching>(trace, instr_fetching::SR_PC_OUT_OF_RANGE_TOGGLE);

    trace.set(C::instr_fetching_pc_out_of_range, 0, 1); // Mutate to wrong value

    EXPECT_THROW_WITH_MESSAGE(check_relation<instr_fetching>(trace, instr_fetching::SR_PC_OUT_OF_RANGE_TOGGLE),
                              instr_fetching::get_subrelation_label(instr_fetching::SR_PC_OUT_OF_RANGE_TOGGLE));
}

TEST(InstrFetchingConstrainingTest, ErrorFlagSetButSelParsingErrIsZero)
{
    // Create a minimal trace that satisfies all constraints EXCEPT the (commented out) one
    // that should enforce sel_parsing_err = pc_out_of_range + opcode_out_of_range + instr_out_of_range +
    // tag_out_of_range
    TestTraceContainer trace({
        {
            { C::instr_fetching_sel, 1 },
            // Error flags - pc_out_of_range is SET to 1
            { C::instr_fetching_pc_out_of_range, 1 },
            { C::instr_fetching_opcode_out_of_range, 0 },
            { C::instr_fetching_instr_out_of_range, 0 },
            { C::instr_fetching_tag_out_of_range, 0 },
            // sel_parsing_err should be 1 (since pc_out_of_range = 1) but we set it to 0
            { C::instr_fetching_sel_parsing_err, 0 },
            // Values to satisfy PC_OUT_OF_RANGE_TOGGLE constraint (subrelation 4):
            // pc_abs_diff = sel * ((2 * pc_out_of_range - 1) * (pc - bytecode_size) - 1 + pc_out_of_range)
            // With pc_out_of_range = 1: pc_abs_diff = (2*1-1) * (pc - bytecode_size) - 1 + 1 = pc - bytecode_size
            { C::instr_fetching_bytecode_size, 10 },
            { C::instr_fetching_pc, 15 },              // pc > bytecode_size
            { C::instr_fetching_pc_abs_diff, 5 },      // pc - bytecode_size = 15 - 10 = 5
            { C::instr_fetching_pc_size_in_bits, 32 }, // AVM_PC_SIZE_IN_BITS constant
            // Values to satisfy INSTR_OUT_OF_RANGE_TOGGLE constraint (subrelation 6):
            // instr_abs_diff = (2 * instr_out_of_range - 1) * (instr_size - bytes_to_read) - instr_out_of_range
            // With instr_out_of_range = 0: instr_abs_diff = (-1) * (instr_size - bytes_to_read) = bytes_to_read -
            // instr_size
            { C::instr_fetching_bytes_to_read, 10 },
            { C::instr_fetching_instr_size, 5 },
            { C::instr_fetching_instr_abs_diff, 5 }, // bytes_to_read - instr_size = 10 - 5 = 5
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<instr_fetching>(trace),
                              "Relation instr_fetching, subrelation .* failed at row 0");
}

/**
 * This test verifies that when sel_parsing_err is correctly set to 1 when errors occur,
 * the relation passes. This should continue to pass after the fix.
 */
TEST(InstrFetchingConstrainingTest, CorrectBehaviorSelParsingErrMatchesErrors)
{
    TestTraceContainer trace({
        {
            { C::instr_fetching_sel, 1 },
            { C::instr_fetching_pc_out_of_range, 1 },
            { C::instr_fetching_opcode_out_of_range, 0 },
            { C::instr_fetching_instr_out_of_range, 0 },
            { C::instr_fetching_tag_out_of_range, 0 },
            { C::instr_fetching_sel_parsing_err, 1 }, // Correctly set to 1
            // Supporting values
            { C::instr_fetching_bytecode_size, 10 },
            { C::instr_fetching_pc, 15 },
            { C::instr_fetching_pc_abs_diff, 5 },
            { C::instr_fetching_pc_size_in_bits, 32 },
            { C::instr_fetching_bytes_to_read, 10 },
            { C::instr_fetching_instr_size, 5 },
            { C::instr_fetching_instr_abs_diff, 5 }, // bytes_to_read - instr_size = 10 - 5 = 5
        },
    });

    // This should pass both before and after the fix.
    check_relation<instr_fetching>(trace);
}

/**
 * No errors means sel_parsing_err should be 0
 */
TEST(InstrFetchingConstrainingTest, CorrectBehaviorNoErrorsMeansSelParsingErrIsZero)
{
    TestTraceContainer trace({
        {
            { C::instr_fetching_sel, 1 },
            { C::instr_fetching_pc_out_of_range, 0 },
            { C::instr_fetching_opcode_out_of_range, 0 },
            { C::instr_fetching_instr_out_of_range, 0 },
            { C::instr_fetching_tag_out_of_range, 0 },
            { C::instr_fetching_sel_parsing_err, 0 }, // Correctly set to 0
            { C::instr_fetching_sel_pc_in_range, 1 }, // sel * (1 - pc_out_of_range) = 1 * 1 = 1
            // pc_abs_diff = sel * ((2 * pc_out_of_range - 1) * (pc - bytecode_size) - 1 + pc_out_of_range)
            // With pc_out_of_range = 0: pc_abs_diff = (2*0-1) * (pc - bytecode_size) - 1 + 0
            //                         = -(pc - bytecode_size) - 1 = bytecode_size - pc - 1
            { C::instr_fetching_bytecode_size, 20 },
            { C::instr_fetching_pc, 5 },
            { C::instr_fetching_pc_abs_diff, 14 }, // bytecode_size - pc - 1 = 20 - 5 - 1 = 14
            { C::instr_fetching_pc_size_in_bits, 32 },
            // instr_abs_diff = bytes_to_read - instr_size (when instr_out_of_range = 0)
            { C::instr_fetching_bytes_to_read, 15 },
            { C::instr_fetching_instr_size, 10 },
            { C::instr_fetching_instr_abs_diff, 5 }, // bytes_to_read - instr_size = 15 - 10 = 5
        },
    });

    // This should pass both before and after the fix.
    check_relation<instr_fetching>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
