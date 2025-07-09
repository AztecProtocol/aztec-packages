#include "update_check_trace.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cmath>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_update_check.hpp"
#include "barretenberg/vm2/simulation/concrete_dbs.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/public_data_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/field_gt.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation/testing/mock_dbs.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_merkle_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_note_hash_tree_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_nullifier_tree_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_written_public_data_slots_tree_check.hpp"
#include "barretenberg/vm2/simulation/update_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/public_data_tree_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"
#include "barretenberg/vm2/tracegen/update_check_trace.hpp"

namespace bb::avm2::tracegen {
namespace {

using ::testing::_;
using ::testing::NiceMock;
using ::testing::Return;
using ::testing::ReturnRef;

using simulation::compute_contract_address;
using simulation::EventEmitter;
using simulation::ExecutionIdManager;
using simulation::MerkleDB;
using simulation::MockFieldGreaterThan;
using simulation::MockLowLevelMerkleDB;
using simulation::MockMerkleCheck;
using simulation::MockNoteHashTreeCheck;
using simulation::MockNullifierTreeCheck;
using simulation::MockWrittenPublicDataSlotsTreeCheck;
using simulation::NoopEventEmitter;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::PublicDataTreeCheck;
using simulation::PublicDataTreeCheckEvent;
using simulation::PublicDataTreeLeafPreimage;
using simulation::RangeCheck;
using simulation::RangeCheckEvent;
using simulation::UpdateCheck;
using simulation::UpdateCheckEvent;

using FF = AvmFlavorSettings::FF;
using C = Column;
using poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
using PublicDataTreeLeafPreimage = IndexedLeaf<PublicDataLeafValue>;

TEST(UpdateCheckTracegenTest, HashZeroInteractions)
{
    uint64_t current_timestamp = 100;
    ContractInstance instance = testing::random_contract_instance();
    instance.current_class_id = instance.original_class_id;
    AztecAddress derived_address = compute_contract_address(instance);
    FF delayed_public_mutable_slot = poseidon2::hash({ UPDATED_CLASS_IDS_SLOT, derived_address });
    FF delayed_public_mutable_hash_slot = delayed_public_mutable_slot + UPDATES_DELAYED_PUBLIC_MUTABLE_VALUES_LEN;
    FF delayed_public_mutable_hash_leaf_slot = poseidon2::hash(
        { GENERATOR_INDEX__PUBLIC_LEAF_INDEX, DEPLOYER_CONTRACT_ADDRESS, delayed_public_mutable_hash_slot });

    TreeSnapshots trees;
    trees.publicDataTree.root = 42;

    ExecutionIdManager execution_id_manager(0);

    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    EventEmitter<RangeCheckEvent> range_check_event_emitter;
    RangeCheck range_check(range_check_event_emitter);

    NiceMock<MockFieldGreaterThan> mock_field_gt;
    NiceMock<MockMerkleCheck> mock_merkle_check;
    NiceMock<MockNullifierTreeCheck> mock_nullifier_tree_check;
    NiceMock<MockNoteHashTreeCheck> mock_note_hash_tree_check;
    NiceMock<MockWrittenPublicDataSlotsTreeCheck> mock_written_public_data_slots_tree_check;

    EventEmitter<PublicDataTreeCheckEvent> public_data_tree_check_event_emitter;
    PublicDataTreeCheck public_data_tree_check(
        poseidon2, mock_merkle_check, mock_field_gt, execution_id_manager, public_data_tree_check_event_emitter);

    NiceMock<MockLowLevelMerkleDB> mock_low_level_merkle_db;

    MerkleDB merkle_db(mock_low_level_merkle_db,
                       public_data_tree_check,
                       mock_nullifier_tree_check,
                       mock_note_hash_tree_check,
                       mock_written_public_data_slots_tree_check);

    EventEmitter<UpdateCheckEvent> update_check_event_emitter;
    UpdateCheck update_check(poseidon2, range_check, merkle_db, current_timestamp, update_check_event_emitter);

    uint32_t leaf_index = 27;
    EXPECT_CALL(mock_low_level_merkle_db, get_tree_roots()).WillRepeatedly(ReturnRef(trees));
    EXPECT_CALL(mock_low_level_merkle_db, get_sibling_path(world_state::MerkleTreeId::PUBLIC_DATA_TREE, _))
        .WillOnce(Return(fr_sibling_path{ 0 }));
    EXPECT_CALL(mock_low_level_merkle_db, get_leaf_preimage_public_data_tree(_))
        .WillOnce(Return(PublicDataTreeLeafPreimage(PublicDataLeafValue(1, 0), 0, 0)));
    EXPECT_CALL(
        mock_low_level_merkle_db,
        get_low_indexed_leaf(world_state::MerkleTreeId::PUBLIC_DATA_TREE, delayed_public_mutable_hash_leaf_slot))
        .WillOnce(Return(GetLowIndexedLeafResponse(false, leaf_index)));

    EXPECT_CALL(mock_field_gt, ff_gt(_, _)).WillRepeatedly(Return(true));

    update_check.check_current_class_id(derived_address, instance);

    Poseidon2TraceBuilder poseidon2_builder;
    RangeCheckTraceBuilder range_check_builder;
    PublicDataTreeTraceBuilder public_data_check_builder;
    UpdateCheckTraceBuilder update_check_builder;

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    range_check_builder.process(range_check_event_emitter.dump_events(), trace);
    public_data_check_builder.process(public_data_tree_check_event_emitter.dump_events(), trace);
    update_check_builder.process(update_check_event_emitter.dump_events(), trace);

    constraining::check_interaction<UpdateCheckTraceBuilder,
                                    lookup_update_check_update_hash_poseidon2_settings,
                                    lookup_update_check_delayed_public_mutable_slot_poseidon2_settings,
                                    lookup_update_check_update_hash_public_data_read_settings,
                                    lookup_update_check_update_hi_metadata_range_settings,
                                    lookup_update_check_update_lo_metadata_range_settings,
                                    lookup_update_check_timestamp_of_change_cmp_range_settings>(trace);
}

TEST(UpdateCheckTracegenTest, HashNonzeroInteractions)
{
    uint64_t current_timestamp = 100;
    FF update_pre_class = 1;
    FF update_post_class = 2;
    uint64_t update_timestamp_of_change = current_timestamp - 1;

    ContractInstance instance = testing::random_contract_instance();
    instance.current_class_id = update_post_class;
    AztecAddress derived_address = compute_contract_address(instance);
    FF delayed_public_mutable_slot = poseidon2::hash({ UPDATED_CLASS_IDS_SLOT, derived_address });

    TreeSnapshots trees;
    trees.publicDataTree.root = 42;

    ExecutionIdManager execution_id_manager(0);

    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    EventEmitter<RangeCheckEvent> range_check_event_emitter;
    RangeCheck range_check(range_check_event_emitter);

    NiceMock<MockFieldGreaterThan> mock_field_gt;
    NiceMock<MockMerkleCheck> mock_merkle_check;
    NiceMock<MockNullifierTreeCheck> mock_nullifier_tree_check;
    NiceMock<MockNoteHashTreeCheck> mock_note_hash_tree_check;
    NiceMock<MockWrittenPublicDataSlotsTreeCheck> mock_written_public_data_slots_tree_check;

    EventEmitter<PublicDataTreeCheckEvent> public_data_tree_check_event_emitter;
    PublicDataTreeCheck public_data_tree_check(
        poseidon2, mock_merkle_check, mock_field_gt, execution_id_manager, public_data_tree_check_event_emitter);

    NiceMock<MockLowLevelMerkleDB> mock_low_level_merkle_db;

    MerkleDB merkle_db(mock_low_level_merkle_db,
                       public_data_tree_check,
                       mock_nullifier_tree_check,
                       mock_note_hash_tree_check,
                       mock_written_public_data_slots_tree_check);

    EventEmitter<UpdateCheckEvent> update_check_event_emitter;
    UpdateCheck update_check(poseidon2, range_check, merkle_db, current_timestamp, update_check_event_emitter);

    FF update_metadata = FF(static_cast<uint64_t>(123) << 32) + update_timestamp_of_change;

    std::vector<FF> update_leaf_values = { update_metadata, update_pre_class, update_post_class };
    FF update_hash = poseidon2::hash(update_leaf_values);
    update_leaf_values.push_back(update_hash);
    std::vector<FF> update_leaf_slots;
    for (size_t i = 0; i < update_leaf_values.size(); ++i) {
        FF leaf_slot = poseidon2::hash(
            { GENERATOR_INDEX__PUBLIC_LEAF_INDEX, DEPLOYER_CONTRACT_ADDRESS, delayed_public_mutable_slot + i });
        update_leaf_slots.push_back(leaf_slot);
    }

    EXPECT_CALL(mock_low_level_merkle_db, get_tree_roots()).WillRepeatedly(ReturnRef(trees));
    EXPECT_CALL(mock_low_level_merkle_db, get_sibling_path(world_state::MerkleTreeId::PUBLIC_DATA_TREE, _))
        .WillOnce(Return(fr_sibling_path{ 0 }));
    EXPECT_CALL(mock_low_level_merkle_db, get_leaf_preimage_public_data_tree(_))
        .WillRepeatedly([&](const uint64_t& index) {
            return PublicDataTreeLeafPreimage(
                PublicDataLeafValue(update_leaf_slots[index], update_leaf_values[index]), 0, 0);
        });

    EXPECT_CALL(mock_low_level_merkle_db, get_low_indexed_leaf(world_state::MerkleTreeId::PUBLIC_DATA_TREE, _))
        .WillRepeatedly([&](world_state::MerkleTreeId, const FF& leaf_slot) {
            for (size_t i = 0; i < update_leaf_slots.size(); ++i) {
                if (leaf_slot == update_leaf_slots[i]) {
                    return GetLowIndexedLeafResponse(true, static_cast<uint64_t>(i));
                }
            }
            throw std::runtime_error("Leaf not found");
        });

    EXPECT_CALL(mock_field_gt, ff_gt(_, _)).WillRepeatedly(Return(true));

    update_check.check_current_class_id(derived_address, instance);

    Poseidon2TraceBuilder poseidon2_builder;
    RangeCheckTraceBuilder range_check_builder;
    PublicDataTreeTraceBuilder public_data_check_builder;
    UpdateCheckTraceBuilder update_check_builder;

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    range_check_builder.process(range_check_event_emitter.dump_events(), trace);
    public_data_check_builder.process(public_data_tree_check_event_emitter.dump_events(), trace);
    update_check_builder.process(update_check_event_emitter.dump_events(), trace);

    constraining::check_interaction<UpdateCheckTraceBuilder,
                                    lookup_update_check_update_hash_poseidon2_settings,
                                    lookup_update_check_delayed_public_mutable_slot_poseidon2_settings,
                                    lookup_update_check_update_hash_public_data_read_settings,
                                    lookup_update_check_update_hi_metadata_range_settings,
                                    lookup_update_check_update_lo_metadata_range_settings,
                                    lookup_update_check_timestamp_of_change_cmp_range_settings>(trace);
}

} // namespace
} // namespace bb::avm2::tracegen
