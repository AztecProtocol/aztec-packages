#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/generated/relations/lookups_context.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using execution = bb::avm2::execution<FF>;

TEST(ExecutionConstrainingTest, EmptyRow)
{
    check_relation<execution>(testing::empty_trace());
}

// DO NOT SUBMIT: add full flow tests
// TEST(ExecutionConstrainingTest, Basic)
// {
//     // clang-format off
//     TestTraceContainer trace({
//          {{ C::execution_sel, 1 }, { C::execution_pc, 0 }},
//          {{ C::execution_sel, 1 }, { C::execution_pc, 20 }, { C::execution_last, 1 }}
//     });
//     // clang-format on

//     check_relation<execution>(trace);
// }

TEST(ExecutionConstrainingTest, Continuity)
{
    // clang-format off
    TestTraceContainer trace({
        {{ C::precomputed_first_row, 1 }},
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }, {C::execution_last, 1}},
    });
    // clang-format on

    check_relation<execution>(trace, execution::SR_TRACE_CONTINUITY);
}

TEST(ExecutionConstrainingTest, ContinuityBrokenFirstRow)
{
    // clang-format off
    TestTraceContainer trace({
        {{ C::execution_sel, 0 }},  // End of trace!
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }, {C::execution_last, 1}},
    });
    // clang-format on

    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_TRACE_CONTINUITY), "TRACE_CONTINUITY");
}

TEST(ExecutionConstrainingTest, ContinuityBrokenInMiddle)
{
    // clang-format off
    TestTraceContainer trace({
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 0 }},  // End of trace!
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }, {C::execution_last, 1}},
    });
    // clang-format on

    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_TRACE_CONTINUITY), "TRACE_CONTINUITY");
}

TEST(ExecutionConstrainingTest, ContinuityMultipleLast)
{
    // clang-format off
    TestTraceContainer trace({
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }, {C::execution_last, 1}},
    });
    // clang-format on

    // Last is correct.
    check_relation<execution>(trace, execution::SR_LAST_IS_LAST);
    // If we add another last, it should fail.
    trace.set(C::execution_last, /*row=*/1, /*value=*/1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_LAST_IS_LAST), "LAST_IS_LAST.*row 1");
}

TEST(ExecutionConstrainingTest, TreeStateNotChanged)
{
    TestTraceContainer trace({
        {
            { C::precomputed_first_row, 1 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_prev_note_hash_tree_root, 10 },
            { C::execution_prev_note_hash_tree_size, 9 },
            { C::execution_prev_num_note_hashes_emitted, 8 },
            { C::execution_prev_nullifier_tree_root, 7 },
            { C::execution_prev_nullifier_tree_size, 6 },
            { C::execution_prev_num_nullifiers_emitted, 5 },
            { C::execution_prev_public_data_tree_root, 4 },
            { C::execution_prev_public_data_tree_size, 3 },
            { C::execution_prev_written_public_data_slots_tree_root, 2 },
            { C::execution_prev_written_public_data_slots_tree_size, 1 },
            { C::execution_prev_retrieved_bytecodes_tree_root, 12 },
            { C::execution_prev_retrieved_bytecodes_tree_size, 13 },
            { C::execution_note_hash_tree_root, 10 },
            { C::execution_note_hash_tree_size, 9 },
            { C::execution_num_note_hashes_emitted, 8 },
            { C::execution_nullifier_tree_root, 7 },
            { C::execution_nullifier_tree_size, 6 },
            { C::execution_num_nullifiers_emitted, 5 },
            { C::execution_public_data_tree_root, 4 },
            { C::execution_public_data_tree_size, 3 },
            { C::execution_written_public_data_slots_tree_root, 2 },
            { C::execution_written_public_data_slots_tree_size, 1 },
            { C::execution_retrieved_bytecodes_tree_root, 12 },
            { C::execution_retrieved_bytecodes_tree_size, 13 },
        },
    });

    check_relation<execution>(trace,
                              execution::SR_NOTE_HASH_TREE_ROOT_NOT_CHANGED,
                              execution::SR_NOTE_HASH_TREE_SIZE_NOT_CHANGED,
                              execution::SR_NUM_NOTE_HASHES_EMITTED_NOT_CHANGED,
                              execution::SR_NULLIFIER_TREE_ROOT_NOT_CHANGED,
                              execution::SR_NULLIFIER_TREE_SIZE_NOT_CHANGED,
                              execution::SR_NUM_NULLIFIERS_EMITTED_NOT_CHANGED,
                              execution::SR_PUBLIC_DATA_TREE_ROOT_NOT_CHANGED,
                              execution::SR_PUBLIC_DATA_TREE_SIZE_NOT_CHANGED,
                              execution::SR_WRITTEN_PUBLIC_DATA_SLOTS_TREE_ROOT_NOT_CHANGED,
                              execution::SR_WRITTEN_PUBLIC_DATA_SLOTS_TREE_SIZE_NOT_CHANGED,
                              execution::SR_RETRIEVED_BYTECODES_TREE_ROOT_NOT_CHANGED,
                              execution::SR_RETRIEVED_BYTECODES_TREE_SIZE_NOT_CHANGED);

    // Negative test: change note hash tree root
    trace.set(C::execution_note_hash_tree_root, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_NOTE_HASH_TREE_ROOT_NOT_CHANGED),
                              "NOTE_HASH_TREE_ROOT_NOT_CHANGED");

    // Negative test: change note hash tree size
    trace.set(C::execution_note_hash_tree_size, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_NOTE_HASH_TREE_SIZE_NOT_CHANGED),
                              "NOTE_HASH_TREE_SIZE_NOT_CHANGED");

    // Negative test: change num note hashes emitted
    trace.set(C::execution_num_note_hashes_emitted, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_NUM_NOTE_HASHES_EMITTED_NOT_CHANGED),
                              "NUM_NOTE_HASHES_EMITTED_NOT_CHANGED");

    // Negative test: change nullifier tree root
    trace.set(C::execution_nullifier_tree_root, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_NULLIFIER_TREE_ROOT_NOT_CHANGED),
                              "NULLIFIER_TREE_ROOT_NOT_CHANGED");

    // Negative test: change nullifier tree size
    trace.set(C::execution_nullifier_tree_size, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_NULLIFIER_TREE_SIZE_NOT_CHANGED),
                              "NULLIFIER_TREE_SIZE_NOT_CHANGED");

    // Negative test: change num nullifiers emitted
    trace.set(C::execution_prev_num_nullifiers_emitted, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_NUM_NULLIFIERS_EMITTED_NOT_CHANGED),
                              "NUM_NULLIFIERS_EMITTED_NOT_CHANGED");

    // Negative test: change public data tree root
    trace.set(C::execution_public_data_tree_root, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_PUBLIC_DATA_TREE_ROOT_NOT_CHANGED),
                              "PUBLIC_DATA_TREE_ROOT_NOT_CHANGED");

    // Negative test: change public data tree size
    trace.set(C::execution_public_data_tree_size, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_PUBLIC_DATA_TREE_SIZE_NOT_CHANGED),
                              "PUBLIC_DATA_TREE_SIZE_NOT_CHANGED");

    // Negative test: change written public data slots tree root
    trace.set(C::execution_written_public_data_slots_tree_root, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<execution>(trace, execution::SR_WRITTEN_PUBLIC_DATA_SLOTS_TREE_ROOT_NOT_CHANGED),
        "WRITTEN_PUBLIC_DATA_SLOTS_TREE_ROOT_NOT_CHANGED");

    // Negative test: change written public data slots tree size
    trace.set(C::execution_written_public_data_slots_tree_size, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<execution>(trace, execution::SR_WRITTEN_PUBLIC_DATA_SLOTS_TREE_SIZE_NOT_CHANGED),
        "WRITTEN_PUBLIC_DATA_SLOTS_TREE_SIZE_NOT_CHANGED");

    // Negative test: change retrieved bytecodes tree root
    trace.set(C::execution_retrieved_bytecodes_tree_root, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_RETRIEVED_BYTECODES_TREE_ROOT_NOT_CHANGED),
                              "RETRIEVED_BYTECODES_TREE_ROOT_NOT_CHANGED");

    // Negative test: change retrieved bytecodes tree size
    trace.set(C::execution_retrieved_bytecodes_tree_size, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_RETRIEVED_BYTECODES_TREE_SIZE_NOT_CHANGED),
                              "RETRIEVED_BYTECODES_TREE_SIZE_NOT_CHANGED");
}

TEST(ExecutionConstrainingTest, SideEffectStateNotChanged)
{
    TestTraceContainer trace({
        {
            { C::precomputed_first_row, 1 },
        },
        {
            { C::execution_sel, 1 },
            { C::execution_prev_num_unencrypted_log_fields, 10 },
            { C::execution_prev_num_l2_to_l1_messages, 11 },
            { C::execution_num_unencrypted_log_fields, 10 },
            { C::execution_num_l2_to_l1_messages, 11 },
        },
    });

    check_relation<execution>(
        trace, execution::SR_NUM_UNENCRYPTED_LOGS_NOT_CHANGED, execution::SR_NUM_L2_TO_L1_MESSAGES_NOT_CHANGED);

    // Negative test: change num unencrypted logs
    trace.set(C::execution_num_unencrypted_log_fields, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_NUM_UNENCRYPTED_LOGS_NOT_CHANGED),
                              "NUM_UNENCRYPTED_LOGS_NOT_CHANGED");

    // Negative test: change num l2 to l1 messages
    trace.set(C::execution_num_l2_to_l1_messages, 1, 100);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_NUM_L2_TO_L1_MESSAGES_NOT_CHANGED),
                              "NUM_L2_TO_L1_MESSAGES_NOT_CHANGED");
}

} // namespace
} // namespace bb::avm2::constraining
