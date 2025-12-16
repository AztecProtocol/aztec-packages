#include "barretenberg/vm2/simulation/gadgets/l1_to_l2_message_tree_check.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/simulation/events/l1_to_l2_message_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/testing/mock_merkle_check.hpp"
#include "barretenberg/vm2/testing/macros.hpp"

namespace bb::avm2::simulation {

using ::testing::_;
using ::testing::ElementsAre;
using ::testing::Return;
using ::testing::StrictMock;

using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

namespace {

TEST(AvmSimulationL1ToL2MessageTree, Read)
{
    StrictMock<MockMerkleCheck> merkle_check;

    EventEmitter<L1ToL2MessageTreeCheckEvent> event_emitter;
    L1ToL2MessageTreeCheck l1_to_l2_message_tree_check(merkle_check, event_emitter);

    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = {
        .root = 123456,
        .nextAvailableLeafIndex = 128,
    };

    FF msg_hash = 42;
    uint64_t leaf_index = 30;

    EXPECT_CALL(merkle_check, assert_membership(msg_hash, leaf_index, _, snapshot.root)).WillRepeatedly(Return());

    EXPECT_TRUE(l1_to_l2_message_tree_check.exists(msg_hash, msg_hash, leaf_index, sibling_path, snapshot));
    EXPECT_FALSE(l1_to_l2_message_tree_check.exists(27, msg_hash, leaf_index, sibling_path, snapshot));
    EXPECT_THAT(event_emitter.dump_events(),
                ElementsAre(
                    L1ToL2MessageTreeCheckEvent{
                        .msg_hash = msg_hash,
                        .leaf_value = msg_hash,
                        .leaf_index = leaf_index,
                        .snapshot = snapshot,
                    },
                    L1ToL2MessageTreeCheckEvent{
                        .msg_hash = 27,
                        .leaf_value = msg_hash,
                        .leaf_index = leaf_index,
                        .snapshot = snapshot,
                    }));
}

} // namespace

} // namespace bb::avm2::simulation
