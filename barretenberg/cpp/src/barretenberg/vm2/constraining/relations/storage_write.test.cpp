#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/generated/relations/lookups_sstore.hpp"
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
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution>(trace, execution::SR_SSTORE_DYN_L2_GAS_IS_ZERO),
                              "SSTORE_DYN_L2_GAS_IS_ZERO");
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

TEST(SStoreConstrainingTest, ErrorTooManyWrites)
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
            { C::execution_max_data_writes_reached, 1 },
            { C::execution_sel_opcode_error, 0 },
        },
    });
    check_relation<sstore>(trace, sstore::SR_SSTORE_ERROR_TOO_MANY_WRITES);

    trace.set(C::execution_dynamic_da_gas_factor, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<sstore>(trace, sstore::SR_SSTORE_ERROR_TOO_MANY_WRITES),
                              "SSTORE_ERROR_TOO_MANY_WRITES");
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
        .nextAvailableLeafIndex = 128,
    };
    AppendOnlyTreeSnapshot written_slots_tree_before = written_public_data_slots_tree_check.snapshot();

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
    auto written_slots_tree_after = written_public_data_slots_tree_check.snapshot();

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
                 written_slots_tree_before.nextAvailableLeafIndex)
                  .invert() },
            { C::execution_subtrace_operation_id, AVM_EXEC_OP_ID_SSTORE },
            { C::execution_sel_write_public_data, 1 },
            { C::execution_prev_public_data_tree_root, public_data_tree_before.root },
            { C::execution_prev_public_data_tree_size, public_data_tree_before.nextAvailableLeafIndex },
            { C::execution_public_data_tree_root, public_data_tree_after.root },
            { C::execution_public_data_tree_size, public_data_tree_after.nextAvailableLeafIndex },
            { C::execution_prev_written_public_data_slots_tree_root, written_slots_tree_before.root },
            { C::execution_prev_written_public_data_slots_tree_size, written_slots_tree_before.nextAvailableLeafIndex },
            { C::execution_written_public_data_slots_tree_root, written_slots_tree_after.root },
            { C::execution_written_public_data_slots_tree_size, written_slots_tree_after.nextAvailableLeafIndex },
        },
    });

    PublicDataTreeTraceBuilder public_data_tree_trace_builder;
    public_data_tree_trace_builder.process(public_data_tree_check_event_emitter.dump_events(), trace);

    WrittenPublicDataSlotsTreeCheckTraceBuilder written_slots_tree_trace_builder;
    written_slots_tree_trace_builder.process(written_public_data_slots_emitter.dump_events(), trace);

    check_relation<sstore>(trace);
    check_interaction<ExecutionTraceBuilder,
                      lookup_execution_check_written_storage_slot_settings,
                      lookup_sstore_record_written_storage_slot_settings,
                      lookup_sstore_storage_write_settings>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
