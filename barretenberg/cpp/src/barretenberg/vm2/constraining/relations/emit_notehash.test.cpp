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
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/note_hash_tree_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::ExecutionTraceBuilder;
using tracegen::NoteHashTreeCheckTraceBuilder;
using tracegen::TestTraceContainer;

using simulation::EventEmitter;
using simulation::MockMerkleCheck;
using simulation::MockPoseidon2;
using simulation::MockRangeCheck;
using simulation::NoteHashTreeCheck;
using simulation::NoteHashTreeCheckEvent;

using testing::_;
using testing::NiceMock;
using testing::Return;

using FF = AvmFlavorSettings::FF;
using C = Column;
using emit_notehash = bb::avm2::emit_notehash<FF>;
using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

TEST(EmitNoteHashConstrainingTest, Positive)
{
    uint64_t prev_num_note_hashes_emitted = MAX_NOTE_HASHES_PER_TX - 1;
    TestTraceContainer trace({ {
        { C::execution_sel_execute_emit_notehash, 1 },
        { C::execution_register_0_, /*note_hash=*/42 },
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_remaining_note_hashes_inv, FF(MAX_NOTE_HASHES_PER_TX - prev_num_note_hashes_emitted).invert() },
        { C::execution_sel_write_note_hash, 1 },
        { C::execution_sel_opcode_error, 0 },
        { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_EMIT_NOTEHASH },
        { C::execution_prev_note_hash_tree_size, 1 },
        { C::execution_note_hash_tree_size, 2 },
        { C::execution_prev_num_note_hashes_emitted, prev_num_note_hashes_emitted },
        { C::execution_num_note_hashes_emitted, prev_num_note_hashes_emitted + 1 },
    } });
    check_relation<emit_notehash>(trace);
}

TEST(EmitNoteHashConstrainingTest, LimitReached)
{
    uint64_t prev_num_note_hashes_emitted = MAX_NOTE_HASHES_PER_TX;
    TestTraceContainer trace({ {
        { C::execution_sel_execute_emit_notehash, 1 },
        { C::execution_register_0_, /*note_hash=*/42 },
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_remaining_note_hashes_inv, 0 },
        { C::execution_sel_write_note_hash, 0 },
        { C::execution_sel_opcode_error, 1 },
        { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_EMIT_NOTEHASH },
        { C::execution_prev_note_hash_tree_size, 1 },
        { C::execution_note_hash_tree_size, 1 },
        { C::execution_prev_num_note_hashes_emitted, prev_num_note_hashes_emitted },
        { C::execution_num_note_hashes_emitted, prev_num_note_hashes_emitted },
    } });
    check_relation<emit_notehash>(trace);

    // Negative test: sel_opcode_error must be on
    trace.set(C::execution_sel_opcode_error, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_notehash>(trace, emit_notehash::SR_EMIT_NOTEHASH_LIMIT_REACHED),
                              "EMIT_NOTEHASH_LIMIT_REACHED");

    // Negative test: tree size must be the same
    trace.set(C::execution_note_hash_tree_size, 0, 2);
    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_notehash>(trace, emit_notehash::SR_EMIT_NOTEHASH_TREE_SIZE_INCREASE),
                              "EMIT_NOTEHASH_TREE_SIZE_INCREASE");

    // Negative test: num note hashes emitted must be the same
    trace.set(C::execution_num_note_hashes_emitted, 0, prev_num_note_hashes_emitted + 1);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<emit_notehash>(trace, emit_notehash::SR_EMIT_NOTEHASH_NUM_NOTE_HASHES_EMITTED_INCREASE),
        "EMIT_NOTEHASH_NUM_NOTE_HASHES_EMITTED_INCREASE");
}

TEST(EmitNoteHashConstrainingTest, Interactions)
{
    NiceMock<MockPoseidon2> poseidon2;
    NiceMock<MockMerkleCheck> merkle_check;
    NiceMock<MockRangeCheck> range_check;

    EventEmitter<NoteHashTreeCheckEvent> note_hash_tree_check_event_emitter;
    NoteHashTreeCheck note_hash_tree_check(27, poseidon2, merkle_check, note_hash_tree_check_event_emitter);

    FF note_hash = 42;
    AztecAddress contract_address = 0xdeadbeef;

    AppendOnlyTreeSnapshot prev_snapshot = AppendOnlyTreeSnapshot{
        .root = 27,
        .nextAvailableLeafIndex = 128,
    };
    uint32_t prev_num_note_hashes_emitted = 2;

    EXPECT_CALL(merkle_check, write).WillOnce(Return(57));

    AppendOnlyTreeSnapshot next_snapshot = note_hash_tree_check.append_note_hash(
        note_hash, contract_address, prev_num_note_hashes_emitted, {}, prev_snapshot);

    TestTraceContainer trace({ {
        { C::execution_sel_execute_emit_notehash, 1 },
        { C::execution_register_0_, note_hash },
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_remaining_note_hashes_inv, FF(MAX_NOTE_HASHES_PER_TX - prev_num_note_hashes_emitted).invert() },
        { C::execution_sel_write_note_hash, 1 },
        { C::execution_sel_opcode_error, 0 },
        { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_EMIT_NOTEHASH },
        { C::execution_prev_num_note_hashes_emitted, prev_num_note_hashes_emitted },
        { C::execution_num_note_hashes_emitted, prev_num_note_hashes_emitted + 1 },
        { C::execution_prev_note_hash_tree_root, prev_snapshot.root },
        { C::execution_note_hash_tree_root, next_snapshot.root },
        { C::execution_prev_note_hash_tree_size, prev_snapshot.nextAvailableLeafIndex },
        { C::execution_note_hash_tree_size, next_snapshot.nextAvailableLeafIndex },
        { C::execution_contract_address, contract_address },
    } });

    NoteHashTreeCheckTraceBuilder note_hash_tree_check_trace_builder;
    note_hash_tree_check_trace_builder.process(note_hash_tree_check_event_emitter.dump_events(), trace);
    check_relation<emit_notehash>(trace);

    check_interaction<ExecutionTraceBuilder, lookup_emit_notehash_notehash_tree_write_settings>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
