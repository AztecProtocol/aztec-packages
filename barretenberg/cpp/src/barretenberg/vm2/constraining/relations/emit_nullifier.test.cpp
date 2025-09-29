#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/simulation/events/nullifier_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/nullifier_tree_check.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_merkle_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_nullifier_tree_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_poseidon2.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/nullifier_tree_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::ExecutionTraceBuilder;
using tracegen::NullifierTreeCheckTraceBuilder;
using tracegen::TestTraceContainer;

using simulation::EventEmitter;
using simulation::MockFieldGreaterThan;
using simulation::MockMerkleCheck;
using simulation::MockPoseidon2;
using simulation::MockRangeCheck;
using simulation::NullifierTreeCheck;
using simulation::NullifierTreeCheckEvent;
using simulation::NullifierTreeLeafPreimage;

using testing::_;
using testing::Return;
using testing::StrictMock;

using FF = AvmFlavorSettings::FF;
using C = Column;
using emit_nullifier = bb::avm2::emit_nullifier<FF>;
using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

TEST(EmitNullifierConstrainingTest, Positive)
{
    uint64_t prev_num_nullifiers_emitted = MAX_NULLIFIERS_PER_TX - 1;
    TestTraceContainer trace({ {
        { C::execution_sel_execute_emit_nullifier, 1 },
        { C::execution_register_0_, /*nullifier=*/42 },
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_remaining_nullifiers_inv, FF(MAX_NULLIFIERS_PER_TX - prev_num_nullifiers_emitted).invert() },
        { C::execution_sel_write_nullifier, 1 },
        { C::execution_sel_opcode_error, 0 },
        { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_EMIT_NULLIFIER },
        { C::execution_prev_nullifier_tree_size, 1 },
        { C::execution_nullifier_tree_size, 2 },
        { C::execution_prev_num_nullifiers_emitted, prev_num_nullifiers_emitted },
        { C::execution_num_nullifiers_emitted, prev_num_nullifiers_emitted + 1 },
    } });
    check_relation<emit_nullifier>(trace);
}

TEST(EmitNullifierConstrainingTest, LimitReached)
{
    uint64_t prev_num_nullifiers_emitted = MAX_NULLIFIERS_PER_TX;
    TestTraceContainer trace({ {
        { C::execution_sel_execute_emit_nullifier, 1 },
        { C::execution_register_0_, /*nullifier=*/42 },
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_sel_reached_max_nullifiers, 1 },
        { C::execution_remaining_nullifiers_inv, 0 },
        { C::execution_sel_write_nullifier, 0 },
        { C::execution_sel_opcode_error, 1 },
        { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_EMIT_NULLIFIER },
        { C::execution_prev_nullifier_tree_size, 1 },
        { C::execution_nullifier_tree_size, 1 },
        { C::execution_prev_num_nullifiers_emitted, prev_num_nullifiers_emitted },
        { C::execution_num_nullifiers_emitted, prev_num_nullifiers_emitted },
    } });
    check_relation<emit_nullifier>(trace);

    // Negative test: sel_reached_max_nullifiers must be 1
    trace.set(C::execution_sel_reached_max_nullifiers, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_nullifier>(trace, emit_nullifier::SR_MAX_NULLIFIER_WRITES_REACHED),
                              "MAX_NULLIFIER_WRITES_REACHED");
    trace.set(C::execution_sel_reached_max_nullifiers, 0, 1);

    // Negative test: sel_opcode_error must be on
    trace.set(C::execution_sel_opcode_error, 0, 0);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<emit_nullifier>(trace, emit_nullifier::SR_OPCODE_ERROR_IF_VALIDATION_ERROR),
        "OPCODE_ERROR_IF_VALIDATION_ERROR");
    trace.set(C::execution_sel_opcode_error, 0, 1);

    // Negative test: nullifier tree root must be the same
    trace.set(C::execution_nullifier_tree_root, 0, 28);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<emit_nullifier>(trace, emit_nullifier::SR_EMIT_NULLIFIER_TREE_ROOT_NOT_CHANGED),
        "EMIT_NULLIFIER_TREE_ROOT_NOT_CHANGED");

    // Negative test: tree size must be the same
    trace.set(C::execution_nullifier_tree_size, 0, 2);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<emit_nullifier>(trace, emit_nullifier::SR_EMIT_NULLIFIER_TREE_SIZE_INCREASE),
        "EMIT_NULLIFIER_TREE_SIZE_INCREASE");

    // Negative test: num nullifiers emitted must be the same
    trace.set(C::execution_num_nullifiers_emitted, 0, prev_num_nullifiers_emitted + 1);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<emit_nullifier>(trace, emit_nullifier::SR_EMIT_NULLIFIER_NUM_NULLIFIERS_EMITTED_INCREASE),
        "EMIT_NULLIFIER_NUM_NULLIFIERS_EMITTED_INCREASE");
}

TEST(EmitNullifierConstrainingTest, Interactions)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<NullifierTreeCheckEvent> nullifier_tree_check_event_emitter;
    NullifierTreeCheck nullifier_tree_check(poseidon2, merkle_check, field_gt, nullifier_tree_check_event_emitter);

    FF nullifier = 42;
    AztecAddress contract_address = 0xdeadbeef;
    FF siloed_nullifier = 66;
    FF low_leaf_nullifier = 99; // siloed nullifier != low leaf nullifier (NO COLLISION)
    FF low_leaf_hash = 77;
    FF updated_low_leaf_hash = 101;
    FF new_leaf_hash = 111;
    FF pre_write_root = 27;
    FF intermediate_root = 33;
    FF post_write_root = 88;

    // insertion sibling path
    std::vector<FF> insertion_sibling_path = { 1, 2, 3 };

    AppendOnlyTreeSnapshot prev_snapshot = AppendOnlyTreeSnapshot{
        .root = pre_write_root,
        .nextAvailableLeafIndex = 128,
    };
    uint32_t prev_num_nullifiers_emitted = 2;

    // mock the nullifier > low leaf nullifier to return true
    EXPECT_CALL(field_gt, ff_gt).WillOnce(Return(true));
    // mock siloing, low leaf hashing, updated low leaf hashing, new leaf hashing
    EXPECT_CALL(poseidon2, hash)
        .WillOnce(Return(siloed_nullifier))
        .WillOnce(Return(low_leaf_hash))
        .WillOnce(Return(updated_low_leaf_hash))
        .WillOnce(Return(new_leaf_hash));
    // mock merkle check write
    EXPECT_CALL(merkle_check, write).WillOnce(Return(intermediate_root)).WillOnce(Return(post_write_root));

    // low leaf preimage
    NullifierTreeLeafPreimage low_leaf_preimage = { NullifierLeafValue(low_leaf_nullifier), 0, 0 };

    AppendOnlyTreeSnapshot next_snapshot = nullifier_tree_check.write(nullifier,
                                                                      contract_address,
                                                                      prev_num_nullifiers_emitted,
                                                                      low_leaf_preimage,
                                                                      0,
                                                                      {},
                                                                      prev_snapshot,
                                                                      insertion_sibling_path);

    TestTraceContainer trace({ {
        { C::execution_sel_execute_emit_nullifier, 1 },
        { C::execution_register_0_, nullifier },
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_remaining_nullifiers_inv, FF(MAX_NULLIFIERS_PER_TX - prev_num_nullifiers_emitted).invert() },
        { C::execution_sel_write_nullifier, 1 },
        { C::execution_sel_opcode_error, 0 }, // No errors!
        { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_EMIT_NULLIFIER },
        { C::execution_prev_num_nullifiers_emitted, prev_num_nullifiers_emitted },
        { C::execution_num_nullifiers_emitted, prev_num_nullifiers_emitted + 1 }, // increment on success
        { C::execution_prev_nullifier_tree_root, prev_snapshot.root },
        { C::execution_nullifier_tree_root, next_snapshot.root },
        { C::execution_prev_nullifier_tree_size, prev_snapshot.nextAvailableLeafIndex },
        { C::execution_nullifier_tree_size, next_snapshot.nextAvailableLeafIndex },
        { C::execution_contract_address, contract_address },
    } });

    NullifierTreeCheckTraceBuilder nullifier_tree_check_trace_builder;
    nullifier_tree_check_trace_builder.process(nullifier_tree_check_event_emitter.dump_events(), trace);
    check_relation<emit_nullifier>(trace);

    check_interaction<ExecutionTraceBuilder, lookup_emit_nullifier_write_nullifier_settings>(trace);
}

TEST(EmitNullifierConstrainingTest, InteractionsCollision)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<NullifierTreeCheckEvent> nullifier_tree_check_event_emitter;
    NullifierTreeCheck nullifier_tree_check(poseidon2, merkle_check, field_gt, nullifier_tree_check_event_emitter);

    FF nullifier = 42;
    AztecAddress contract_address = 0xdeadbeef;
    FF siloed_nullifier = 66;
    FF low_leaf_hash = 77;
    FF pre_write_root = 27;

    AppendOnlyTreeSnapshot prev_snapshot = AppendOnlyTreeSnapshot{
        .root = pre_write_root,
        .nextAvailableLeafIndex = 128,
    };
    uint32_t prev_num_nullifiers_emitted = 2;

    // mock siloing and low leaf hashing
    EXPECT_CALL(poseidon2, hash).WillOnce(Return(siloed_nullifier)).WillOnce(Return(low_leaf_hash));
    // mock merkle check assert membership
    EXPECT_CALL(merkle_check, assert_membership).WillOnce(Return());

    // low leaf preimage
    NullifierTreeLeafPreimage low_leaf_preimage = { NullifierLeafValue(siloed_nullifier), 0, 0 };

    AppendOnlyTreeSnapshot next_snapshot = nullifier_tree_check.write(nullifier,
                                                                      contract_address,
                                                                      prev_num_nullifiers_emitted,
                                                                      low_leaf_preimage,
                                                                      0,
                                                                      {},
                                                                      prev_snapshot,
                                                                      std::nullopt);

    TestTraceContainer trace({ {
        { C::execution_sel_execute_emit_nullifier, 1 },
        { C::execution_register_0_, nullifier },
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_remaining_nullifiers_inv, FF(MAX_NULLIFIERS_PER_TX - prev_num_nullifiers_emitted).invert() },
        { C::execution_sel_write_nullifier, 1 },
        { C::execution_sel_opcode_error, 1 }, // collision
        { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_EMIT_NULLIFIER },
        { C::execution_prev_num_nullifiers_emitted, prev_num_nullifiers_emitted },
        { C::execution_num_nullifiers_emitted, prev_num_nullifiers_emitted }, // No increment on error
        { C::execution_prev_nullifier_tree_root, prev_snapshot.root },
        { C::execution_nullifier_tree_root, next_snapshot.root },
        { C::execution_prev_nullifier_tree_size, prev_snapshot.nextAvailableLeafIndex },
        { C::execution_nullifier_tree_size, next_snapshot.nextAvailableLeafIndex },
        { C::execution_contract_address, contract_address },
    } });

    NullifierTreeCheckTraceBuilder nullifier_tree_check_trace_builder;
    nullifier_tree_check_trace_builder.process(nullifier_tree_check_event_emitter.dump_events(), trace);
    check_relation<emit_nullifier>(trace);

    check_interaction<ExecutionTraceBuilder, lookup_emit_nullifier_write_nullifier_settings>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
