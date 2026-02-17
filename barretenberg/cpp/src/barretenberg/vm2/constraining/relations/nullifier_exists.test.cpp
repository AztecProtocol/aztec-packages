#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_nullifier_exists.hpp"
#include "barretenberg/vm2/generated/relations/nullifier_exists.hpp"
#include "barretenberg/vm2/simulation/gadgets/concrete_dbs.hpp"
#include "barretenberg/vm2/simulation/gadgets/execution.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
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

using simulation::DeduplicatingEventEmitter;
using simulation::EventEmitter;
using simulation::FieldGreaterThan;
using simulation::FieldGreaterThanEvent;
using simulation::MockMerkleCheck;
using simulation::MockPoseidon2;
using simulation::MockRangeCheck;
using simulation::NullifierTreeCheck;
using simulation::NullifierTreeCheckEvent;
using NullifierLeafValue = crypto::merkle_tree::NullifierLeafValue;
using NullifierTreeLeafPreimage = simulation::NullifierTreeLeafPreimage;

using testing::NiceMock;

using FF = AvmFlavorSettings::FF;
using C = Column;
using nullifier_exists = bb::avm2::nullifier_exists<FF>;
using execution = bb::avm2::execution<FF>;

TEST(NullifierExistsConstrainingTest, PositiveTest)
{
    TestTraceContainer trace({ { { C::execution_sel, 1 },
                                 { C::execution_sel_execute_nullifier_exists, 1 },
                                 { C::execution_register_0_, /*siloed_nullifier=*/FF(0x123456) },
                                 { C::execution_register_1_, /*exists=*/1 },
                                 { C::execution_prev_nullifier_tree_root, FF(0xabc) },
                                 { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
                                 { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U1) },
                                 { C::execution_sel_opcode_error, 0 },
                                 { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_NULLIFIER_EXISTS } } });
    check_relation<nullifier_exists>(trace);
}

TEST(NullifierExistsConstrainingTest, PositiveNullifierNotExists)
{
    TestTraceContainer trace({ { { C::execution_sel, 1 },
                                 { C::execution_sel_execute_nullifier_exists, 1 },
                                 { C::execution_register_0_, /*siloed_nullifier=*/FF(0x123456) },
                                 { C::execution_register_1_, /*exists=*/0 }, // nullifier does not exist!
                                 { C::execution_prev_nullifier_tree_root, FF(0xabc) },
                                 { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
                                 { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U1) },
                                 { C::execution_sel_opcode_error, 0 },
                                 { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_NULLIFIER_EXISTS } } });
    check_relation<nullifier_exists>(trace);
}

TEST(NullifierExistsConstrainingTest, NegativeInvalidOutputTag)
{
    TestTraceContainer trace({ { { C::execution_sel, 1 },
                                 { C::execution_sel_execute_nullifier_exists, 1 },
                                 { C::execution_register_0_, /*siloed_nullifier=*/FF(0x123456) },
                                 { C::execution_register_1_, /*exists=*/0 }, // nullifier does not exist!
                                 { C::execution_prev_nullifier_tree_root, FF(0xabc) },
                                 { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
                                 { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U8) }, // WRONG!
                                 { C::execution_sel_opcode_error, 0 },
                                 { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_NULLIFIER_EXISTS } } });
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<nullifier_exists>(trace, nullifier_exists::SR_NULLIFIER_EXISTS_U1_OUTPUT_TAG),
        "NULLIFIER_EXISTS_U1_OUTPUT_TAG");
}

TEST(NullifierExistsConstrainingTest, NegativeNullifierExistsSuccess)
{
    TestTraceContainer trace({ {
        { C::execution_sel_execute_nullifier_exists, 1 },
        { C::execution_sel_opcode_error, 1 },
    } });

    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_INFALLIBLE_OPCODES_SUCCESS),
                              "INFALLIBLE_OPCODES_SUCCESS");
}

TEST(NullifierExistsConstrainingTest, Interactions)
{
    NiceMock<MockPoseidon2> poseidon2;
    NiceMock<MockMerkleCheck> merkle_check;

    NiceMock<MockRangeCheck> range_check;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> event_emitter;
    FieldGreaterThan field_gt(range_check, event_emitter);

    EventEmitter<NullifierTreeCheckEvent> nullifier_tree_check_event_emitter;
    NullifierTreeCheck nullifier_tree_check(poseidon2, merkle_check, field_gt, nullifier_tree_check_event_emitter);

    // Siloed nullifier (no siloing happens in the opcode now)
    FF siloed_nullifier = 42;

    // For exists=true, the low leaf's nullifier must match the searched nullifier
    NullifierTreeLeafPreimage low_leaf = NullifierTreeLeafPreimage(NullifierLeafValue(siloed_nullifier), 0, 0);

    AppendOnlyTreeSnapshot nullifier_tree_snapshot = AppendOnlyTreeSnapshot{
        .root = 42,
        .next_available_leaf_index = 128,
    };

    // should_silo=false (address unused when not siloing)
    nullifier_tree_check.assert_read(
        siloed_nullifier, /*contract_address=*/std::nullopt, /*exists=*/true, low_leaf, 0, {}, nullifier_tree_snapshot);

    TestTraceContainer trace({ {
        { C::execution_sel_execute_nullifier_exists, 1 },
        { C::execution_register_0_, siloed_nullifier },
        { C::execution_register_1_, /*exists=*/1 },
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U1) },
        { C::execution_prev_nullifier_tree_root, nullifier_tree_snapshot.root },
        { C::execution_sel_opcode_error, 0 },
        { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_NULLIFIER_EXISTS },
    } });

    NullifierTreeCheckTraceBuilder nullifier_tree_check_trace_builder;
    nullifier_tree_check_trace_builder.process(nullifier_tree_check_event_emitter.dump_events(), trace);

    check_relation<nullifier_exists>(trace);

    check_interaction<ExecutionTraceBuilder, lookup_nullifier_exists_nullifier_exists_check_settings>(trace);
}

// TODO(dbanks12): interaction tests

} // namespace
} // namespace bb::avm2::constraining
