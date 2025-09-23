#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cmath>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/l1_to_l2_message_tree_check.hpp"
#include "barretenberg/vm2/generated/relations/merkle_check.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/l1_to_l2_message_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/l1_to_l2_message_tree_check.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_poseidon2.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/l1_to_l2_message_tree_trace.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using simulation::EventEmitter;
using simulation::L1ToL2MessageTreeCheck;
using simulation::MerkleCheck;
using simulation::MerkleCheckEvent;
using simulation::PurePoseidon2;
using simulation::unconstrained_root_from_path;

using tracegen::L1ToL2MessageTreeCheckTraceBuilder;
using tracegen::MerkleCheckTraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using l1_to_l2_message_tree_check_relations = bb::avm2::l1_to_l2_message_tree_check<FF>;
using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

TEST(L1ToL2MessageTreeCheckConstrainingTests, PositiveExists)
{
    PurePoseidon2 poseidon2 = PurePoseidon2();

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    EventEmitter<simulation::L1ToL2MessageTreeCheckEvent> l1_to_l2_message_tree_check_event_emitter;
    L1ToL2MessageTreeCheck l1_to_l2_message_tree_check(merkle_check, l1_to_l2_message_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    MerkleCheckTraceBuilder merkle_check_builder;
    L1ToL2MessageTreeCheckTraceBuilder l1_to_l2_message_tree_check_builder;

    FF msg_hash = 42;

    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path;
    sibling_path.reserve(L1_TO_L2_MSG_TREE_HEIGHT);
    for (size_t i = 0; i < L1_TO_L2_MSG_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }
    FF root = unconstrained_root_from_path(msg_hash, leaf_index, sibling_path);

    EXPECT_TRUE(
        l1_to_l2_message_tree_check.exists(msg_hash,
                                           msg_hash,
                                           leaf_index,
                                           sibling_path,
                                           AppendOnlyTreeSnapshot{ .root = root, .nextAvailableLeafIndex = 128 }));

    l1_to_l2_message_tree_check_builder.process(l1_to_l2_message_tree_check_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);

    check_relation<l1_to_l2_message_tree_check_relations>(trace);
    check_all_interactions<L1ToL2MessageTreeCheckTraceBuilder>(trace);
}

TEST(L1ToL2MessageTreeCheckConstrainingTests, PositiveNotExists)
{
    PurePoseidon2 poseidon2 = PurePoseidon2();

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    EventEmitter<simulation::L1ToL2MessageTreeCheckEvent> l1_to_l2_message_tree_check_event_emitter;
    L1ToL2MessageTreeCheck l1_to_l2_message_tree_check(merkle_check, l1_to_l2_message_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    MerkleCheckTraceBuilder merkle_check_builder;
    L1ToL2MessageTreeCheckTraceBuilder l1_to_l2_message_tree_check_builder;

    FF requested_msg_hash = 42;
    FF actual_leaf_value = 43;

    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path;
    sibling_path.reserve(L1_TO_L2_MSG_TREE_HEIGHT);
    for (size_t i = 0; i < L1_TO_L2_MSG_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }
    FF root = unconstrained_root_from_path(actual_leaf_value, leaf_index, sibling_path);

    EXPECT_FALSE(
        l1_to_l2_message_tree_check.exists(requested_msg_hash,
                                           actual_leaf_value,
                                           leaf_index,
                                           sibling_path,
                                           AppendOnlyTreeSnapshot{ .root = root, .nextAvailableLeafIndex = 128 }));

    l1_to_l2_message_tree_check_builder.process(l1_to_l2_message_tree_check_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);

    check_relation<l1_to_l2_message_tree_check_relations>(trace);
    check_all_interactions<L1ToL2MessageTreeCheckTraceBuilder>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
