#include "barretenberg/vm2/simulation/gadgets/execution.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <memory>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/common/to_radix.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/context.hpp"
#include "barretenberg/vm2/simulation/gadgets/context_provider.hpp"
#include "barretenberg/vm2/simulation/gadgets/gas_tracker.hpp"
#include "barretenberg/vm2/simulation/gadgets/memory.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation/testing/mock_alu.hpp"
#include "barretenberg/vm2/simulation/testing/mock_bitwise.hpp"
#include "barretenberg/vm2/simulation/testing/mock_bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context_provider.hpp"
#include "barretenberg/vm2/simulation/testing/mock_data_copy.hpp"
#include "barretenberg/vm2/simulation/testing/mock_dbs.hpp"
#include "barretenberg/vm2/simulation/testing/mock_debug_log.hpp"
#include "barretenberg/vm2/simulation/testing/mock_ecc.hpp"
#include "barretenberg/vm2/simulation/testing/mock_emit_unencrypted_log.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_components.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gas_tracker.hpp"
#include "barretenberg/vm2/simulation/testing/mock_get_contract_instance.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_internal_call_stack.hpp"
#include "barretenberg/vm2/simulation/testing/mock_keccakf1600.hpp"
#include "barretenberg/vm2/simulation/testing/mock_memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_poseidon2.hpp"
#include "barretenberg/vm2/simulation/testing/mock_sha256.hpp"
#include "barretenberg/vm2/simulation/testing/mock_to_radix.hpp"
#include "barretenberg/vm2/testing/macros.hpp"

namespace bb::avm2::simulation {
namespace {

using ::testing::_;
using ::testing::NiceMock;
using ::testing::Return;
using ::testing::ReturnRef;
using ::testing::StrictMock;
using ::testing::Throw;

// TODO(fcarreiro): This is a hack to get the gas tracker for testing.
class TestingExecution : public Execution {
  public:
    using Execution::Execution;

    void set_gas_tracker(GasTrackerInterface& gas_tracker) { this->testing_gas_tracker = &gas_tracker; }

    GasTrackerInterface& get_gas_tracker() override { return *testing_gas_tracker; }

  private:
    GasTrackerInterface* testing_gas_tracker;
};

class ExecutionSimulationTest : public ::testing::Test {
  protected:
    ExecutionSimulationTest()
    {
        ON_CALL(context, get_memory).WillByDefault(ReturnRef(memory));
        ON_CALL(context, get_bytecode_manager).WillByDefault(ReturnRef(bytecode_manager));
        execution.set_gas_tracker(gas_tracker);
    }

    StrictMock<MockAlu> alu;
    StrictMock<MockBitwise> bitwise;
    StrictMock<MockMemory> memory;
    StrictMock<MockExecutionComponentsProvider> execution_components;
    StrictMock<MockContext> context;
    StrictMock<MockDataCopy> data_copy;
    StrictMock<MockInternalCallStackManager> internal_call_stack_manager;
    StrictMock<MockKeccakF1600> keccakf1600;
    StrictMock<MockGetContractInstance> get_contract_instance;
    EventEmitter<ExecutionEvent> execution_event_emitter;
    EventEmitter<ContextStackEvent> context_stack_event_emitter;
    InstructionInfoDB instruction_info_db; // Using the real thing.
    StrictMock<MockContextProvider> context_provider;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGasTracker> gas_tracker;
    StrictMock<MockHighLevelMerkleDB> merkle_db;
    StrictMock<MockGreaterThan> greater_than;
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockEcc> ecc;
    StrictMock<MockToRadix> to_radix;
    StrictMock<MockEmitUnencryptedLog> emit_unencrypted_log;
    StrictMock<MockBytecodeManager> bytecode_manager;
    StrictMock<MockSha256> sha256;
    StrictMock<MockDebugLog> debug_log;
    TestingExecution execution = TestingExecution(alu,
                                                  bitwise,
                                                  data_copy,
                                                  poseidon2,
                                                  ecc,
                                                  to_radix,
                                                  sha256,
                                                  execution_components,
                                                  context_provider,
                                                  instruction_info_db,
                                                  execution_id_manager,
                                                  execution_event_emitter,
                                                  context_stack_event_emitter,
                                                  keccakf1600,
                                                  greater_than,
                                                  get_contract_instance,
                                                  emit_unencrypted_log,
                                                  debug_log,
                                                  merkle_db);
};

// NOTE: MemoryAddresses x, y used in the below tests like: execution.fn(context, x, y, ..) are just unchecked arbitrary
// addresses. We test the MemoryValues and destination addresses.

TEST_F(ExecutionSimulationTest, Add)
{
    MemoryValue a = MemoryValue::from<uint32_t>(4);
    MemoryValue b = MemoryValue::from<uint32_t>(5);

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get).Times(2).WillOnce(ReturnRef(a)).WillOnce(ReturnRef(b));
    EXPECT_CALL(alu, add(a, b)).WillOnce(Return(MemoryValue::from<uint32_t>(9)));
    EXPECT_CALL(memory, set(6, MemoryValue::from<uint32_t>(9)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.add(context, 4, 5, 6);
}

TEST_F(ExecutionSimulationTest, Sub)
{
    MemoryValue a = MemoryValue::from<uint64_t>(5);
    MemoryValue b = MemoryValue::from<uint64_t>(3);

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get).Times(2).WillOnce(ReturnRef(a)).WillOnce(ReturnRef(b));
    EXPECT_CALL(alu, sub(a, b)).WillOnce(Return(MemoryValue::from<uint64_t>(2)));
    EXPECT_CALL(memory, set(3, MemoryValue::from<uint64_t>(2)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.sub(context, 1, 2, 3);
}

TEST_F(ExecutionSimulationTest, Mul)
{
    uint128_t max = static_cast<uint128_t>(get_tag_max_value(ValueTag::U128));
    auto a = MemoryValue::from<uint128_t>(max);
    auto b = MemoryValue::from<uint128_t>(max - 3);

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get).Times(2).WillOnce(ReturnRef(a)).WillOnce(ReturnRef(b));
    EXPECT_CALL(alu, mul(a, b)).WillOnce(Return(MemoryValue::from<uint128_t>(4)));
    EXPECT_CALL(memory, set(3, MemoryValue::from<uint128_t>(4)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.mul(context, 1, 2, 3);
}

TEST_F(ExecutionSimulationTest, Div)
{
    auto a = MemoryValue::from<uint128_t>(6);
    auto b = MemoryValue::from<uint128_t>(3);

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get).Times(2).WillOnce(ReturnRef(a)).WillOnce(ReturnRef(b));
    EXPECT_CALL(alu, div(a, b)).WillOnce(Return(MemoryValue::from<uint128_t>(2)));
    EXPECT_CALL(memory, set(3, MemoryValue::from<uint128_t>(2)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.div(context, 1, 2, 3);
}

TEST_F(ExecutionSimulationTest, FDiv)
{
    auto a = MemoryValue::from<FF>(FF::modulus - 4);
    auto b = MemoryValue::from<FF>(2);

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get).Times(2).WillOnce(ReturnRef(a)).WillOnce(ReturnRef(b));
    EXPECT_CALL(alu, fdiv(a, b)).WillOnce(Return(MemoryValue::from<FF>(FF::modulus - 2)));
    EXPECT_CALL(memory, set(3, MemoryValue::from<FF>(FF::modulus - 2)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.fdiv(context, 1, 2, 3);
}

TEST_F(ExecutionSimulationTest, Shl)
{
    auto a = MemoryValue::from<uint32_t>(64);
    auto b = MemoryValue::from<uint32_t>(2);

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get).Times(2).WillOnce(ReturnRef(a)).WillOnce(ReturnRef(b));
    EXPECT_CALL(alu, shl(a, b)).WillOnce(Return(MemoryValue::from<uint32_t>(256)));
    EXPECT_CALL(memory, set(3, MemoryValue::from<uint32_t>(256)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.shl(context, 1, 2, 3);
}

TEST_F(ExecutionSimulationTest, Shr)
{
    auto a = MemoryValue::from<uint64_t>(64);
    auto b = MemoryValue::from<uint64_t>(2);

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get).Times(2).WillOnce(ReturnRef(a)).WillOnce(ReturnRef(b));
    EXPECT_CALL(alu, shr(a, b)).WillOnce(Return(MemoryValue::from<uint64_t>(16)));
    EXPECT_CALL(memory, set(3, MemoryValue::from<uint64_t>(16)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.shr(context, 1, 2, 3);
}

// TODO(MW): Add alu tests here for other ops

TEST_F(ExecutionSimulationTest, Call)
{
    FF zero = 0;
    AztecAddress parent_address = 0xdeadbeef;
    AztecAddress nested_address = 0xc0ffee;
    MemoryValue nested_address_value = MemoryValue::from<FF>(nested_address);
    MemoryValue l2_gas_allocated = MemoryValue::from<uint32_t>(6);
    MemoryValue da_gas_allocated = MemoryValue::from<uint32_t>(7);
    MemoryValue cd_size = MemoryValue::from<uint32_t>(8);
    AppendOnlyTreeSnapshot written_public_data_slots_tree_snapshot = AppendOnlyTreeSnapshot{
        .root = 0x12345678,
        .nextAvailableLeafIndex = 10,
    };
    TreeStates tree_states = TreeStates {
        .noteHashTree = {
            .tree = {
                .root = 10,
                .nextAvailableLeafIndex = 9,
            },
            .counter = 8,
        },
        .nullifierTree = {
            .tree = {
                .root = 7,
                .nextAvailableLeafIndex = 6,
            },
            .counter = 5,
        },
        .l1ToL2MessageTree = {
            .tree = {
                .root = 4,
                .nextAvailableLeafIndex = 3,
            },
            .counter = 0,
        },
        .publicDataTree = {
            .tree = {
                .root = 2,
                .nextAvailableLeafIndex = 1,
            },
            .counter = 1,
        }
    };

    SideEffectStates side_effect_states = SideEffectStates{ .numUnencryptedLogFields = 1, .numL2ToL1Messages = 2 };

    EXPECT_CALL(gas_tracker, compute_gas_limit_for_call(Gas{ 6, 7 })).WillOnce(Return(Gas{ 2, 3 }));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    // Context snapshotting
    EXPECT_CALL(context, get_context_id);
    EXPECT_CALL(context, get_parent_id);
    EXPECT_CALL(context, get_bytecode_manager).WillOnce(ReturnRef(bytecode_manager));
    EXPECT_CALL(bytecode_manager, get_retrieved_bytecode_id).WillOnce(Return(FF(1)));
    EXPECT_CALL(context, get_next_pc);
    EXPECT_CALL(context, get_is_static).WillRepeatedly(Return(false));
    EXPECT_CALL(context, get_msg_sender).WillOnce(ReturnRef(parent_address));
    EXPECT_CALL(context, get_transaction_fee).WillOnce(ReturnRef(zero));
    EXPECT_CALL(context, get_parent_cd_addr);
    EXPECT_CALL(context, get_parent_cd_size);
    EXPECT_CALL(context, get_parent_gas_used);
    EXPECT_CALL(context, get_parent_gas_limit);
    EXPECT_CALL(context, get_written_public_data_slots_tree_snapshot)
        .WillOnce(Return(written_public_data_slots_tree_snapshot));
    EXPECT_CALL(context, get_side_effect_states).WillRepeatedly(ReturnRef(side_effect_states));

    EXPECT_CALL(context, get_phase).WillOnce(Return(TransactionPhase::APP_LOGIC));

    EXPECT_CALL(merkle_db, get_tree_state).WillOnce(Return(tree_states));

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(context, get_address).WillRepeatedly(ReturnRef(parent_address));
    EXPECT_CALL(memory, get(1)).WillOnce(ReturnRef(l2_gas_allocated));     // l2_gas_offset
    EXPECT_CALL(memory, get(2)).WillOnce(ReturnRef(da_gas_allocated));     // da_gas_offset
    EXPECT_CALL(memory, get(3)).WillOnce(ReturnRef(nested_address_value)); // contract_address
    EXPECT_CALL(memory, get(4)).WillOnce(ReturnRef(cd_size));              // cd_size

    auto nested_context = std::make_unique<NiceMock<MockContext>>();
    ON_CALL(*nested_context, halted())
        .WillByDefault(Return(true)); // We just want the recursive call to return immediately.

    EXPECT_CALL(context_provider,
                make_nested_context(nested_address,
                                    parent_address,
                                    _,
                                    _,
                                    _,
                                    _,
                                    _,
                                    Gas{ 2, 3 },
                                    side_effect_states,
                                    TransactionPhase::APP_LOGIC))
        .WillOnce(Return(std::move(nested_context)));

    execution.call(context,
                   /*l2_gas_offset=*/1,
                   /*da_gas_offset=*/2,
                   /*addr=*/3,
                   /*cd_size_offset=*/4,
                   /*cd_offset=*/5);
}

// Test staticness propagation for external calls (CALL vs STATICCALL)
TEST_F(ExecutionSimulationTest, ExternalCallStaticnessPropagation)
{
    // Common test data setup
    FF zero = 0;
    AztecAddress parent_address = 0xdeadbeef;
    AztecAddress nested_address = 0xc0ffee;
    MemoryValue nested_address_value = MemoryValue::from<FF>(nested_address);
    MemoryValue l2_gas_allocated = MemoryValue::from<uint32_t>(6);
    MemoryValue da_gas_allocated = MemoryValue::from<uint32_t>(7);
    MemoryValue cd_size = MemoryValue::from<uint32_t>(8);
    AppendOnlyTreeSnapshot written_public_data_slots_tree_snapshot = AppendOnlyTreeSnapshot{
        .root = 0x12345678,
        .nextAvailableLeafIndex = 10,
    };
    TreeStates tree_states =
        TreeStates{ .noteHashTree = { .tree = { .root = 10, .nextAvailableLeafIndex = 9 }, .counter = 8 },
                    .nullifierTree = { .tree = { .root = 7, .nextAvailableLeafIndex = 6 }, .counter = 5 },
                    .l1ToL2MessageTree = { .tree = { .root = 4, .nextAvailableLeafIndex = 3 }, .counter = 0 },
                    .publicDataTree = { .tree = { .root = 2, .nextAvailableLeafIndex = 1 }, .counter = 1 } };
    SideEffectStates side_effect_states = SideEffectStates{ .numUnencryptedLogFields = 1, .numL2ToL1Messages = 2 };

    auto setup_context_expectations = [&](bool parent_is_static) {
        EXPECT_CALL(gas_tracker, compute_gas_limit_for_call(Gas{ 6, 7 })).WillOnce(Return(Gas{ 2, 3 }));
        EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));
        EXPECT_CALL(context, get_context_id);
        EXPECT_CALL(context, get_parent_id);
        EXPECT_CALL(context, get_bytecode_manager).WillOnce(ReturnRef(bytecode_manager));
        EXPECT_CALL(bytecode_manager, get_retrieved_bytecode_id).WillOnce(Return(FF(1)));
        EXPECT_CALL(context, get_next_pc);
        EXPECT_CALL(context, get_is_static).WillRepeatedly(Return(parent_is_static));
        EXPECT_CALL(context, get_msg_sender).WillOnce(ReturnRef(parent_address));
        EXPECT_CALL(context, get_transaction_fee).WillOnce(ReturnRef(zero));
        EXPECT_CALL(context, get_parent_cd_addr);
        EXPECT_CALL(context, get_parent_cd_size);
        EXPECT_CALL(context, get_parent_gas_used);
        EXPECT_CALL(context, get_parent_gas_limit);
        EXPECT_CALL(context, get_written_public_data_slots_tree_snapshot)
            .WillOnce(Return(written_public_data_slots_tree_snapshot));
        EXPECT_CALL(context, get_side_effect_states).WillRepeatedly(ReturnRef(side_effect_states));
        EXPECT_CALL(context, get_phase).WillOnce(Return(TransactionPhase::APP_LOGIC));
        EXPECT_CALL(merkle_db, get_tree_state).WillOnce(Return(tree_states));
        EXPECT_CALL(context, get_memory);
        EXPECT_CALL(context, get_address).WillRepeatedly(ReturnRef(parent_address));
        EXPECT_CALL(memory, get(1)).WillOnce(ReturnRef(l2_gas_allocated));
        EXPECT_CALL(memory, get(2)).WillOnce(ReturnRef(da_gas_allocated));
        EXPECT_CALL(memory, get(3)).WillOnce(ReturnRef(nested_address_value));
        EXPECT_CALL(memory, get(4)).WillOnce(ReturnRef(cd_size));
    };

    auto create_nested_context = []() {
        auto nested = std::make_unique<NiceMock<MockContext>>();
        ON_CALL(*nested, halted()).WillByDefault(Return(true));
        return nested;
    };

    // Test Case 1: Non-static context + CALL -> nested context is non-static
    setup_context_expectations(false);
    EXPECT_CALL(context_provider,
                make_nested_context(nested_address,
                                    parent_address,
                                    _,
                                    _,
                                    _,
                                    _,
                                    /*is_static=*/false,
                                    Gas{ 2, 3 },
                                    side_effect_states,
                                    TransactionPhase::APP_LOGIC))
        .WillOnce(Return(create_nested_context()));
    execution.call(context, 1, 2, 3, 4, 5);

    // Test Case 2: Non-static context + STATICCALL -> nested context is static
    setup_context_expectations(false);
    EXPECT_CALL(context_provider,
                make_nested_context(nested_address,
                                    parent_address,
                                    _,
                                    _,
                                    _,
                                    _,
                                    /*is_static=*/true,
                                    Gas{ 2, 3 },
                                    side_effect_states,
                                    TransactionPhase::APP_LOGIC))
        .WillOnce(Return(create_nested_context()));
    execution.static_call(context, 1, 2, 3, 4, 5);

    // Test Case 3: Static context + CALL -> nested context remains static
    setup_context_expectations(true);
    EXPECT_CALL(context_provider,
                make_nested_context(nested_address,
                                    parent_address,
                                    _,
                                    _,
                                    _,
                                    _,
                                    /*is_static=*/true,
                                    Gas{ 2, 3 },
                                    side_effect_states,
                                    TransactionPhase::APP_LOGIC))
        .WillOnce(Return(create_nested_context()));
    execution.call(context, 1, 2, 3, 4, 5);

    // Test Case 4: Static context + STATICCALL -> nested context remains static
    setup_context_expectations(true);
    EXPECT_CALL(context_provider,
                make_nested_context(nested_address,
                                    parent_address,
                                    _,
                                    _,
                                    _,
                                    _,
                                    /*is_static=*/true,
                                    Gas{ 2, 3 },
                                    side_effect_states,
                                    TransactionPhase::APP_LOGIC))
        .WillOnce(Return(create_nested_context()));
    execution.static_call(context, 1, 2, 3, 4, 5);
}

TEST_F(ExecutionSimulationTest, InternalCall)
{
    uint32_t return_pc = 500; // This is next pc that we should return to after the internal call.
    uint32_t pc_loc = 11;     // This is the pc of the internal call

    NiceMock<MockInternalCallStackManager> internal_call_stack_manager;
    ON_CALL(context, get_internal_call_stack_manager).WillByDefault(ReturnRef(internal_call_stack_manager));

    // ==== Internal Call
    // Get manager
    EXPECT_CALL(context, get_internal_call_stack_manager());
    // Store the return pc (i.e. context.get_next_pc())
    EXPECT_CALL(context, get_next_pc()).WillOnce(Return(return_pc));
    EXPECT_CALL(internal_call_stack_manager, push(return_pc));
    // Set next pc to the parameter pc_loc
    EXPECT_CALL(context, set_next_pc(pc_loc));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.internal_call(context, pc_loc);

    // ==== Internal Return
    // Get manager
    EXPECT_CALL(context, get_internal_call_stack_manager());
    // Pop the return pc from the stack
    EXPECT_CALL(internal_call_stack_manager, pop()).WillOnce(Return(return_pc));
    // Set the next pc to the return pc
    EXPECT_CALL(context, set_next_pc(return_pc));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.internal_return(context);
}

TEST_F(ExecutionSimulationTest, GetEnvVarAddress)
{
    AztecAddress addr = 0xdeadbeef;
    EXPECT_CALL(context, get_address).WillOnce(ReturnRef(addr));
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, set(1, MemoryValue::from<FF>(addr)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.get_env_var(context, 1, static_cast<uint8_t>(EnvironmentVariable::ADDRESS));
}

TEST_F(ExecutionSimulationTest, GetEnvVarChainId)
{
    GlobalVariables globals;
    globals.chainId = 1;
    EXPECT_CALL(context, get_globals).WillOnce(ReturnRef(globals));
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, set(1, MemoryValue::from<FF>(1)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.get_env_var(context, 1, static_cast<uint8_t>(EnvironmentVariable::CHAINID));
}

TEST_F(ExecutionSimulationTest, GetEnvVarIsStaticCall)
{
    EXPECT_CALL(context, get_is_static).WillOnce(Return(true));
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, set(1, MemoryValue::from<uint1_t>(1)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.get_env_var(context, 1, static_cast<uint8_t>(EnvironmentVariable::ISSTATICCALL));
}

TEST_F(ExecutionSimulationTest, GetEnvVarInvalidEnum)
{
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_THROW(execution.get_env_var(context, 1, 255), std::runtime_error);
}

// Trivial test at the moment.
// TODO: Attempt to have infra to call execution.execute() with a JUMP and a second instruction
// and check the pc value for the second instruction is correct.
TEST_F(ExecutionSimulationTest, Jump)
{
    EXPECT_CALL(context, set_next_pc(120));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.jump(context, 120);
}

TEST_F(ExecutionSimulationTest, SuccessCopyTrue)
{
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(context, get_last_success).WillOnce(Return(true));
    EXPECT_CALL(memory, set(10, MemoryValue::from<uint1_t>(1)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.success_copy(context, 10);
}

TEST_F(ExecutionSimulationTest, SuccessCopyFalse)
{
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(context, get_last_success).WillOnce(Return(false));
    EXPECT_CALL(memory, set(10, MemoryValue::from<uint1_t>(0)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.success_copy(context, 10);
}

TEST_F(ExecutionSimulationTest, RdSize)
{
    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(context, get_last_rd_size).WillOnce(Return(42));
    EXPECT_CALL(memory, set(10, MemoryValue::from<uint32_t>(42)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.rd_size(context, /*dst_addr=*/10);
}

TEST_F(ExecutionSimulationTest, DebugLog)
{
    // Setup test data
    MemoryAddress level_offset = 50;
    MemoryAddress message_offset = 100;
    MemoryAddress fields_offset = 200;
    MemoryAddress fields_size_offset = 300;
    uint16_t message_size = 5;
    AztecAddress address = 0xdeadbeef;

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(context, get_address).WillOnce(ReturnRef(address));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));
    EXPECT_CALL(debug_log,
                debug_log(_, address, level_offset, message_offset, message_size, fields_offset, fields_size_offset));

    execution.debug_log(context, level_offset, message_offset, fields_offset, fields_size_offset, message_size);
}

TEST_F(ExecutionSimulationTest, Sload)
{
    MemoryAddress slot_addr = 27;
    MemoryAddress dst_addr = 10;
    AztecAddress address = 0xdeadbeef;
    auto slot = MemoryValue::from<FF>(42);

    EXPECT_CALL(context, get_memory);

    EXPECT_CALL(memory, get(slot_addr)).WillOnce(ReturnRef(slot));
    EXPECT_CALL(context, get_address).WillOnce(ReturnRef(address));
    EXPECT_CALL(merkle_db, storage_read(address, slot.as<FF>())).WillOnce(Return(7));

    EXPECT_CALL(memory, set(dst_addr, MemoryValue::from<FF>(7)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.sload(context, slot_addr, dst_addr);
}

TEST_F(ExecutionSimulationTest, SStore)
{
    MemoryAddress slot_addr = 27;
    MemoryAddress value_addr = 10;
    AztecAddress address = 0xdeadbeef;
    auto slot = MemoryValue::from<FF>(42);
    auto value = MemoryValue::from<FF>(7);
    TreeStates tree_state = {};
    EXPECT_CALL(context, get_memory);

    EXPECT_CALL(memory, get(slot_addr)).WillOnce(ReturnRef(slot));
    EXPECT_CALL(memory, get(value_addr)).WillOnce(ReturnRef(value));
    EXPECT_CALL(context, get_address).WillRepeatedly(ReturnRef(address));
    EXPECT_CALL(merkle_db, was_storage_written(address, slot.as<FF>())).WillOnce(Return(false));
    EXPECT_CALL(merkle_db, get_tree_state).WillOnce(Return(tree_state));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 1 }));

    EXPECT_CALL(context, get_is_static).WillOnce(Return(false));

    EXPECT_CALL(merkle_db, storage_write(address, slot.as<FF>(), value.as<FF>(), false));

    execution.sstore(context, value_addr, slot_addr);
}

TEST_F(ExecutionSimulationTest, SStoreDuringStaticCall)
{
    MemoryAddress slot_addr = 27;
    MemoryAddress value_addr = 10;
    AztecAddress address = 0xdeadbeef;
    auto slot = MemoryValue::from<FF>(42);
    auto value = MemoryValue::from<FF>(7);
    EXPECT_CALL(context, get_memory);

    EXPECT_CALL(memory, get(slot_addr)).WillOnce(ReturnRef(slot));
    EXPECT_CALL(memory, get(value_addr)).WillOnce(ReturnRef(value));
    EXPECT_CALL(context, get_address).WillRepeatedly(ReturnRef(address));
    EXPECT_CALL(merkle_db, was_storage_written(address, slot.as<FF>())).WillOnce(Return(false));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 1 }));

    EXPECT_CALL(context, get_is_static).WillOnce(Return(true));
    EXPECT_THROW_WITH_MESSAGE(execution.sstore(context, value_addr, slot_addr),
                              "SSTORE: Cannot write to storage in static context");
}

TEST_F(ExecutionSimulationTest, SStoreLimitReached)
{
    MemoryAddress slot_addr = 27;
    MemoryAddress value_addr = 10;
    AztecAddress address = 0xdeadbeef;
    auto slot = MemoryValue::from<FF>(42);
    auto value = MemoryValue::from<FF>(7);
    TreeStates tree_state = {};
    tree_state.publicDataTree.counter = MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX;
    EXPECT_CALL(context, get_memory);

    EXPECT_CALL(memory, get(slot_addr)).WillOnce(ReturnRef(slot));
    EXPECT_CALL(memory, get(value_addr)).WillOnce(ReturnRef(value));
    EXPECT_CALL(context, get_address).WillRepeatedly(ReturnRef(address));
    EXPECT_CALL(merkle_db, was_storage_written(address, slot.as<FF>())).WillOnce(Return(false));
    EXPECT_CALL(merkle_db, get_tree_state).WillOnce(Return(tree_state));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 1 }));

    EXPECT_CALL(context, get_is_static).WillOnce(Return(false));

    EXPECT_THROW_WITH_MESSAGE(execution.sstore(context, value_addr, slot_addr),
                              "SSTORE: Maximum number of data writes reached");
}

TEST_F(ExecutionSimulationTest, SStoreLimitReachedSquashed)
{
    MemoryAddress slot_addr = 27;
    MemoryAddress value_addr = 10;
    AztecAddress address = 0xdeadbeef;
    auto slot = MemoryValue::from<FF>(42);
    auto value = MemoryValue::from<FF>(7);
    TreeStates tree_state = {};
    tree_state.publicDataTree.counter = MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX;
    EXPECT_CALL(context, get_memory);

    EXPECT_CALL(memory, get(slot_addr)).WillOnce(ReturnRef(slot));
    EXPECT_CALL(memory, get(value_addr)).WillOnce(ReturnRef(value));
    EXPECT_CALL(context, get_address).WillRepeatedly(ReturnRef(address));
    // has been written before, so it does not count against the limit.
    EXPECT_CALL(merkle_db, was_storage_written(address, slot.as<FF>())).WillOnce(Return(true));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_CALL(context, get_is_static).WillOnce(Return(false));

    EXPECT_CALL(merkle_db, storage_write(address, slot.as<FF>(), value.as<FF>(), false));

    execution.sstore(context, value_addr, slot_addr);
}

TEST_F(ExecutionSimulationTest, NoteHashExists)
{
    MemoryAddress unique_note_hash_addr = 10;
    MemoryAddress leaf_index_addr = 11;
    MemoryAddress dst_addr = 12;

    auto unique_note_hash = MemoryValue::from<FF>(42);
    auto leaf_index = MemoryValue::from<uint64_t>(7);

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get(unique_note_hash_addr)).WillOnce(ReturnRef(unique_note_hash));
    EXPECT_CALL(memory, get(leaf_index_addr)).WillOnce(ReturnRef(leaf_index));

    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_CALL(greater_than, gt(NOTE_HASH_TREE_LEAF_COUNT, leaf_index.as<uint64_t>())).WillOnce(Return(true));

    EXPECT_CALL(merkle_db, note_hash_exists(leaf_index.as<uint64_t>(), unique_note_hash.as<FF>()))
        .WillOnce(Return(true));

    EXPECT_CALL(memory, set(dst_addr, MemoryValue::from<uint1_t>(1)));

    execution.note_hash_exists(context, unique_note_hash_addr, leaf_index_addr, dst_addr);
}

TEST_F(ExecutionSimulationTest, NoteHashExistsOutOfRange)
{
    MemoryAddress unique_note_hash_addr = 10;
    MemoryAddress leaf_index_addr = 11;
    MemoryAddress dst_addr = 12;

    auto unique_note_hash = MemoryValue::from<FF>(42);
    auto leaf_index = MemoryValue::from<uint64_t>(NOTE_HASH_TREE_LEAF_COUNT + 1);

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get(unique_note_hash_addr)).WillOnce(ReturnRef(unique_note_hash));
    EXPECT_CALL(memory, get(leaf_index_addr)).WillOnce(ReturnRef(leaf_index));

    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_CALL(greater_than, gt(NOTE_HASH_TREE_LEAF_COUNT, leaf_index.as<uint64_t>())).WillOnce(Return(false));

    EXPECT_CALL(memory, set(dst_addr, MemoryValue::from<uint1_t>(0)));

    execution.note_hash_exists(context, unique_note_hash_addr, leaf_index_addr, dst_addr);
}

TEST_F(ExecutionSimulationTest, EmitNoteHash)
{
    MemoryAddress note_hash_addr = 10;

    auto note_hash = MemoryValue::from<FF>(42);
    AztecAddress address = 0xdeadbeef;
    TreeStates tree_state = {};

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get(note_hash_addr)).WillOnce(ReturnRef(note_hash));
    EXPECT_CALL(context, get_address).WillRepeatedly(ReturnRef(address));

    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_CALL(context, get_is_static).WillOnce(Return(false));
    EXPECT_CALL(merkle_db, get_tree_state).WillOnce(Return(tree_state));
    EXPECT_CALL(merkle_db, note_hash_write(address, note_hash.as<FF>()));

    execution.emit_note_hash(context, note_hash_addr);
}

TEST_F(ExecutionSimulationTest, EmitNoteHashDuringStaticCall)
{
    MemoryAddress note_hash_addr = 10;

    auto note_hash = MemoryValue::from<FF>(42);
    AztecAddress address = 0xdeadbeef;

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get(note_hash_addr)).WillOnce(ReturnRef(note_hash));
    EXPECT_CALL(context, get_address).WillRepeatedly(ReturnRef(address));

    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_CALL(context, get_is_static).WillOnce(Return(true));
    EXPECT_THROW_WITH_MESSAGE(execution.emit_note_hash(context, note_hash_addr),
                              "EMITNOTEHASH: Cannot emit note hash in static context");
}

TEST_F(ExecutionSimulationTest, EmitNoteHashLimitReached)
{
    MemoryAddress note_hash_addr = 10;

    auto note_hash = MemoryValue::from<FF>(42);
    AztecAddress address = 0xdeadbeef;
    TreeStates tree_state = {};
    tree_state.noteHashTree.counter = MAX_NOTE_HASHES_PER_TX;

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get(note_hash_addr)).WillOnce(ReturnRef(note_hash));
    EXPECT_CALL(context, get_address).WillRepeatedly(ReturnRef(address));

    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_CALL(context, get_is_static).WillOnce(Return(false));
    EXPECT_CALL(merkle_db, get_tree_state).WillOnce(Return(tree_state));

    EXPECT_THROW_WITH_MESSAGE(execution.emit_note_hash(context, note_hash_addr),
                              "EMITNOTEHASH: Maximum number of note hashes reached");
}

TEST_F(ExecutionSimulationTest, L1ToL2MessageExists)
{
    MemoryAddress msg_hash_addr = 10;
    MemoryAddress leaf_index_addr = 11;
    MemoryAddress dst_addr = 12;

    auto msg_hash = MemoryValue::from<FF>(42);
    auto leaf_index = MemoryValue::from<uint64_t>(7);

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get(msg_hash_addr)).WillOnce(ReturnRef(msg_hash));
    EXPECT_CALL(memory, get(leaf_index_addr)).WillOnce(ReturnRef(leaf_index));

    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_CALL(greater_than, gt(L1_TO_L2_MSG_TREE_LEAF_COUNT, leaf_index.as<uint64_t>())).WillOnce(Return(true));

    EXPECT_CALL(merkle_db, l1_to_l2_msg_exists(leaf_index.as<uint64_t>(), msg_hash.as<FF>())).WillOnce(Return(true));

    EXPECT_CALL(memory, set(dst_addr, MemoryValue::from<uint1_t>(1)));

    execution.l1_to_l2_message_exists(context, msg_hash_addr, leaf_index_addr, dst_addr);
}

TEST_F(ExecutionSimulationTest, L1ToL2MessageExistsOutOfRange)
{
    MemoryAddress msg_hash_addr = 10;
    MemoryAddress leaf_index_addr = 11;
    MemoryAddress dst_addr = 12;

    auto msg_hash = MemoryValue::from<FF>(42);
    auto leaf_index = MemoryValue::from<uint64_t>(L1_TO_L2_MSG_TREE_LEAF_COUNT + 1);

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get(msg_hash_addr)).WillOnce(ReturnRef(msg_hash));
    EXPECT_CALL(memory, get(leaf_index_addr)).WillOnce(ReturnRef(leaf_index));

    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_CALL(greater_than, gt(L1_TO_L2_MSG_TREE_LEAF_COUNT, leaf_index.as<uint64_t>())).WillOnce(Return(false));

    EXPECT_CALL(memory, set(dst_addr, MemoryValue::from<uint1_t>(0)));

    execution.l1_to_l2_message_exists(context, msg_hash_addr, leaf_index_addr, dst_addr);
}

TEST_F(ExecutionSimulationTest, NullifierExists)
{
    MemoryAddress nullifier_offset = 10;
    MemoryAddress address_offset = 11;
    MemoryAddress exists_offset = 12;

    auto nullifier = MemoryValue::from<FF>(42);
    auto address = MemoryValue::from<FF>(7);

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get(nullifier_offset)).WillOnce(ReturnRef(nullifier));
    EXPECT_CALL(memory, get(address_offset)).WillOnce(ReturnRef(address));

    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_CALL(merkle_db, nullifier_exists(address.as_ff(), nullifier.as_ff())).WillOnce(Return(true));

    EXPECT_CALL(memory, set(exists_offset, MemoryValue::from<uint1_t>(1)));

    execution.nullifier_exists(context, nullifier_offset, address_offset, exists_offset);
}

TEST_F(ExecutionSimulationTest, EmitNullifier)
{
    MemoryAddress nullifier_addr = 10;

    auto nullifier = MemoryValue::from<FF>(42);
    AztecAddress address = 0xdeadbeef;
    TreeStates tree_state = {};

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get(nullifier_addr)).WillOnce(ReturnRef(nullifier));
    EXPECT_CALL(context, get_address).WillRepeatedly(ReturnRef(address));

    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_CALL(context, get_is_static).WillOnce(Return(false));
    EXPECT_CALL(merkle_db, get_tree_state).WillOnce(Return(tree_state));
    EXPECT_CALL(merkle_db, nullifier_write(address, nullifier.as_ff())).WillOnce(Return()); // success

    execution.emit_nullifier(context, nullifier_addr);
}

TEST_F(ExecutionSimulationTest, EmitNullifierDuringStaticCall)
{
    MemoryAddress nullifier_addr = 10;

    auto nullifier = MemoryValue::from<FF>(42);
    AztecAddress address = 0xdeadbeef;

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get(nullifier_addr)).WillOnce(ReturnRef(nullifier));
    EXPECT_CALL(context, get_address).WillRepeatedly(ReturnRef(address));

    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_CALL(context, get_is_static).WillOnce(Return(true));
    EXPECT_THROW_WITH_MESSAGE(execution.emit_nullifier(context, nullifier_addr),
                              "EMITNULLIFIER: Cannot emit nullifier in static context");
}

TEST_F(ExecutionSimulationTest, EmitNullifierLimitReached)
{
    MemoryAddress nullifier_addr = 10;

    auto nullifier = MemoryValue::from<FF>(42);
    AztecAddress address = 0xdeadbeef;
    TreeStates tree_state = {};
    tree_state.nullifierTree.counter = MAX_NULLIFIERS_PER_TX;

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get(nullifier_addr)).WillOnce(ReturnRef(nullifier));
    EXPECT_CALL(context, get_address).WillRepeatedly(ReturnRef(address));

    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_CALL(context, get_is_static).WillOnce(Return(false));
    EXPECT_CALL(merkle_db, get_tree_state).WillOnce(Return(tree_state));

    EXPECT_THROW_WITH_MESSAGE(execution.emit_nullifier(context, nullifier_addr),
                              "EMITNULLIFIER: Maximum number of nullifiers reached");
}

TEST_F(ExecutionSimulationTest, EmitNullifierCollision)
{
    MemoryAddress nullifier_addr = 10;

    auto nullifier = MemoryValue::from<FF>(42);
    AztecAddress address = 0xdeadbeef;
    TreeStates tree_state = {};

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get(nullifier_addr)).WillOnce(ReturnRef(nullifier));
    EXPECT_CALL(context, get_address).WillRepeatedly(ReturnRef(address));

    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_CALL(context, get_is_static).WillOnce(Return(false));
    EXPECT_CALL(merkle_db, get_tree_state).WillOnce(Return(tree_state));
    EXPECT_CALL(merkle_db, nullifier_write(address, nullifier.as<FF>()))
        .WillOnce(Throw(NullifierCollisionException("Nullifier collision"))); // collision

    EXPECT_THROW_WITH_MESSAGE(execution.emit_nullifier(context, nullifier_addr), "EMITNULLIFIER: Nullifier collision");
}

TEST_F(ExecutionSimulationTest, Set)
{
    MemoryAddress dst_addr = 10;
    uint8_t dst_tag = static_cast<uint8_t>(MemoryTag::U8);
    FF value = 7;

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(alu, truncate(value, static_cast<MemoryTag>(dst_tag))).WillOnce(Return(MemoryValue::from<uint8_t>(7)));
    EXPECT_CALL(memory, set(dst_addr, MemoryValue::from<uint8_t>(7)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.set(context, dst_addr, dst_tag, value);
}

TEST_F(ExecutionSimulationTest, Cast)
{
    MemoryAddress src_addr = 9;
    MemoryAddress dst_addr = 10;
    uint8_t dst_tag = static_cast<uint8_t>(MemoryTag::U1);
    MemoryValue value = MemoryValue::from<uint64_t>(7);

    EXPECT_CALL(context, get_memory).WillOnce(ReturnRef(memory));
    EXPECT_CALL(memory, get(src_addr)).WillOnce(ReturnRef(value));

    EXPECT_CALL(alu, truncate(value.as_ff(), static_cast<MemoryTag>(dst_tag)))
        .WillOnce(Return(MemoryValue::from<uint1_t>(1)));
    EXPECT_CALL(memory, set(dst_addr, MemoryValue::from<uint1_t>(1)));
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    execution.cast(context, src_addr, dst_addr, dst_tag);
}

TEST_F(ExecutionSimulationTest, Poseidon2Perm)
{
    MemoryAddress src_address = 10;
    MemoryAddress dst_address = 20;

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(gas_tracker, consume_gas);
    EXPECT_CALL(poseidon2, permutation(_, src_address, dst_address));

    execution.poseidon2_permutation(context, src_address, dst_address);
}

TEST_F(ExecutionSimulationTest, EccAdd)
{
    MemoryAddress p_x_addr = 10;
    MemoryAddress p_y_addr = 15;
    MemoryAddress p_is_inf_addr = 25;
    MemoryAddress q_x_addr = 20;
    MemoryAddress q_y_addr = 30;
    MemoryAddress q_is_inf_addr = 35;
    MemoryAddress dst_addr = 40;

    MemoryValue p_x = MemoryValue::from<FF>(FF("0x04c95d1b26d63d46918a156cae92db1bcbc4072a27ec81dc82ea959abdbcf16a"));
    MemoryValue p_y = MemoryValue::from<FF>(FF("0x035b6dd9e63c1370462c74775765d07fc21fd1093cc988149d3aa763bb3dbb60"));
    EmbeddedCurvePoint p(p_x.as_ff(), p_y, false);

    MemoryValue q_x = MemoryValue::from<FF>(FF("0x009242167ec31949c00cbe441cd36757607406e87844fa2c8c4364a4403e66d7"));
    MemoryValue q_y = MemoryValue::from<FF>(FF("0x0fe3016d64cfa8045609f375284b6b739b5fa282e4cbb75cc7f1687ecc7420e3"));
    EmbeddedCurvePoint q(q_x.as_ff(), q_y.as_ff(), false);

    // Mock the context and memory interactions
    MemoryValue zero = MemoryValue::from<uint1_t>(0);
    EXPECT_CALL(context, get_memory).WillRepeatedly(ReturnRef(memory));
    EXPECT_CALL(Const(memory), get(p_x_addr)).WillOnce(ReturnRef(p_x));
    EXPECT_CALL(memory, get(p_y_addr)).WillOnce(ReturnRef(p_y));
    EXPECT_CALL(memory, get(p_is_inf_addr)).WillOnce(ReturnRef(zero)); // p is not infinity
    EXPECT_CALL(memory, get(q_x_addr)).WillOnce(ReturnRef(q_x));
    EXPECT_CALL(memory, get(q_y_addr)).WillOnce(ReturnRef(q_y));
    EXPECT_CALL(memory, get(q_is_inf_addr)).WillOnce(ReturnRef(zero)); // q is not infinity

    EXPECT_CALL(gas_tracker, consume_gas);

    // Mock the ECC add operation
    EXPECT_CALL(ecc, add(_, _, _, dst_addr));

    // Execute the ECC add operation
    execution.ecc_add(context, p_x_addr, p_y_addr, p_is_inf_addr, q_x_addr, q_y_addr, q_is_inf_addr, dst_addr);
}

TEST_F(ExecutionSimulationTest, ToRadixBE)
{
    MemoryAddress value_addr = 5;
    MemoryAddress radix_addr = 6;
    MemoryAddress num_limbs_addr = 7;
    MemoryAddress is_output_bits_addr = 8;

    MemoryAddress dst_addr = 10;
    MemoryValue value = MemoryValue::from<FF>(42069);
    MemoryValue radix = MemoryValue::from<uint32_t>(16);
    std::vector<MemoryValue> be_limbs = { MemoryValue::from<uint8_t>(0xa4),
                                          MemoryValue::from<uint8_t>(0x55),
                                          MemoryValue::from<uint8_t>(0x00) };
    MemoryValue num_limbs = MemoryValue::from<uint32_t>(3);
    MemoryValue is_output_bits = MemoryValue::from<uint1_t>(false);
    uint32_t num_p_limbs = 64;

    EXPECT_CALL(context, get_memory).WillOnce(ReturnRef(memory));
    EXPECT_CALL(memory, get(value_addr)).WillOnce(ReturnRef(value));
    EXPECT_CALL(memory, get(radix_addr)).WillOnce(ReturnRef(radix));
    EXPECT_CALL(memory, get(num_limbs_addr)).WillOnce(ReturnRef(num_limbs));
    EXPECT_CALL(memory, get(is_output_bits_addr)).WillOnce(ReturnRef(is_output_bits));

    EXPECT_CALL(greater_than, gt(radix.as<uint32_t>(), /*max_radix/*/ 256)).WillOnce(Return(false));
    EXPECT_CALL(greater_than, gt(num_limbs.as<uint32_t>(), num_p_limbs)).WillOnce(Return(false));

    EXPECT_CALL(gas_tracker, consume_gas);
    EXPECT_CALL(to_radix, to_be_radix);

    execution.to_radix_be(context, value_addr, radix_addr, num_limbs_addr, is_output_bits_addr, dst_addr);
}

TEST_F(ExecutionSimulationTest, EmitUnencryptedLog)
{
    MemoryAddress log_offset = 10;
    MemoryAddress log_size_offset = 20;
    MemoryValue log_size = MemoryValue::from<uint32_t>(10);
    AztecAddress address = 0xdeadbeef;

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(memory, get(log_size_offset)).WillOnce(ReturnRef(log_size));

    EXPECT_CALL(context, get_address).WillOnce(ReturnRef(address));

    EXPECT_CALL(emit_unencrypted_log, emit_unencrypted_log(_, _, address, log_offset, log_size.as<uint32_t>()));

    EXPECT_CALL(gas_tracker, consume_gas(Gas{ log_size.as<uint32_t>(), log_size.as<uint32_t>() }));

    execution.emit_unencrypted_log(context, log_size_offset, log_offset);
}

TEST_F(ExecutionSimulationTest, SendL2ToL1Msg)
{
    MemoryAddress recipient_addr = 10;
    MemoryAddress content_addr = 11;

    auto recipient = MemoryValue::from<FF>(42);
    auto content = MemoryValue::from<FF>(27);

    SideEffectStates side_effects_states = {};
    side_effects_states.numL2ToL1Messages = MAX_L2_TO_L1_MSGS_PER_TX - 1;
    SideEffectStates side_effects_states_after = side_effects_states;
    side_effects_states_after.numL2ToL1Messages++;

    EXPECT_CALL(context, get_memory);

    EXPECT_CALL(memory, get(recipient_addr)).WillOnce(ReturnRef(recipient));
    EXPECT_CALL(memory, get(content_addr)).WillOnce(ReturnRef(content));

    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_CALL(context, get_is_static).WillOnce(Return(false));

    EXPECT_CALL(context, get_side_effect_states).WillOnce(ReturnRef(side_effects_states));
    EXPECT_CALL(context, set_side_effect_states(side_effects_states_after));

    execution.send_l2_to_l1_msg(context, recipient_addr, content_addr);
}

TEST_F(ExecutionSimulationTest, SendL2ToL1MsgStaticCall)
{
    MemoryAddress recipient_addr = 10;
    MemoryAddress content_addr = 11;

    auto recipient = MemoryValue::from<FF>(42);
    auto content = MemoryValue::from<FF>(27);

    SideEffectStates side_effects_states = {};
    side_effects_states.numL2ToL1Messages = MAX_L2_TO_L1_MSGS_PER_TX - 1;

    EXPECT_CALL(context, get_memory);

    EXPECT_CALL(memory, get(recipient_addr)).WillOnce(ReturnRef(recipient));
    EXPECT_CALL(memory, get(content_addr)).WillOnce(ReturnRef(content));

    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_CALL(context, get_is_static).WillOnce(Return(true));

    EXPECT_CALL(context, get_side_effect_states).WillOnce(ReturnRef(side_effects_states));

    EXPECT_THROW_WITH_MESSAGE(execution.send_l2_to_l1_msg(context, recipient_addr, content_addr),
                              "SENDL2TOL1MSG: Cannot send L2 to L1 message in static context");
}

TEST_F(ExecutionSimulationTest, SendL2ToL1MsgLimitReached)
{
    MemoryAddress recipient_addr = 10;
    MemoryAddress content_addr = 11;

    auto recipient = MemoryValue::from<FF>(42);
    auto content = MemoryValue::from<FF>(27);

    SideEffectStates side_effects_states = {};
    side_effects_states.numL2ToL1Messages = MAX_L2_TO_L1_MSGS_PER_TX;

    EXPECT_CALL(context, get_memory);

    EXPECT_CALL(memory, get(recipient_addr)).WillOnce(ReturnRef(recipient));
    EXPECT_CALL(memory, get(content_addr)).WillOnce(ReturnRef(content));

    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));

    EXPECT_CALL(context, get_is_static).WillOnce(Return(false));

    EXPECT_CALL(context, get_side_effect_states).WillOnce(ReturnRef(side_effects_states));

    EXPECT_THROW_WITH_MESSAGE(execution.send_l2_to_l1_msg(context, recipient_addr, content_addr),
                              "SENDL2TOL1MSG: Maximum number of L2 to L1 messages reached");
}

TEST_F(ExecutionSimulationTest, Sha256Compression)
{
    MemoryAddress state_address = 10;
    MemoryAddress input_address = 20;
    MemoryAddress dst_address = 50;

    EXPECT_CALL(context, get_memory);
    EXPECT_CALL(gas_tracker, consume_gas(Gas{ 0, 0 }));
    EXPECT_CALL(sha256, compression(_, state_address, input_address, dst_address));

    execution.sha256_compression(context, dst_address, state_address, input_address);
}

} // namespace

} // namespace bb::avm2::simulation
