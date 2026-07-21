#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/generated/relations/lookups_sstore.hpp"
#include "barretenberg/vm2/simulation/events/indexed_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/events/public_data_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/concrete_dbs.hpp"
#include "barretenberg/vm2/simulation/gadgets/public_data_tree_check.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/testing/mock_dbs.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_indexed_tree_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_merkle_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_note_hash_tree_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_poseidon2.hpp"
#include "barretenberg/vm2/simulation/testing/mock_written_public_data_slots_tree_check.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/indexed_tree_check_trace.hpp"
#include "barretenberg/vm2/tracegen/public_data_tree_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::ExecutionTraceBuilder;
using tracegen::IndexedTreeCheckTraceBuilder;
using tracegen::PublicDataTreeTraceBuilder;
using tracegen::TestTraceContainer;

using simulation::build_public_data_slots_tree;
using simulation::EventEmitter;
using simulation::IndexedTreeCheck;
using simulation::IndexedTreeCheckEvent;
using simulation::MockExecutionIdManager;
using simulation::MockFieldGreaterThan;
using simulation::MockMerkleCheck;
using simulation::MockPoseidon2;
using simulation::PublicDataTreeCheck;
using simulation::PublicDataTreeCheckEvent;
using simulation::PublicDataTreeLeafPreimage;
using simulation::unconstrained_compute_leaf_slot;
using simulation::unconstrained_root_from_path;
using simulation::WrittenPublicDataSlotsTreeCheck;

using testing::_;
using testing::NiceMock;

using FF = AvmFlavorSettings::FF;
using C = Column;
using sstore = bb::avm2::sstore<FF>;
using execution = bb::avm2::execution<FF>;
using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

TEST(SStoreConstrainingTest, PositiveTest)
{
    TestTraceContainer trace({
        { { C::execution_sel_execute_sstore, 1 },
          { C::execution_sel_gas_sstore, 1 },
          { C::execution_dynamic_da_gas_factor, 1 },
          { C::execution_register_0_, /*value=*/27 },
          { C::execution_register_1_, /*slot=*/42 },
          { C::execution_prev_written_public_data_slots_tree_size, 5 },
          { C::execution_max_data_writes_reached, 0 },
          { C::execution_remaining_data_writes_inv,
            FF(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX + AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_INITIAL_SIZE - 5).invert() },
          { C::execution_sel_write_public_data, 1 },
          { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_SSTORE } },
    });
    check_relation<sstore>(trace);
}

TEST(SStoreConstrainingTest, NegativeDynamicL2GasIsZero)
{
    TestTraceContainer trace({ {
        { C::execution_sel_execute_sstore, 1 },
        { C::execution_dynamic_l2_gas_factor, 1 },
    } });
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_DYN_L2_GAS_IS_ZERO),
                              execution::get_subrelation_label(execution::SR_DYN_L2_GAS_IS_ZERO));
}

TEST(SStoreConstrainingTest, MaxDataWritesReached)
{
    TestTraceContainer trace({
        {
            { C::execution_sel_execute_sstore, 1 },
            { C::execution_prev_written_public_data_slots_tree_size,
              MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX + AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_INITIAL_SIZE },
            { C::execution_remaining_data_writes_inv, 0 },
            { C::execution_max_data_writes_reached, 1 },
        },
    });
    check_relation<sstore>(trace, sstore::SR_SSTORE_MAX_DATA_WRITES_REACHED);

    trace.set(C::execution_max_data_writes_reached, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<sstore>(trace, sstore::SR_SSTORE_MAX_DATA_WRITES_REACHED),
                              sstore::get_subrelation_label(sstore::SR_SSTORE_MAX_DATA_WRITES_REACHED));
}

TEST(SStoreConstrainingTest, OpcodeError)
{
    TestTraceContainer trace({
        {
            { C::execution_sel_execute_sstore, 1 },
            { C::execution_dynamic_da_gas_factor, 1 },
            { C::execution_max_data_writes_reached, 1 },
            { C::execution_sel_opcode_error, 1 },
        },
        {
            { C::execution_sel_execute_sstore, 1 },
            { C::execution_dynamic_da_gas_factor, 0 },
            { C::execution_max_data_writes_reached, 0 },
            { C::execution_is_static, 1 },
            { C::execution_sel_opcode_error, 1 },
        },
        {
            { C::execution_sel_execute_sstore, 1 },
            { C::execution_dynamic_da_gas_factor, 0 },
            { C::execution_max_data_writes_reached, 1 },
            { C::execution_sel_opcode_error, 0 },
        },
    });
    check_relation<sstore>(trace, sstore::SR_OPCODE_ERROR_IF_OVERFLOW_OR_STATIC);

    trace.set(C::execution_dynamic_da_gas_factor, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<sstore>(trace, sstore::SR_OPCODE_ERROR_IF_OVERFLOW_OR_STATIC),
                              sstore::get_subrelation_label(sstore::SR_OPCODE_ERROR_IF_OVERFLOW_OR_STATIC));

    trace.set(C::execution_dynamic_da_gas_factor, 0, 1);

    trace.set(C::execution_is_static, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<sstore>(trace, sstore::SR_OPCODE_ERROR_IF_OVERFLOW_OR_STATIC),
                              sstore::get_subrelation_label(sstore::SR_OPCODE_ERROR_IF_OVERFLOW_OR_STATIC));
}

TEST(SStoreConstrainingTest, TreeStateNotChangedOnError)
{
    TestTraceContainer trace({ {
        { C::execution_sel_execute_sstore, 1 },
        { C::execution_prev_public_data_tree_root, 27 },
        { C::execution_prev_public_data_tree_size, 5 },
        { C::execution_prev_written_public_data_slots_tree_root, 28 },
        { C::execution_prev_written_public_data_slots_tree_size, 6 },
        { C::execution_public_data_tree_root, 27 },
        { C::execution_public_data_tree_size, 5 },
        { C::execution_written_public_data_slots_tree_root, 28 },
        { C::execution_written_public_data_slots_tree_size, 6 },
        { C::execution_sel_opcode_error, 1 },
    } });

    check_relation<sstore>(trace,
                           sstore::SR_SSTORE_WRITTEN_SLOTS_ROOT_NOT_CHANGED,
                           sstore::SR_SSTORE_WRITTEN_SLOTS_SIZE_NOT_CHANGED,
                           sstore::SR_SSTORE_PUBLIC_DATA_TREE_ROOT_NOT_CHANGED,
                           sstore::SR_SSTORE_PUBLIC_DATA_TREE_SIZE_NOT_CHANGED);

    // Negative test: written slots tree root must be the same
    trace.set(C::execution_written_public_data_slots_tree_root, 0, 29);
    EXPECT_THROW_WITH_MESSAGE(check_relation<sstore>(trace, sstore::SR_SSTORE_WRITTEN_SLOTS_ROOT_NOT_CHANGED),
                              sstore::get_subrelation_label(sstore::SR_SSTORE_WRITTEN_SLOTS_ROOT_NOT_CHANGED));

    // Negative test: written slots tree size must be the same
    trace.set(C::execution_written_public_data_slots_tree_size, 0, 7);
    EXPECT_THROW_WITH_MESSAGE(check_relation<sstore>(trace, sstore::SR_SSTORE_WRITTEN_SLOTS_SIZE_NOT_CHANGED),
                              sstore::get_subrelation_label(sstore::SR_SSTORE_WRITTEN_SLOTS_SIZE_NOT_CHANGED));

    // Negative test: public data tree root must be the same
    trace.set(C::execution_public_data_tree_root, 0, 29);
    EXPECT_THROW_WITH_MESSAGE(check_relation<sstore>(trace, sstore::SR_SSTORE_PUBLIC_DATA_TREE_ROOT_NOT_CHANGED),
                              sstore::get_subrelation_label(sstore::SR_SSTORE_PUBLIC_DATA_TREE_ROOT_NOT_CHANGED));

    // Negative test: public data tree size must be the same
    trace.set(C::execution_public_data_tree_size, 0, 7);
    EXPECT_THROW_WITH_MESSAGE(check_relation<sstore>(trace, sstore::SR_SSTORE_PUBLIC_DATA_TREE_SIZE_NOT_CHANGED),
                              sstore::get_subrelation_label(sstore::SR_SSTORE_PUBLIC_DATA_TREE_SIZE_NOT_CHANGED));
}

// Test that ghost rows (sel_execute_sstore=0) cannot set sel_write_public_data=1
// This verifies the fix: sel_write_public_data * (1 - sel_execute_sstore) = 0
TEST(SStoreConstrainingTest, NegativeGhostRowStorageWrite_RelationsOnly)
{
    // Try to create a ghost row (sel_execute_sstore=0) with sel_write_public_data=1
    TestTraceContainer trace({
        {
            { C::execution_sel_execute_sstore, 0 },        // Ghost row: sstore not executing
            { C::execution_sel_write_public_data, 1 },     // Try to fire storage write anyway
            { C::execution_register_0_, /*value=*/999 },   // Arbitrary value
            { C::execution_register_1_, /*slot=*/666 },    // Arbitrary slot
            { C::execution_contract_address, 0xDEADBEEF }, // Arbitrary address
            { C::execution_sel_opcode_error, 0 },
        },
    });

    // The fix: sel_write_public_data = sel_execute_sstore * (1 - sel_opcode_error)
    // When sel_execute_sstore=0 and sel_write_public_data=1: 1 * (1-0) = 1 != 0 -> FAILS
    EXPECT_THROW_WITH_MESSAGE(check_relation<sstore>(trace),
                              sstore::get_subrelation_label(sstore::SR_SEL_WRITE_PUBLIC_DATA_IS_EXECUTE_AND_NOT_ERROR));
}

TEST(SStoreConstrainingTest, Interactions)
{
    NiceMock<MockPoseidon2> poseidon2;
    NiceMock<MockFieldGreaterThan> field_gt;
    NiceMock<MockMerkleCheck> merkle_check;
    NiceMock<MockExecutionIdManager> execution_id_manager;

    EventEmitter<IndexedTreeCheckEvent> indexed_tree_check_emitter;
    IndexedTreeCheck indexed_tree_check(
        poseidon2, merkle_check, field_gt, DOM_SEP__WRITTEN_SLOTS_MERKLE, indexed_tree_check_emitter);

    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check(indexed_tree_check,
                                                                         build_public_data_slots_tree());

    EventEmitter<PublicDataTreeCheckEvent> public_data_tree_check_event_emitter;
    PublicDataTreeCheck public_data_tree_check(
        poseidon2, merkle_check, field_gt, execution_id_manager, public_data_tree_check_event_emitter);

    FF slot = 42;
    AztecAddress contract_address = 1;
    FF leaf_slot = unconstrained_compute_leaf_slot(contract_address, slot);
    FF value = 27;

    PublicDataTreeLeafPreimage low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(leaf_slot, 1), 0, 0);
    uint64_t low_leaf_index = 30;
    std::vector<FF> low_leaf_sibling_path = { 1, 2, 3, 4, 5 };

    AppendOnlyTreeSnapshot public_data_tree_before = AppendOnlyTreeSnapshot{
        .root = 42,
        .next_available_leaf_index = 128,
    };
    AppendOnlyTreeSnapshot written_slots_tree_before = written_public_data_slots_tree_check.get_snapshot();

    EXPECT_CALL(poseidon2, hash(_)).WillRepeatedly([](const std::vector<FF>& inputs) {
        return RawPoseidon2::hash(inputs);
    });
    EXPECT_CALL(field_gt, ff_gt(_, _)).WillRepeatedly([](const FF& a, const FF& b) {
        return static_cast<uint256_t>(a) > static_cast<uint256_t>(b);
    });

    EXPECT_CALL(merkle_check, write)
        .WillRepeatedly([]([[maybe_unused]] uint64_t domain_separator,
                           [[maybe_unused]] FF current_leaf,
                           FF new_leaf,
                           uint64_t leaf_index,
                           std::span<const FF> sibling_path,
                           [[maybe_unused]] FF prev_root) {
            return unconstrained_root_from_path(DOM_SEP__WRITTEN_SLOTS_MERKLE, new_leaf, leaf_index, sibling_path);
        });

    written_public_data_slots_tree_check.contains(contract_address, slot);

    auto public_data_tree_after = public_data_tree_check.write(slot,
                                                               contract_address,
                                                               value,
                                                               low_leaf,
                                                               low_leaf_index,
                                                               low_leaf_sibling_path,
                                                               public_data_tree_before,
                                                               {},
                                                               false);
    written_public_data_slots_tree_check.insert(contract_address, slot);
    auto written_slots_tree_after = written_public_data_slots_tree_check.get_snapshot();

    TestTraceContainer trace({
        {
            { C::execution_sel_execute_sstore, 1 },
            { C::execution_contract_address, contract_address },
            { C::execution_sel_gas_sstore, 1 },
            { C::execution_written_slots_tree_height, AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_HEIGHT },
            { C::execution_written_slots_merkle_separator, DOM_SEP__WRITTEN_SLOTS_MERKLE },
            { C::execution_written_slots_tree_siloing_separator, DOM_SEP__PUBLIC_LEAF_SLOT },
            { C::execution_dynamic_da_gas_factor, 1 },
            { C::execution_register_0_, value },
            { C::execution_register_1_, slot },
            { C::execution_max_data_writes_reached, 0 },
            { C::execution_remaining_data_writes_inv,
              FF(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX + AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_INITIAL_SIZE -
                 written_slots_tree_before.next_available_leaf_index)
                  .invert() },
            { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_SSTORE },
            { C::execution_sel_write_public_data, 1 },
            { C::execution_prev_public_data_tree_root, public_data_tree_before.root },
            { C::execution_prev_public_data_tree_size, public_data_tree_before.next_available_leaf_index },
            { C::execution_public_data_tree_root, public_data_tree_after.root },
            { C::execution_public_data_tree_size, public_data_tree_after.next_available_leaf_index },
            { C::execution_prev_written_public_data_slots_tree_root, written_slots_tree_before.root },
            { C::execution_prev_written_public_data_slots_tree_size,
              written_slots_tree_before.next_available_leaf_index },
            { C::execution_written_public_data_slots_tree_root, written_slots_tree_after.root },
            { C::execution_written_public_data_slots_tree_size, written_slots_tree_after.next_available_leaf_index },
        },
    });

    PublicDataTreeTraceBuilder public_data_tree_trace_builder;
    public_data_tree_trace_builder.process(public_data_tree_check_event_emitter.dump_events(), trace);

    IndexedTreeCheckTraceBuilder written_slots_tree_trace_builder;
    written_slots_tree_trace_builder.process(indexed_tree_check_emitter.dump_events(), trace);

    check_relation<sstore>(trace);
    check_interaction<ExecutionTraceBuilder,
                      lookup_execution_check_written_storage_slot_settings,
                      lookup_sstore_record_written_storage_slot_settings>(trace);
    check_multipermutation_interaction<PublicDataTreeTraceBuilder,
                                       perm_sstore_storage_write_settings,
                                       perm_tx_balance_update_settings>(trace);
}

// Ghost row injection attack test.
// Verifies that the fix (sel_write_public_data * (1 - sel_execute_sstore) = 0) prevents
// a malicious prover from injecting arbitrary storage writes via ghost sstore rows.
//
// Attack vector (now blocked):
// 1. Create ghost sstore row (sel_execute_sstore=0, sel_write_public_data=1)
// 2. Populate public_data_check trace with legitimate rows via simulation
// 3. Align clk values so the STORAGE_WRITE permutation matches
// 4. Without the fix, the permutation would pass and arbitrary writes would be possible
TEST(SStoreConstrainingTest, NegativeFullAttackWithAllTraces)
{
    NiceMock<MockPoseidon2> poseidon2;
    NiceMock<MockFieldGreaterThan> field_gt;
    NiceMock<MockMerkleCheck> merkle_check;
    NiceMock<MockExecutionIdManager> execution_id_manager;

    EventEmitter<IndexedTreeCheckEvent> indexed_tree_check_emitter;
    IndexedTreeCheck indexed_tree_check(
        poseidon2, merkle_check, field_gt, DOM_SEP__WRITTEN_SLOTS_MERKLE, indexed_tree_check_emitter);
    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check(indexed_tree_check,
                                                                         build_public_data_slots_tree());

    EventEmitter<PublicDataTreeCheckEvent> public_data_tree_check_event_emitter;
    PublicDataTreeCheck public_data_tree_check(
        poseidon2, merkle_check, field_gt, execution_id_manager, public_data_tree_check_event_emitter);

    // Attacker-controlled values
    FF slot = 666;
    AztecAddress contract_address = 0xDEADBEEF;
    FF leaf_slot = unconstrained_compute_leaf_slot(contract_address, slot);
    FF value = 999;

    PublicDataTreeLeafPreimage low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(leaf_slot, 1), 0, 0);
    uint64_t low_leaf_index = 30;
    std::vector<FF> low_leaf_sibling_path = { 1, 2, 3, 4, 5 };

    AppendOnlyTreeSnapshot public_data_tree_before = AppendOnlyTreeSnapshot{
        .root = 42,
        .next_available_leaf_index = 128,
    };
    AppendOnlyTreeSnapshot written_slots_tree_before = written_public_data_slots_tree_check.get_snapshot();

    EXPECT_CALL(poseidon2, hash(_)).WillRepeatedly([](const std::vector<FF>& inputs) {
        return RawPoseidon2::hash(inputs);
    });
    EXPECT_CALL(field_gt, ff_gt(_, _)).WillRepeatedly([](const FF& a, const FF& b) {
        return static_cast<uint256_t>(a) > static_cast<uint256_t>(b);
    });
    EXPECT_CALL(merkle_check, write)
        .WillRepeatedly([]([[maybe_unused]] uint64_t domain_separator,
                           [[maybe_unused]] FF current_leaf,
                           FF new_leaf,
                           uint64_t leaf_index,
                           std::span<const FF> sibling_path,
                           [[maybe_unused]] FF prev_root) {
            return unconstrained_root_from_path(DOM_SEP__WRITTEN_SLOTS_MERKLE, new_leaf, leaf_index, sibling_path);
        });

    // Generate cryptographically valid events via simulation (same as legitimate operation)
    written_public_data_slots_tree_check.contains(contract_address, slot);
    auto public_data_tree_after = public_data_tree_check.write(slot,
                                                               contract_address,
                                                               value,
                                                               low_leaf,
                                                               low_leaf_index,
                                                               low_leaf_sibling_path,
                                                               public_data_tree_before,
                                                               {},
                                                               false);
    written_public_data_slots_tree_check.insert(contract_address, slot);
    auto written_slots_tree_after = written_public_data_slots_tree_check.get_snapshot();

    // Build trace with legitimate public_data_check rows
    TestTraceContainer trace;
    PublicDataTreeTraceBuilder public_data_tree_trace_builder;
    public_data_tree_trace_builder.process(public_data_tree_check_event_emitter.dump_events(), trace);

    IndexedTreeCheckTraceBuilder written_slots_tree_trace_builder;
    written_slots_tree_trace_builder.process(indexed_tree_check_emitter.dump_events(), trace);

    // Inject ghost sstore at row 0 where precomputed_idx matches public_data_check.clk.
    // The mock execution_id_manager returns 0, so public_data_check.clk=0.
    // Ghost row: sel_execute_sstore=0 but sel_write_public_data=1
    trace.set(
        0,
        std::vector<std::pair<Column, FF>>{
            { C::execution_clk, 0 },
            { C::precomputed_first_row, 1 },
            { C::execution_sel_execute_sstore, 0 },
            { C::execution_sel_write_public_data, 1 },
            { C::execution_contract_address, contract_address },
            { C::execution_register_0_, value },
            { C::execution_register_1_, slot },
            { C::execution_sel_opcode_error, 0 },
            { C::execution_discard, 0 },
            { C::execution_prev_public_data_tree_root, public_data_tree_before.root },
            { C::execution_prev_public_data_tree_size, public_data_tree_before.next_available_leaf_index },
            { C::execution_public_data_tree_root, public_data_tree_after.root },
            { C::execution_public_data_tree_size, public_data_tree_after.next_available_leaf_index },
            { C::execution_prev_written_public_data_slots_tree_root, written_slots_tree_before.root },
            { C::execution_prev_written_public_data_slots_tree_size,
              written_slots_tree_before.next_available_leaf_index },
            { C::execution_written_public_data_slots_tree_root, written_slots_tree_after.root },
            { C::execution_written_public_data_slots_tree_size, written_slots_tree_after.next_available_leaf_index },
        });

    // The fix blocks ghost rows: sel_write_public_data = sel_execute_sstore * (1 - sel_opcode_error)
    // When sel_execute_sstore=0 and sel_write_public_data=1: 1 * 1 = 1 != 0
    EXPECT_THROW_WITH_MESSAGE(check_relation<sstore>(trace),
                              sstore::get_subrelation_label(sstore::SR_SEL_WRITE_PUBLIC_DATA_IS_EXECUTE_AND_NOT_ERROR));
}

} // namespace
} // namespace bb::avm2::constraining
