#include "barretenberg/vm2/simulation/emit_unencrypted_log.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_memory.hpp"

namespace bb::avm2::simulation {

using ::testing::_;
using ::testing::ElementsAre;
using ::testing::Return;
using ::testing::ReturnRef;
using ::testing::StrictMock;

TEST(EmitUnencryptedLogTest, Basic)
{
    StrictMock<MockMemory> memory;
    StrictMock<MockContext> context;
    StrictMock<MockGreaterThan> greater_than;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EventEmitter<EmitUnencryptedLogEvent> event_emitter;

    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_offset = 27;
    uint32_t log_size = 2;
    uint64_t end_log_address = 28;
    SideEffectStates side_effect_states = { .numUnencryptedLogs = 0 };
    SideEffectStates next_side_effect_states = { .numUnencryptedLogs = 1 };

    EmitUnencryptedLog emit_unencrypted_log(execution_id_manager, greater_than, event_emitter);

    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(Return(1));
    EXPECT_CALL(greater_than, gt(log_size, PUBLIC_LOG_SIZE_IN_FIELDS)).WillOnce(Return(false));
    EXPECT_CALL(greater_than, gt(end_log_address, AVM_HIGHEST_MEM_ADDRESS)).WillOnce(Return(false));

    EXPECT_CALL(context, get_side_effect_states()).WillOnce(ReturnRef(side_effect_states));
    EXPECT_CALL(context, set_side_effect_states(next_side_effect_states));

    EXPECT_CALL(memory, get(_)).WillRepeatedly([](MemoryAddress address) -> const MemoryValue& {
        static thread_local MemoryValue value;
        value = MemoryValue::from<FF>(FF(address));
        return value;
    });

    EXPECT_CALL(memory, get_space_id()).WillOnce(Return(57));
    EXPECT_CALL(context, get_is_static()).WillOnce(Return(false));

    emit_unencrypted_log.emit_unencrypted_log(memory, context, address, log_offset, log_size);

    EmitUnencryptedLogWriteEvent expect_event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_offset,
        .log_size = log_size,
        .prev_num_unencrypted_logs = side_effect_states.numUnencryptedLogs,
        .next_num_unencrypted_logs = next_side_effect_states.numUnencryptedLogs,
        .is_static = false,
        .values = { MemoryValue::from<FF>(FF(log_offset)), MemoryValue::from<FF>(FF(log_offset + 1)) },
        .error_too_large = false,
        .error_memory_out_of_bounds = false,
        .error_too_many_logs = false,
        .error_tag_mismatch = false,
    };

    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

TEST(EmitUnencryptedLogTest, NegativeTooLarge)
{
    StrictMock<MockMemory> memory;
    StrictMock<MockContext> context;
    StrictMock<MockGreaterThan> greater_than;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EventEmitter<EmitUnencryptedLogEvent> event_emitter;

    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_offset = 27;
    uint32_t log_size = PUBLIC_LOG_SIZE_IN_FIELDS + 1;
    uint64_t end_log_address = log_offset + log_size - 1;
    SideEffectStates side_effect_states = { .numUnencryptedLogs = 0 };
    SideEffectStates next_side_effect_states = { .numUnencryptedLogs = 0 };

    EmitUnencryptedLog emit_unencrypted_log(execution_id_manager, greater_than, event_emitter);

    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(Return(1));
    EXPECT_CALL(greater_than, gt(log_size, PUBLIC_LOG_SIZE_IN_FIELDS)).WillOnce(Return(true));
    EXPECT_CALL(greater_than, gt(end_log_address, AVM_HIGHEST_MEM_ADDRESS)).WillOnce(Return(false));

    EXPECT_CALL(context, get_side_effect_states()).WillOnce(ReturnRef(side_effect_states));
    EXPECT_CALL(context, set_side_effect_states(next_side_effect_states));

    EXPECT_CALL(memory, get(_)).WillRepeatedly([](MemoryAddress address) -> const MemoryValue& {
        static thread_local MemoryValue value;
        value = MemoryValue::from<FF>(FF(address));
        return value;
    });

    EXPECT_CALL(memory, get_space_id()).WillOnce(Return(57));
    EXPECT_CALL(context, get_is_static()).WillOnce(Return(false));

    EXPECT_THROW(emit_unencrypted_log.emit_unencrypted_log(memory, context, address, log_offset, log_size),
                 EmitUnencryptedLogException);

    std::vector<MemoryValue> expected_values;

    for (uint32_t i = 0; i < PUBLIC_LOG_SIZE_IN_FIELDS; ++i) {
        expected_values.push_back(MemoryValue::from<FF>(FF(log_offset + i)));
    }

    EmitUnencryptedLogWriteEvent expect_event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_offset,
        .log_size = log_size,
        .prev_num_unencrypted_logs = side_effect_states.numUnencryptedLogs,
        .next_num_unencrypted_logs = next_side_effect_states.numUnencryptedLogs,
        .is_static = false,
        .values = expected_values,
        .error_too_large = true,
        .error_memory_out_of_bounds = false,
        .error_too_many_logs = false,
        .error_tag_mismatch = false,
    };

    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

TEST(EmitUnencryptedLogTest, NegativeMemoryOutOfBounds)
{
    StrictMock<MockMemory> memory;
    StrictMock<MockContext> context;
    StrictMock<MockGreaterThan> greater_than;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EventEmitter<EmitUnencryptedLogEvent> event_emitter;

    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_offset = AVM_HIGHEST_MEM_ADDRESS;
    uint32_t log_size = 2;
    uint64_t end_log_address = static_cast<uint64_t>(log_offset) + log_size - 1;
    SideEffectStates side_effect_states = { .numUnencryptedLogs = 0 };
    SideEffectStates next_side_effect_states = { .numUnencryptedLogs = 0 };

    EmitUnencryptedLog emit_unencrypted_log(execution_id_manager, greater_than, event_emitter);

    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(Return(1));
    EXPECT_CALL(greater_than, gt(log_size, PUBLIC_LOG_SIZE_IN_FIELDS)).WillOnce(Return(false));
    EXPECT_CALL(greater_than, gt(end_log_address, AVM_HIGHEST_MEM_ADDRESS)).WillOnce(Return(true));

    EXPECT_CALL(context, get_side_effect_states()).WillOnce(ReturnRef(side_effect_states));
    EXPECT_CALL(context, set_side_effect_states(next_side_effect_states));

    EXPECT_CALL(memory, get_space_id()).WillOnce(Return(57));
    EXPECT_CALL(context, get_is_static()).WillOnce(Return(false));

    EXPECT_THROW(emit_unencrypted_log.emit_unencrypted_log(memory, context, address, log_offset, log_size),
                 EmitUnencryptedLogException);

    EmitUnencryptedLogWriteEvent expect_event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_offset,
        .log_size = log_size,
        .prev_num_unencrypted_logs = side_effect_states.numUnencryptedLogs,
        .next_num_unencrypted_logs = next_side_effect_states.numUnencryptedLogs,
        .is_static = false,
        .values = {},
        .error_too_large = false,
        .error_memory_out_of_bounds = true,
        .error_too_many_logs = false,
        .error_tag_mismatch = false,
    };

    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

TEST(EmitUnencryptedLogTest, NegativeTooManyLogs)
{
    StrictMock<MockMemory> memory;
    StrictMock<MockContext> context;
    StrictMock<MockGreaterThan> greater_than;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EventEmitter<EmitUnencryptedLogEvent> event_emitter;

    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_offset = 27;
    uint32_t log_size = 2;
    uint64_t end_log_address = 28;
    SideEffectStates side_effect_states = { .numUnencryptedLogs = MAX_PUBLIC_LOGS_PER_TX };
    SideEffectStates next_side_effect_states = { .numUnencryptedLogs = MAX_PUBLIC_LOGS_PER_TX };

    EmitUnencryptedLog emit_unencrypted_log(execution_id_manager, greater_than, event_emitter);

    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(Return(1));
    EXPECT_CALL(greater_than, gt(log_size, PUBLIC_LOG_SIZE_IN_FIELDS)).WillOnce(Return(false));
    EXPECT_CALL(greater_than, gt(end_log_address, AVM_HIGHEST_MEM_ADDRESS)).WillOnce(Return(false));

    EXPECT_CALL(context, get_side_effect_states()).WillOnce(ReturnRef(side_effect_states));
    EXPECT_CALL(context, set_side_effect_states(next_side_effect_states));

    EXPECT_CALL(memory, get(_)).WillRepeatedly([](MemoryAddress address) -> const MemoryValue& {
        static thread_local MemoryValue value;
        value = MemoryValue::from<FF>(FF(address));
        return value;
    });

    EXPECT_CALL(memory, get_space_id()).WillOnce(Return(57));
    EXPECT_CALL(context, get_is_static()).WillOnce(Return(false));

    EXPECT_THROW(emit_unencrypted_log.emit_unencrypted_log(memory, context, address, log_offset, log_size),
                 EmitUnencryptedLogException);

    EmitUnencryptedLogWriteEvent expect_event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_offset,
        .log_size = log_size,
        .prev_num_unencrypted_logs = side_effect_states.numUnencryptedLogs,
        .next_num_unencrypted_logs = next_side_effect_states.numUnencryptedLogs,
        .is_static = false,
        .values = { MemoryValue::from<FF>(FF(log_offset)), MemoryValue::from<FF>(FF(log_offset + 1)) },
        .error_too_large = false,
        .error_memory_out_of_bounds = false,
        .error_too_many_logs = true,
        .error_tag_mismatch = false,
    };

    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

TEST(EmitUnencryptedLogTest, NegativeTagMismatch)
{
    StrictMock<MockMemory> memory;
    StrictMock<MockContext> context;
    StrictMock<MockGreaterThan> greater_than;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EventEmitter<EmitUnencryptedLogEvent> event_emitter;

    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_offset = 27;
    uint32_t log_size = 2;
    uint64_t end_log_address = 28;
    SideEffectStates side_effect_states = { .numUnencryptedLogs = 0 };
    SideEffectStates next_side_effect_states = { .numUnencryptedLogs = 0 };

    EmitUnencryptedLog emit_unencrypted_log(execution_id_manager, greater_than, event_emitter);

    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(Return(1));
    EXPECT_CALL(greater_than, gt(log_size, PUBLIC_LOG_SIZE_IN_FIELDS)).WillOnce(Return(false));
    EXPECT_CALL(greater_than, gt(end_log_address, AVM_HIGHEST_MEM_ADDRESS)).WillOnce(Return(false));

    EXPECT_CALL(context, get_side_effect_states()).WillOnce(ReturnRef(side_effect_states));
    EXPECT_CALL(context, set_side_effect_states(next_side_effect_states));

    EXPECT_CALL(memory, get(_)).WillRepeatedly([](MemoryAddress address) -> const MemoryValue& {
        static thread_local MemoryValue value;
        value = MemoryValue::from<uint32_t>(address);
        return value;
    });

    EXPECT_CALL(memory, get_space_id()).WillOnce(Return(57));
    EXPECT_CALL(context, get_is_static()).WillOnce(Return(false));

    EXPECT_THROW(emit_unencrypted_log.emit_unencrypted_log(memory, context, address, log_offset, log_size),
                 EmitUnencryptedLogException);

    EmitUnencryptedLogWriteEvent expect_event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_offset,
        .log_size = log_size,
        .prev_num_unencrypted_logs = side_effect_states.numUnencryptedLogs,
        .next_num_unencrypted_logs = next_side_effect_states.numUnencryptedLogs,
        .is_static = false,
        .values = { MemoryValue::from<uint32_t>(log_offset), MemoryValue::from<uint32_t>(log_offset + 1) },
        .error_too_large = false,
        .error_memory_out_of_bounds = false,
        .error_too_many_logs = false,
        .error_tag_mismatch = true,
    };

    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

TEST(EmitUnencryptedLogTest, NegativeStatic)
{
    StrictMock<MockMemory> memory;
    StrictMock<MockContext> context;
    StrictMock<MockGreaterThan> greater_than;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EventEmitter<EmitUnencryptedLogEvent> event_emitter;

    AztecAddress address = 0xdeadbeef;
    MemoryAddress log_offset = 27;
    uint32_t log_size = 2;
    uint64_t end_log_address = 28;
    SideEffectStates side_effect_states = { .numUnencryptedLogs = 0 };
    SideEffectStates next_side_effect_states = { .numUnencryptedLogs = 0 };

    EmitUnencryptedLog emit_unencrypted_log(execution_id_manager, greater_than, event_emitter);

    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(Return(1));
    EXPECT_CALL(greater_than, gt(log_size, PUBLIC_LOG_SIZE_IN_FIELDS)).WillOnce(Return(false));
    EXPECT_CALL(greater_than, gt(end_log_address, AVM_HIGHEST_MEM_ADDRESS)).WillOnce(Return(false));

    EXPECT_CALL(context, get_side_effect_states()).WillOnce(ReturnRef(side_effect_states));
    EXPECT_CALL(context, set_side_effect_states(next_side_effect_states));

    EXPECT_CALL(memory, get(_)).WillRepeatedly([](MemoryAddress address) -> const MemoryValue& {
        static thread_local MemoryValue value;
        value = MemoryValue::from<FF>(FF(address));
        return value;
    });

    EXPECT_CALL(memory, get_space_id()).WillOnce(Return(57));
    EXPECT_CALL(context, get_is_static()).WillOnce(Return(true));

    EXPECT_THROW(emit_unencrypted_log.emit_unencrypted_log(memory, context, address, log_offset, log_size),
                 EmitUnencryptedLogException);

    EmitUnencryptedLogWriteEvent expect_event = {
        .execution_clk = 1,
        .contract_address = address,
        .space_id = 57,
        .log_address = log_offset,
        .log_size = log_size,
        .prev_num_unencrypted_logs = side_effect_states.numUnencryptedLogs,
        .next_num_unencrypted_logs = next_side_effect_states.numUnencryptedLogs,
        .is_static = true,
        .values = { MemoryValue::from<FF>(FF(log_offset)), MemoryValue::from<FF>(FF(log_offset + 1)) },
        .error_too_large = false,
        .error_memory_out_of_bounds = false,
        .error_too_many_logs = false,
        .error_tag_mismatch = false,
    };

    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

TEST(EmitUnencryptedLogTest, CheckpointListener)
{
    StrictMock<MockMemory> memory;
    StrictMock<MockContext> context;
    StrictMock<MockGreaterThan> greater_than;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EventEmitter<EmitUnencryptedLogEvent> event_emitter;
    EmitUnencryptedLog emit_unencrypted_log(execution_id_manager, greater_than, event_emitter);

    emit_unencrypted_log.on_checkpoint_created();
    emit_unencrypted_log.on_checkpoint_committed();
    emit_unencrypted_log.on_checkpoint_reverted();
    EXPECT_THAT(event_emitter.get_events().size(), 3);
    EXPECT_THAT(event_emitter.dump_events(),
                ElementsAre(CheckPointEventType::CREATE_CHECKPOINT,
                            CheckPointEventType::COMMIT_CHECKPOINT,
                            CheckPointEventType::REVERT_CHECKPOINT));
}

} // namespace bb::avm2::simulation
