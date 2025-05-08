#include "barretenberg/vm2/simulation/tx_execution.hpp"
#include "barretenberg/vm2/simulation/testing/mock_cd_hasher.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context_provider.hpp"
#include "barretenberg/vm2/simulation/testing/mock_dbs.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_memory.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

namespace bb::avm2::simulation {
namespace {

using ::testing::NiceMock;
using ::testing::Return;

class TxExecutionTest : public ::testing::Test {
  protected:
    TxExecutionTest() = default;

    NiceMock<MockContextProvider> context_provider;
    EventEmitter<TxEvent> tx_event_emitter;
    NiceMock<MockHighLevelMerkleDB> merkle_db;
    NiceMock<MockExecution> execution;
    NiceMock<MockFieldGreaterThan> field_gt;
    NiceMock<MockCalldataHasher> cd_hasher;
    TxExecution tx_execution =
        TxExecution(execution, context_provider, merkle_db, field_gt, cd_hasher, tx_event_emitter);
};

TEST_F(TxExecutionTest, simulateTx)
{
    // Create a mock transaction
    Tx tx = {
        .hash = "0x1234567890abcdef",
        .globalVariables = GlobalVariables{},
        .nonRevertibleAccumulatedData =
            AccumulatedData{
                .noteHashes = testing::random_fields(5),
                .nullifiers = testing::random_fields(6),
                .l2ToL1Messages = testing::random_l2_to_l1_messages(2),
            },
        .revertibleAccumulatedData =
            AccumulatedData{
                .noteHashes = testing::random_fields(5),
                .nullifiers = testing::random_fields(2),
                .l2ToL1Messages = testing::random_l2_to_l1_messages(2),
            },
        .setupEnqueuedCalls = testing::random_enqueued_calls(1),
        .appLogicEnqueuedCalls = testing::random_enqueued_calls(1),
        .teardownEnqueuedCall = testing::random_enqueued_calls(1)[0],
    };

    AppendOnlyTreeSnapshot dummy_snapshot = {
        .root = 0,
        .nextAvailableLeafIndex = 0,
    };
    TreeStates tree_state = {
        .noteHashTree = { .tree = dummy_snapshot, .counter = 0 },
        .nullifierTree = { .tree = dummy_snapshot, .counter = 0 },
        .l1ToL2MessageTree = { .tree = dummy_snapshot, .counter = 0 },
        .publicDataTree = { .tree = dummy_snapshot, .counter = 0 },
    };
    ON_CALL(merkle_db, get_tree_state()).WillByDefault(Return(tree_state));

    // Number of Enqueued Calls in the transaction : 1 setup, 1 app logic, and 1 teardown

    auto setup_context = std::make_unique<NiceMock<MockContext>>();
    ON_CALL(*setup_context, halted()).WillByDefault(Return(true)); // dont do any actual

    auto app_logic_context = std::make_unique<NiceMock<MockContext>>();
    ON_CALL(*app_logic_context, halted()).WillByDefault(Return(true));

    auto teardown_context = std::make_unique<NiceMock<MockContext>>();
    ON_CALL(*teardown_context, halted()).WillByDefault(Return(true));

    EXPECT_CALL(context_provider, make_enqueued_context)
        .WillOnce(Return(std::move(setup_context)))
        .WillOnce(Return(std::move(app_logic_context)))
        .WillOnce(Return(std::move(teardown_context)));
    EXPECT_CALL(merkle_db, create_checkpoint()).Times(1);

    tx_execution.simulate(tx);

    // Check the event counts
    bool has_startup_event = false;
    auto expected_private_append_tree_events =
        tx.nonRevertibleAccumulatedData.noteHashes.size() + tx.nonRevertibleAccumulatedData.nullifiers.size() +
        tx.revertibleAccumulatedData.noteHashes.size() + tx.revertibleAccumulatedData.nullifiers.size();
    auto actual_private_append_tree_events = 0;

    auto expected_l2_l1_msg_events =
        tx.nonRevertibleAccumulatedData.l2ToL1Messages.size() + tx.revertibleAccumulatedData.l2ToL1Messages.size();
    auto actual_l2_l1_msg_events = 0;

    auto expected_public_call_events = 3; // setup, app logic, teardown
    auto actual_public_call_events = 0;

    bool has_collect_fee_event = false;

    // Get PrivateAppendTreeEvent from tx event dump events
    auto events = tx_event_emitter.get_events();
    for (const auto& tx_event : events) {
        if (std::holds_alternative<TxStartupEvent>(tx_event)) {
            has_startup_event = true;
            continue;
        }
        auto event = std::get<TxPhaseEvent>(tx_event).event;
        if (std::holds_alternative<PrivateAppendTreeEvent>(event)) {
            actual_private_append_tree_events++;
        }
        if (std::holds_alternative<PrivateEmitL2L1MessageEvent>(event)) {
            actual_l2_l1_msg_events++;
        }
        if (std::holds_alternative<EnqueuedCallEvent>(event)) {
            actual_public_call_events++;
        }
        if (std::holds_alternative<CollectGasFeeEvent>(event)) {
            has_collect_fee_event = true;
        }
    }

    EXPECT_TRUE(has_startup_event);
    EXPECT_EQ(actual_private_append_tree_events, expected_private_append_tree_events);
    EXPECT_EQ(expected_l2_l1_msg_events, actual_l2_l1_msg_events);
    EXPECT_EQ(expected_public_call_events, actual_public_call_events);
    EXPECT_TRUE(has_collect_fee_event);
}

} // namespace
} // namespace bb::avm2::simulation
