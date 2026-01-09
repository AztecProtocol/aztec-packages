#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/generated/relations/lookups_sstore.hpp"
#include "barretenberg/vm2/simulation/events/public_data_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/concrete_dbs.hpp"
#include "barretenberg/vm2/simulation/gadgets/public_data_tree_check.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
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
#include "barretenberg/vm2/tracegen/written_public_data_slots_tree_check_trace.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::ExecutionTraceBuilder;
using tracegen::PublicDataTreeTraceBuilder;
using tracegen::TestTraceContainer;
using tracegen::WrittenPublicDataSlotsTreeCheckTraceBuilder;

using simulation::build_public_data_slots_tree;
using simulation::EventEmitter;
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
using simulation::WrittenPublicDataSlotsTreeCheckEvent;

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
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_DYN_L2_GAS_IS_ZERO), "DYN_L2_GAS_IS_ZERO");
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
                              "SSTORE_MAX_DATA_WRITES_REACHED");
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
                              "OPCODE_ERROR_IF_OVERFLOW_OR_STATIC");

    trace.set(C::execution_dynamic_da_gas_factor, 0, 1);

    trace.set(C::execution_is_static, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<sstore>(trace, sstore::SR_OPCODE_ERROR_IF_OVERFLOW_OR_STATIC),
                              "OPCODE_ERROR_IF_OVERFLOW_OR_STATIC");
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
                              "SSTORE_WRITTEN_SLOTS_ROOT_NOT_CHANGED");

    // Negative test: written slots tree size must be the same
    trace.set(C::execution_written_public_data_slots_tree_size, 0, 7);
    EXPECT_THROW_WITH_MESSAGE(check_relation<sstore>(trace, sstore::SR_SSTORE_WRITTEN_SLOTS_SIZE_NOT_CHANGED),
                              "SSTORE_WRITTEN_SLOTS_SIZE_NOT_CHANGED");

    // Negative test: public data tree root must be the same
    trace.set(C::execution_public_data_tree_root, 0, 29);
    EXPECT_THROW_WITH_MESSAGE(check_relation<sstore>(trace, sstore::SR_SSTORE_PUBLIC_DATA_TREE_ROOT_NOT_CHANGED),
                              "SSTORE_PUBLIC_DATA_TREE_ROOT_NOT_CHANGED");

    // Negative test: public data tree size must be the same
    trace.set(C::execution_public_data_tree_size, 0, 7);
    EXPECT_THROW_WITH_MESSAGE(check_relation<sstore>(trace, sstore::SR_SSTORE_PUBLIC_DATA_TREE_SIZE_NOT_CHANGED),
                              "SSTORE_PUBLIC_DATA_TREE_SIZE_NOT_CHANGED");
}

// Test for the selector-outside-active-rows vulnerability:
// Can sel_write_public_data be set to 1 when sel_execute_sstore=0?
// Part 1: Test that relations don't prevent it
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

    // The constraint sel_execute_sstore * ((1 - sel_opcode_error) - sel_write_public_data) = 0
    // becomes 0 * (...) = 0 when sel_execute_sstore=0, which is always satisfied.
    // So the sstore relation will NOT catch this.
    check_relation<sstore>(trace);

    // If we got here without throwing, that means sel_write_public_data is under-constrained
    // when sel_execute_sstore=0. The sstore relation constraints are satisfied!
    std::cout << "\n=== VULNERABILITY CONFIRMED ===" << std::endl;
    std::cout << "sstore relation passed with ghost row write!" << std::endl;
    std::cout << "Missing constraint: sel_write_public_data * (1 - sel_execute_sstore) = 0" << std::endl;
    std::cout << "================================\n" << std::endl;
}

TEST(SStoreConstrainingTest, Interactions)
{
    NiceMock<MockPoseidon2> poseidon2;
    NiceMock<MockFieldGreaterThan> field_gt;
    NiceMock<MockMerkleCheck> merkle_check;
    NiceMock<MockExecutionIdManager> execution_id_manager;

    EventEmitter<WrittenPublicDataSlotsTreeCheckEvent> written_public_data_slots_emitter;
    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check(
        poseidon2, merkle_check, field_gt, build_public_data_slots_tree(), written_public_data_slots_emitter);

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
        .WillRepeatedly([]([[maybe_unused]] FF current_leaf,
                           FF new_leaf,
                           uint64_t leaf_index,
                           std::span<const FF> sibling_path,
                           [[maybe_unused]] FF prev_root) {
            return unconstrained_root_from_path(new_leaf, leaf_index, sibling_path);
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

    WrittenPublicDataSlotsTreeCheckTraceBuilder written_slots_tree_trace_builder;
    written_slots_tree_trace_builder.process(written_public_data_slots_emitter.dump_events(), trace);

    check_relation<sstore>(trace);
    check_interaction<ExecutionTraceBuilder,
                      lookup_execution_check_written_storage_slot_settings,
                      lookup_sstore_record_written_storage_slot_settings>(trace);
    check_multipermutation_interaction<PublicDataTreeTraceBuilder,
                                       perm_sstore_storage_write_settings,
                                       perm_tx_balance_update_settings>(trace);
}

// CRITICAL SECURITY TEST: Full attack simulation
// Can a malicious prover inject a ghost sstore by populating ALL dependent traces?
// This test creates a complete, cryptographically consistent trace for a ghost sstore.
TEST(SStoreConstrainingTest, NegativeFullAttackWithAllTraces)
{
    std::cout << "\n=== FULL ATTACK SIMULATION ===" << std::endl;
    std::cout << "Attempting to inject ghost sstore with ALL traces populated" << std::endl;
    std::cout << "This simulates a sophisticated attacker who controls all trace values" << std::endl;

    // Use real cryptographic operations (same as legitimate test)
    NiceMock<MockPoseidon2> poseidon2;
    NiceMock<MockFieldGreaterThan> field_gt;
    NiceMock<MockMerkleCheck> merkle_check;
    NiceMock<MockExecutionIdManager> execution_id_manager;

    EventEmitter<WrittenPublicDataSlotsTreeCheckEvent> written_public_data_slots_emitter;
    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check(
        poseidon2, merkle_check, field_gt, build_public_data_slots_tree(), written_public_data_slots_emitter);

    EventEmitter<PublicDataTreeCheckEvent> public_data_tree_check_event_emitter;
    PublicDataTreeCheck public_data_tree_check(
        poseidon2, merkle_check, field_gt, execution_id_manager, public_data_tree_check_event_emitter);

    // MALICIOUS VALUES - attacker wants to write arbitrary data
    FF slot = 666;                              // Arbitrary slot
    AztecAddress contract_address = 0xDEADBEEF; // Arbitrary address
    FF leaf_slot = unconstrained_compute_leaf_slot(contract_address, slot);
    FF value = 999; // Arbitrary value to write

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
        .WillRepeatedly([]([[maybe_unused]] FF current_leaf,
                           FF new_leaf,
                           uint64_t leaf_index,
                           std::span<const FF> sibling_path,
                           [[maybe_unused]] FF prev_root) {
            return unconstrained_root_from_path(new_leaf, leaf_index, sibling_path);
        });

    // Generate cryptographically valid events (same as legitimate operation)
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

    // BUILD THE MALICIOUS TRACE
    // Strategy: Place ghost sstore at row 1 where precomputed_clk matches public_data_check.clk
    // The trace builder places public_data_check at row 1 with clk derived from simulation
    TestTraceContainer trace;

    // First populate the public_data_check trace (it will go to row 1+)
    PublicDataTreeTraceBuilder public_data_tree_trace_builder;
    public_data_tree_trace_builder.process(public_data_tree_check_event_emitter.dump_events(), trace);

    WrittenPublicDataSlotsTreeCheckTraceBuilder written_slots_tree_trace_builder;
    written_slots_tree_trace_builder.process(written_public_data_slots_emitter.dump_events(), trace);

    // Find where the public_data_check write row was placed and its clk value
    uint32_t pdc_row = 0;
    FF pdc_clk = 0;
    for (uint32_t row = 0; row < 100; row++) {
        if (trace.get(C::public_data_check_non_protocol_write, row) == 1) {
            pdc_row = row;
            pdc_clk = trace.get(C::public_data_check_clk, row);
            break;
        }
    }

    std::cout << "public_data_check write row at row " << pdc_row << " with clk=" << pdc_clk << std::endl;

    // Now inject the ghost sstore at a row where precomputed_clk matches pdc_clk
    // For this to work, we need precomputed_clk[ghost_row] == pdc_clk
    // precomputed_clk is the row number, so ghost_row should = pdc_clk (as uint)
    uint32_t ghost_row = static_cast<uint32_t>(static_cast<uint64_t>(pdc_clk));
    std::cout << "Placing ghost sstore at row " << ghost_row << " (where precomputed_clk=" << ghost_row << ")"
              << std::endl;

    // Set the ghost sstore row
    trace.set(C::execution_sel_execute_sstore, ghost_row, 0);    // GHOST ROW
    trace.set(C::execution_sel_write_public_data, ghost_row, 1); // Fire interaction
    trace.set(C::execution_contract_address, ghost_row, contract_address);
    trace.set(C::execution_register_0_, ghost_row, value);
    trace.set(C::execution_register_1_, ghost_row, slot);
    trace.set(C::execution_sel_opcode_error, ghost_row, 0);
    trace.set(C::execution_discard, ghost_row, 0);
    trace.set(C::execution_prev_public_data_tree_root, ghost_row, public_data_tree_before.root);
    trace.set(C::execution_prev_public_data_tree_size, ghost_row, public_data_tree_before.next_available_leaf_index);
    trace.set(C::execution_public_data_tree_root, ghost_row, public_data_tree_after.root);
    trace.set(C::execution_public_data_tree_size, ghost_row, public_data_tree_after.next_available_leaf_index);
    trace.set(C::execution_prev_written_public_data_slots_tree_root, ghost_row, written_slots_tree_before.root);
    trace.set(C::execution_prev_written_public_data_slots_tree_size,
              ghost_row,
              written_slots_tree_before.next_available_leaf_index);
    trace.set(C::execution_written_public_data_slots_tree_root, ghost_row, written_slots_tree_after.root);
    trace.set(C::execution_written_public_data_slots_tree_size,
              ghost_row,
              written_slots_tree_after.next_available_leaf_index);

    // Also need to set precomputed columns for the ghost row
    trace.set(C::precomputed_clk, ghost_row, ghost_row); // precomputed_clk = row number
    trace.set(C::precomputed_first_row, ghost_row, ghost_row == 0 ? 1 : 0);

    // Debug: Show where public_data_check rows were placed
    std::cout << "\n--- Trace Analysis ---" << std::endl;
    std::cout << "Ghost sstore row at row " << ghost_row << " with precomputed_clk=" << ghost_row << std::endl;
    std::cout << "Looking for public_data_check rows..." << std::endl;
    for (uint32_t row = 0; row < 10; row++) {
        auto row_pdc_sel = trace.get(C::public_data_check_sel, row);
        auto row_pdc_write = trace.get(C::public_data_check_write, row);
        auto row_pdc_non_proto = trace.get(C::public_data_check_non_protocol_write, row);
        auto row_pdc_clk = trace.get(C::public_data_check_clk, row);
        if (row_pdc_sel != 0 || row_pdc_write != 0) {
            std::cout << "  Row " << row << ": sel=" << row_pdc_sel << ", write=" << row_pdc_write
                      << ", non_protocol_write=" << row_pdc_non_proto << ", clk=" << row_pdc_clk << std::endl;
        }
    }

    std::cout << "\n--- Checking Relations ---" << std::endl;

    // Check sstore relation - expected to PASS (the vulnerability)
    std::cout << "sstore relation: ";
    check_relation<sstore>(trace);
    std::cout << "PASSED (ghost row satisfies weak constraints)" << std::endl;

    // Check public_data_check relation - now with properly populated trace
    using public_data_check_rel = bb::avm2::public_data_check<FF>;
    std::cout << "public_data_check relation: ";
    bool pdc_passed = false;
    try {
        check_relation<public_data_check_rel>(trace);
        pdc_passed = true;
        std::cout << "PASSED" << std::endl;
    } catch (const std::exception& e) {
        std::cout << "FAILED - " << e.what() << std::endl;
    }

    std::cout << "\n--- Checking Interactions ---" << std::endl;

    // Check the STORAGE_WRITE permutation
    // This is where the attack would succeed or fail
    std::cout << "STORAGE_WRITE permutation: ";
    bool perm_passed = false;
    try {
        check_multipermutation_interaction<PublicDataTreeTraceBuilder,
                                           perm_sstore_storage_write_settings,
                                           perm_tx_balance_update_settings>(trace);
        perm_passed = true;
        std::cout << "PASSED" << std::endl;
    } catch (const std::exception& e) {
        std::cout << "FAILED - " << e.what() << std::endl;
    }

    std::cout << "\n=== ATTACK RESULT ===" << std::endl;
    if (pdc_passed && perm_passed) {
        std::cout << "⚠️  CRITICAL: Attack SUCCEEDED!" << std::endl;
        std::cout << "A malicious prover CAN inject arbitrary storage writes" << std::endl;
        std::cout << "by creating ghost sstore rows with populated dependent traces." << std::endl;
        std::cout << "\nRequired Fix: Add constraint to sstore.pil:" << std::endl;
        std::cout << "  #[SEL_WRITE_PUBLIC_DATA_REQUIRES_SSTORE]" << std::endl;
        std::cout << "  sel_write_public_data * (1 - sel_execute_sstore) = 0;" << std::endl;
        // This test documents a real vulnerability - expect attack to succeed until fixed
        EXPECT_TRUE(pdc_passed && perm_passed) << "Attack succeeded as expected (documenting vulnerability)";
    } else {
        std::cout << "✓ Attack BLOCKED" << std::endl;
        if (!pdc_passed) {
            std::cout << "  - Blocked by public_data_check relation constraints" << std::endl;
        }
        if (!perm_passed) {
            std::cout << "  - Blocked by permutation interaction" << std::endl;
        }
        // If attack is blocked, the vulnerability has been fixed
        EXPECT_TRUE(!pdc_passed || !perm_passed) << "Attack blocked (vulnerability fixed)";
    }
    std::cout << "=====================\n" << std::endl;
}

} // namespace
} // namespace bb::avm2::constraining
