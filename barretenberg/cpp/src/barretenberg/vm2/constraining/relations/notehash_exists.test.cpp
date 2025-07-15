#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/testing/mock_merkle_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_note_hash_tree_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_poseidon2.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/note_hash_tree_check_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::ExecutionTraceBuilder;
using tracegen::NoteHashTreeCheckTraceBuilder;
using tracegen::RangeCheckTraceBuilder;
using tracegen::TestTraceContainer;

using simulation::EventEmitter;
using simulation::MockMerkleCheck;
using simulation::MockPoseidon2;
using simulation::NoteHashTreeCheck;
using simulation::NoteHashTreeCheckEvent;
using simulation::RangeCheck;
using simulation::RangeCheckEvent;

using testing::NiceMock;

using FF = AvmFlavorSettings::FF;
using C = Column;
using notehash_exists = bb::avm2::notehash_exists<FF>;
using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

TEST(NoteHashExistsConstrainingTest, PositiveExists)
{
    uint64_t leaf_index_leaf_count_cmp_diff = NOTE_HASH_TREE_LEAF_COUNT - 27 - 1;
    TestTraceContainer trace({
        { { C::execution_sel_execute_notehash_exists, 1 },
          { C::execution_register_0_, /*unique_note_hash=*/42 },
          { C::execution_register_1_, /*leaf_index=*/27 },
          { C::execution_register_2_, /*dst=*/1 },
          { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
          { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U64) },
          { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U1) },
          { C::execution_note_hash_leaf_in_range, 1 },
          { C::execution_note_hash_leaf_index_leaf_count_cmp_diff, leaf_index_leaf_count_cmp_diff },
          { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_NOTEHASH_EXISTS } },
    });
    check_relation<notehash_exists>(trace);
}

TEST(NoteHashExistsConstrainingTest, OutOfRange)
{
    uint64_t leaf_index = NOTE_HASH_TREE_LEAF_COUNT + 1;
    uint64_t leaf_index_leaf_count_cmp_diff = leaf_index - NOTE_HASH_TREE_LEAF_COUNT;

    TestTraceContainer trace({
        { { C::execution_sel_execute_notehash_exists, 1 },
          { C::execution_register_0_, /*unique_note_hash=*/42 },
          { C::execution_register_1_, /*leaf_index=*/leaf_index },
          { C::execution_register_2_, /*dst=*/0 },
          { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
          { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U64) },
          { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U1) },
          { C::execution_note_hash_leaf_in_range, 0 },
          { C::execution_note_hash_leaf_index_leaf_count_cmp_diff, leaf_index_leaf_count_cmp_diff },
          { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_NOTEHASH_EXISTS } },
    });

    check_relation<notehash_exists>(trace);

    // Negative test: exists must be false
    trace.set(0, { { { C::execution_register_2_, 1 } } });
    EXPECT_THROW_WITH_MESSAGE(check_relation<notehash_exists>(trace), "NOTE_HASH_EXISTS_OUT_OF_RANGE_FALSE");
}

TEST(NoteHashExistsConstrainingTest, NegativeInvalidOutputTag)
{
    TestTraceContainer trace({ {
        { C::execution_sel_execute_notehash_exists, 1 },
        { C::execution_register_0_, /*unique_note_hash=*/42 },
        { C::execution_register_1_, /*leaf_index=*/27 },
        { C::execution_register_2_, /*dst=*/1 },
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U64) },
        { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U8) },
    } });
    EXPECT_THROW_WITH_MESSAGE(check_relation<notehash_exists>(trace, notehash_exists::SR_NOTEHASH_EXISTS_U1_OUTPUT_TAG),
                              "NOTEHASH_EXISTS_U1_OUTPUT_TAG");
}

TEST(NoteHashExistsConstrainingTest, NegativeNoteHashExistsSuccess)
{
    TestTraceContainer trace({ {
        { C::execution_sel_execute_notehash_exists, 1 },
        { C::execution_sel_opcode_error, 1 },
    } });

    EXPECT_THROW_WITH_MESSAGE(check_relation<notehash_exists>(trace, notehash_exists::SR_NOTE_HASH_EXISTS_SUCCESS),
                              "NOTE_HASH_EXISTS_SUCCESS");
}

TEST(NoteHashExistsConstrainingTest, Interactions)
{
    NiceMock<MockPoseidon2> poseidon2;
    NiceMock<MockMerkleCheck> merkle_check;

    EventEmitter<RangeCheckEvent> range_check_event_emitter;
    RangeCheck range_check(range_check_event_emitter);
    EventEmitter<NoteHashTreeCheckEvent> note_hash_tree_check_event_emitter;
    NoteHashTreeCheck note_hash_tree_check(27, poseidon2, merkle_check, note_hash_tree_check_event_emitter);

    FF requested_note_hash = 42;
    FF actual_leaf_value = 43;

    uint64_t leaf_index = 27;
    uint64_t leaf_index_leaf_count_cmp_diff = NOTE_HASH_TREE_LEAF_COUNT - leaf_index - 1;

    AppendOnlyTreeSnapshot note_hash_tree_snapshot = AppendOnlyTreeSnapshot{
        .root = 42,
        .nextAvailableLeafIndex = 128,
    };

    range_check.assert_range(leaf_index_leaf_count_cmp_diff, 64);
    note_hash_tree_check.note_hash_exists(
        requested_note_hash, actual_leaf_value, leaf_index, {}, note_hash_tree_snapshot);

    TestTraceContainer trace({ {
        { C::execution_sel_execute_notehash_exists, 1 },
        { C::execution_register_0_, requested_note_hash },
        { C::execution_register_1_, leaf_index },
        { C::execution_register_2_, /*result=*/0 },
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U64) },
        { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U1) },
        { C::execution_note_hash_leaf_in_range, 1 },
        { C::execution_sel_opcode_error, 0 },
        { C::execution_note_hash_leaf_index_leaf_count_cmp_diff, leaf_index_leaf_count_cmp_diff },
        { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_NOTEHASH_EXISTS },
        { C::execution_prev_note_hash_tree_root, note_hash_tree_snapshot.root },
        { C::execution_constant_64, 64 },
    } });

    NoteHashTreeCheckTraceBuilder note_hash_tree_check_trace_builder;
    note_hash_tree_check_trace_builder.process(note_hash_tree_check_event_emitter.dump_events(), trace);

    RangeCheckTraceBuilder range_check_trace_builder;
    range_check_trace_builder.process(range_check_event_emitter.dump_events(), trace);

    check_relation<notehash_exists>(trace);

    check_interaction<ExecutionTraceBuilder,
                      lookup_notehash_exists_note_hash_read_settings,
                      lookup_notehash_exists_note_hash_index_range_settings>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
