#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/simulation/concrete_dbs.hpp"
#include "barretenberg/vm2/simulation/events/public_data_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/public_data_tree_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_dbs.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_merkle_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_note_hash_tree_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_nullifier_tree_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_poseidon2.hpp"
#include "barretenberg/vm2/simulation/testing/mock_written_public_data_slots_tree_check.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/public_data_tree_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::ExecutionTraceBuilder;
using tracegen::PublicDataTreeTraceBuilder;
using tracegen::TestTraceContainer;

using simulation::EventEmitter;
using simulation::MerkleDB;
using simulation::MockExecutionIdManager;
using simulation::MockFieldGreaterThan;
using simulation::MockLowLevelMerkleDB;
using simulation::MockMerkleCheck;
using simulation::MockNoteHashTreeCheck;
using simulation::MockNullifierTreeCheck;
using simulation::MockPoseidon2;
using simulation::MockWrittenPublicDataSlotsTreeCheck;
using simulation::PublicDataTreeCheck;
using simulation::PublicDataTreeCheckEvent;

using testing::NiceMock;
using testing::ReturnRef;

using FF = AvmFlavorSettings::FF;
using C = Column;
using sload = bb::avm2::sload<FF>;

TEST(SLoadConstrainingTest, PositiveTest)
{
    TestTraceContainer trace({
        { { C::execution_sel_execute_sload, 1 },
          { C::execution_register_0_, /*slot=*/42 },
          { C::execution_register_1_, /*dst=*/27 },
          { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
          { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::FF) },
          { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_SLOAD } },
    });
    check_relation<sload>(trace);
}

TEST(SLoadConstrainingTest, NegativeInvalidOutputTag)
{
    TestTraceContainer trace({
        { { C::execution_sel_execute_sload, 1 },
          { C::execution_register_0_, /*slot=*/42 },
          { C::execution_register_1_, /*dst=*/27 },
          { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
          { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::U32) },
          { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_SLOAD } },
    });
    EXPECT_THROW_WITH_MESSAGE(check_relation<sload>(trace), "SLOAD_FF_OUTPUT_TAG");
}

TEST(SLoadConstrainingTest, NegativeSloadSuccess)
{
    TestTraceContainer trace({
        { { C::execution_sel_execute_sload, 1 },
          { C::execution_register_0_, /*slot=*/42 },
          { C::execution_register_1_, /*dst=*/27 },
          { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
          { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::FF) },
          { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_SLOAD },
          { C::execution_sel_opcode_error, 1 } },
    });
    EXPECT_THROW_WITH_MESSAGE(check_relation<sload>(trace), "SLOAD_SUCCESS");
}

TEST(SLoadConstrainingTest, Interactions)
{
    NiceMock<MockPoseidon2> poseidon2;
    NiceMock<MockFieldGreaterThan> field_gt;
    NiceMock<MockMerkleCheck> merkle_check;
    NiceMock<MockExecutionIdManager> execution_id_manager;
    NiceMock<MockWrittenPublicDataSlotsTreeCheck> written_public_data_slots_tree_check;
    NiceMock<MockLowLevelMerkleDB> low_level_merkle_db;
    NiceMock<MockNullifierTreeCheck> nullifier_tree_check;
    NiceMock<MockNoteHashTreeCheck> note_hash_tree_check;

    EventEmitter<PublicDataTreeCheckEvent> public_data_tree_check_event_emitter;
    PublicDataTreeCheck public_data_tree_check(
        poseidon2, merkle_check, field_gt, execution_id_manager, public_data_tree_check_event_emitter);

    FF slot = 42;
    AztecAddress contract_address = 1;

    MerkleDB merkle_db(low_level_merkle_db,
                       public_data_tree_check,
                       nullifier_tree_check,
                       note_hash_tree_check,
                       written_public_data_slots_tree_check);

    TreeSnapshots trees;
    trees.publicDataTree.root = 42;
    EXPECT_CALL(low_level_merkle_db, get_tree_roots()).WillRepeatedly(ReturnRef(trees));

    FF value = merkle_db.storage_read(contract_address, slot);

    TestTraceContainer trace({
        { { C::execution_sel_execute_sload, 1 },
          { C::execution_register_0_, slot },
          { C::execution_register_1_, value },
          { C::execution_mem_tag_reg_0_, static_cast<uint8_t>(MemoryTag::FF) },
          { C::execution_mem_tag_reg_1_, static_cast<uint8_t>(MemoryTag::FF) },
          { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_SLOAD },
          { C::execution_contract_address, contract_address },
          { C::execution_prev_public_data_tree_root, trees.publicDataTree.root } },
    });

    PublicDataTreeTraceBuilder public_data_tree_trace_builder;
    public_data_tree_trace_builder.process(public_data_tree_check_event_emitter.dump_events(), trace);

    check_relation<sload>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_sload_storage_read_settings>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
