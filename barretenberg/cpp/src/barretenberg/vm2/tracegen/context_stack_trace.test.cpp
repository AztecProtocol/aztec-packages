#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/context_stack_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using testing::ElementsAre;
using testing::Field;

using R = TestTraceContainer::Row;

TEST(ContextStackTraceGenTest, TraceGenerationSnapshot)
{
    TestTraceContainer trace;
    ContextStackTraceBuilder builder;

    TreeStates tree_states = TreeStates{
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

    AppendOnlyTreeSnapshot written_public_data_slots_tree_snapshot = AppendOnlyTreeSnapshot{
        .root = 0x12345678,
        .nextAvailableLeafIndex = 10,
    };

    SideEffectStates side_effect_states = SideEffectStates{ .numUnencryptedLogFields = 1, .numL2ToL1Messages = 2 };

    builder.process({ {
                        .id = 1,
                        .parent_id = 0,
                        .next_pc = 20,
                        .msg_sender = 30,
                        .contract_addr = 40,
                        .is_static = false,
                        .tree_states = tree_states,
                        .written_public_data_slots_tree_snapshot = written_public_data_slots_tree_snapshot,
                        .side_effect_states = side_effect_states,
                    } },
                    trace);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(
            // Only one row.
            AllOf(
                ROW_FIELD_EQ(context_stack_context_id, 1),
                ROW_FIELD_EQ(context_stack_parent_id, 0),
                ROW_FIELD_EQ(context_stack_next_pc, 20),
                ROW_FIELD_EQ(context_stack_msg_sender, 30),
                ROW_FIELD_EQ(context_stack_contract_address, 40),
                ROW_FIELD_EQ(context_stack_is_static, false),
                ROW_FIELD_EQ(context_stack_note_hash_tree_root, tree_states.noteHashTree.tree.root),
                ROW_FIELD_EQ(context_stack_note_hash_tree_size, tree_states.noteHashTree.tree.nextAvailableLeafIndex),
                ROW_FIELD_EQ(context_stack_num_note_hashes_emitted, tree_states.noteHashTree.counter),
                ROW_FIELD_EQ(context_stack_nullifier_tree_root, tree_states.nullifierTree.tree.root),
                ROW_FIELD_EQ(context_stack_nullifier_tree_size, tree_states.nullifierTree.tree.nextAvailableLeafIndex),
                ROW_FIELD_EQ(context_stack_num_nullifiers_emitted, tree_states.nullifierTree.counter),
                ROW_FIELD_EQ(context_stack_public_data_tree_root, tree_states.publicDataTree.tree.root),
                ROW_FIELD_EQ(context_stack_public_data_tree_size,
                             tree_states.publicDataTree.tree.nextAvailableLeafIndex),
                ROW_FIELD_EQ(context_stack_written_public_data_slots_tree_root,
                             written_public_data_slots_tree_snapshot.root),
                ROW_FIELD_EQ(context_stack_written_public_data_slots_tree_size,
                             written_public_data_slots_tree_snapshot.nextAvailableLeafIndex),
                ROW_FIELD_EQ(context_stack_num_unencrypted_log_fields, side_effect_states.numUnencryptedLogFields),
                ROW_FIELD_EQ(context_stack_num_l2_to_l1_messages, side_effect_states.numL2ToL1Messages))));
}

} // namespace
} // namespace bb::avm2::tracegen
