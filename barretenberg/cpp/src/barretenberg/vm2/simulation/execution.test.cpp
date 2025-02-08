#include "barretenberg/vm2/simulation/execution.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <memory>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_addressing.hpp"
#include "barretenberg/vm2/simulation/testing/mock_alu.hpp"
#include "barretenberg/vm2/simulation/testing/mock_bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context_stack.hpp"
#include "barretenberg/vm2/simulation/testing/mock_memory.hpp"

namespace bb::avm2::simulation {
namespace {

using ::testing::_;
using ::testing::Ref;
using ::testing::Return;
using ::testing::ReturnRef;
using ::testing::StrictMock;

class AvmSimulationExecutionTest : public ::testing::Test {
  protected:
    AvmSimulationExecutionTest() { ON_CALL(context, get_memory).WillByDefault(ReturnRef(memory)); }

    StrictMock<MockAlu> alu;
    StrictMock<MockAddressing> addressing;
    StrictMock<MockMemory> memory;
    StrictMock<MockContextProvider> context_provider;
    StrictMock<MockContextStack> context_stack;
    InstructionInfoDB instruction_info_db; // Using the real thing.
    StrictMock<MockContext> context;
    EventEmitter<ExecutionEvent> execution_event_emitter;
    Execution execution =
        Execution(alu, addressing, context_provider, context_stack, instruction_info_db, execution_event_emitter);
};

TEST_F(AvmSimulationExecutionTest, Add)
{
    EXPECT_CALL(alu, add(Ref(context), 4, 5, 6));
    execution.add(context, 4, 5, 6);
}

TEST_F(AvmSimulationExecutionTest, ReturnNotTopLevel)
{
    MemoryAddress ret_offset = 1;
    MemoryAddress ret_size_offset = 2;
    size_t ret_size = 7;
    FF ret_size_ff = ret_size;
    std::vector<FF> returndata = { 1, 2, 3, 4, 5 };

    // The context that we have already set up will be the CHILD context.
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get(ret_size_offset)).WillOnce(Return<ValueRefAndTag>({ ret_size_ff, MemoryTag::U32 }));
    EXPECT_CALL(memory, get_slice(ret_offset, ret_size)).WillOnce(Return<SliceWithTags>({ returndata, {} }));
    EXPECT_CALL(context_stack, pop);

    // After popping, we expect to get the parent context (since we are not at the top level).
    StrictMock<MockContext> parent_context;
    EXPECT_CALL(context_stack, empty).WillOnce(Return(false));
    EXPECT_CALL(context_stack, current).WillOnce(ReturnRef(parent_context));
    EXPECT_CALL(parent_context, set_nested_returndata(returndata));

    execution.ret(context, 1, 2);
}

// FIXME: Way too long and complicated.
// TEST_F(AvmSimulationExecutionTest, ExecutionLoop)
// {
//     MockBytecodeManager bytecode_manager;
//     EXPECT_CALL(context, get_bytecode_manager).WillRepeatedly(ReturnRef(bytecode_manager));
//     EXPECT_CALL(context, get_memory).Times(2);

//     // First instruction is an ADD_8.
//     Instruction add8(WireOpCode::ADD_8, 0, { Operand::u8(1), Operand::u8(2), Operand::u8(3) });
//     EXPECT_CALL(context, get_pc).WillOnce(Return(0));
//     EXPECT_CALL(bytecode_manager, read_instruction(0))
//         .WillOnce(Return(std::pair<Instruction, uint32_t>(add8, /*bytes_read*/ 10)));
//     EXPECT_CALL(context, set_next_pc(10));
//     EXPECT_CALL(addressing, resolve).WillOnce(Return(std::vector<MemoryAddress>({ 4, 5, 6 })));
//     EXPECT_CALL(alu, add);
//     EXPECT_CALL(context, get_next_pc).WillOnce(Return(10));
//     EXPECT_CALL(context, set_pc(10));

//     // Then we just return.
//     Instruction ret(WireOpCode::RETURN, 0, { Operand::u16(1), Operand::u16(2) });
//     EXPECT_CALL(context, get_pc).WillOnce(Return(10));
//     EXPECT_CALL(bytecode_manager, read_instruction(10))
//         .WillOnce(Return(std::pair<Instruction, uint32_t>(ret, /*bytes_read*/ 5)));
//     EXPECT_CALL(context, set_next_pc(15));
//     EXPECT_CALL(addressing, resolve).WillOnce(Return(std::vector<MemoryAddress>({ 2, 1 })));
//     FF zero = 0; // ugh
//     EXPECT_CALL(memory, get(1)).WillOnce(Return(ValueRefAndTag({ zero, MemoryTag::U32 })));
//     EXPECT_CALL(memory, get_slice(2, 0)).WillOnce(Return(SliceWithTags({}, {})));
//     EXPECT_CALL(context, get_next_pc).WillOnce(Return(18));
//     EXPECT_CALL(context, set_pc(18));

//     execution.enter_context(std::move(context_obj));
//     execution.run();
// }

} // namespace
} // namespace bb::avm2::simulation