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

using testing::NiceMock;

using FF = AvmFlavorSettings::FF;
using C = Column;
using nullifier_exists = bb::avm2::nullifier_exists<FF>;

TEST(NullifierExistsConstrainingTest, PositiveTest)
{
    TestTraceContainer trace({ { { C::execution_sel, 1 },
                                 { C::execution_sel_execute_nullifier_exists, 1 },
                                 { C::execution_register_0_, /*nullifier=*/FF(0x123456) },
                                 { C::execution_register_1_, /*address=*/FF(0xdeadbeef) },
                                 { C::execution_register_2_, /*exists=*/1 },
                                 { C::execution_prev_nullifier_tree_root, FF(0xabc) },
                                 { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
                                 { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::FF) },
                                 { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U1) },
                                 { C::execution_sel_opcode_error, 0 },
                                 { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_NULLIFIER_EXISTS } } });
    check_relation<nullifier_exists>(trace);
}

TEST(NullifierExistsConstrainingTest, PositiveNullifierNotExists)
{
    TestTraceContainer trace({ { { C::execution_sel, 1 },
                                 { C::execution_sel_execute_nullifier_exists, 1 },
                                 { C::execution_register_0_, /*nullifier=*/FF(0x123456) },
                                 { C::execution_register_1_, /*address=*/FF(0xdeadbeef) },
                                 { C::execution_register_2_, /*exists=*/0 }, // nullifier does not exist!
                                 { C::execution_prev_nullifier_tree_root, FF(0xabc) },
                                 { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
                                 { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::FF) },
                                 { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U1) },
                                 { C::execution_sel_opcode_error, 0 },
                                 { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_NULLIFIER_EXISTS } } });
    check_relation<nullifier_exists>(trace);
}

TEST(NullifierExistsConstrainingTest, NegativeInvalidOutputTag)
{
    TestTraceContainer trace({ { { C::execution_sel, 1 },
                                 { C::execution_sel_execute_nullifier_exists, 1 },
                                 { C::execution_register_0_, /*nullifier=*/FF(0x123456) },
                                 { C::execution_register_1_, /*address=*/FF(0xdeadbeef) },
                                 { C::execution_register_2_, /*exists=*/0 }, // nullifier does not exist!
                                 { C::execution_prev_nullifier_tree_root, FF(0xabc) },
                                 { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
                                 { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::FF) },
                                 { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U8) }, // WRONG!
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

    EXPECT_THROW_WITH_MESSAGE(check_relation<nullifier_exists>(trace, nullifier_exists::SR_NULLIFIER_EXISTS_SUCCESS),
                              "NULLIFIER_EXISTS_SUCCESS");
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

    FF nullifier = 42;
    FF address = 43;

    AppendOnlyTreeSnapshot nullifier_tree_snapshot = AppendOnlyTreeSnapshot{
        .root = 42,
        .nextAvailableLeafIndex = 128,
    };

    nullifier_tree_check.assert_read(nullifier, address, true, {}, 0, {}, nullifier_tree_snapshot);

    TestTraceContainer trace({ {
        { C::execution_sel_execute_nullifier_exists, 1 },
        { C::execution_register_0_, nullifier },
        { C::execution_register_1_, address },
        { C::execution_register_2_, /*exists=*/1 },
        { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::FF) },
        { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U1) },
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
