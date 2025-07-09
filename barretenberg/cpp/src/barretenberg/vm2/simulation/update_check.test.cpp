#include "barretenberg/vm2/simulation/update_check.hpp"

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/update_check.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation/testing/mock_dbs.hpp"
#include "barretenberg/vm2/simulation/testing/mock_merkle_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_poseidon2.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

using poseidon2 = bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>;

namespace bb::avm2::simulation {

using ::testing::_;
using ::testing::ElementsAre;
using ::testing::NiceMock;
using ::testing::Return;
using ::testing::ReturnRef;
using ::testing::SizeIs;
using ::testing::StrictMock;
using ::testing::TestWithParam;

using PublicDataTreeLeafPreimage = IndexedLeaf<PublicDataLeafValue>;

namespace {

TEST(AvmSimulationUpdateCheck, NeverWritten)
{
    uint64_t current_timestamp = 100;
    ContractInstance instance = testing::random_contract_instance();
    instance.current_class_id = instance.original_class_id;
    AztecAddress derived_address = compute_contract_address(instance);
    FF delayed_public_mutable_slot = poseidon2::hash({ UPDATED_CLASS_IDS_SLOT, derived_address });
    FF delayed_public_mutable_hash_slot = delayed_public_mutable_slot + UPDATES_DELAYED_PUBLIC_MUTABLE_VALUES_LEN;

    TreeStates tree_states = {};
    tree_states.publicDataTree.tree.root = 42;

    NiceMock<MockPoseidon2> poseidon2;
    NiceMock<MockHighLevelMerkleDB> merkle_db;
    StrictMock<MockLowLevelMerkleDB> low_level_merkle_db;
    StrictMock<MockRangeCheck> range_check;

    EventEmitter<UpdateCheckEvent> event_emitter;
    UpdateCheck update_check(poseidon2, range_check, merkle_db, current_timestamp, event_emitter);

    EXPECT_CALL(merkle_db, storage_read(AztecAddress(DEPLOYER_CONTRACT_ADDRESS), delayed_public_mutable_hash_slot))
        .WillRepeatedly(Return(FF(0)));
    EXPECT_CALL(merkle_db, get_tree_state()).WillRepeatedly(Return(tree_states));
    EXPECT_CALL(poseidon2, hash(_)).WillRepeatedly([](const std::vector<FF>& input) { return poseidon2::hash(input); });

    update_check.check_current_class_id(derived_address, instance);

    EXPECT_THAT(event_emitter.dump_events(),
                ElementsAre(UpdateCheckEvent{
                    .address = derived_address,
                    .current_class_id = instance.current_class_id,
                    .original_class_id = instance.original_class_id,
                    .public_data_tree_root = tree_states.publicDataTree.tree.root,
                    .current_timestamp = current_timestamp,
                    .update_hash = 0,
                    .update_preimage_metadata = 0,
                    .update_preimage_pre_class_id = 0,
                    .update_preimage_post_class_id = 0,
                    .delayed_public_mutable_slot = delayed_public_mutable_slot,
                }));

    // Negative: class id must be original class id
    instance.current_class_id = instance.current_class_id + 1;
    EXPECT_THROW_WITH_MESSAGE(update_check.check_current_class_id(derived_address, instance),
                              "Current class id.*does not match expected class id.*");
}

struct TestParams {
    FF original_class_id;
    FF current_class_id;
    FF update_pre_class;
    FF update_post_class;
    FF update_timestamp_of_change;
    bool should_throw;
};

std::vector<TestParams> hash_nonzero_tests = {
    TestParams{ // Hash is not zero, but scheduled value change is zeroed out
                // Only delay has been touched
                .original_class_id = 27,
                .current_class_id = 27,
                .should_throw = false },
    TestParams{ // Hash is not zero, but scheduled value change is zeroed out
                // Only delay has been touched
                .original_class_id = 27,
                .current_class_id = 28,
                .should_throw = true },
    TestParams{ .original_class_id = 27,
                .current_class_id = 2,
                .update_pre_class = 2,             // From 2
                .update_post_class = 3,            // To 3
                .update_timestamp_of_change = 101, // At timestamp after current
                .should_throw = false },
    TestParams{ .original_class_id = 27,
                .current_class_id = 2,
                .update_pre_class = 2,            // From 2
                .update_post_class = 3,           // To 3
                .update_timestamp_of_change = 99, // At timestamp before current
                .should_throw = true },
    TestParams{ .original_class_id = 27,
                .current_class_id = 3,
                .update_pre_class = 2,            // From 2
                .update_post_class = 3,           // To 3
                .update_timestamp_of_change = 99, // At timestamp before current
                .should_throw = false },
    TestParams{ .original_class_id = 27,
                .current_class_id = 3,
                .update_pre_class = 2,             // From 2
                .update_post_class = 3,            // To 3
                .update_timestamp_of_change = 101, // At timestamp after current
                .should_throw = true },
    TestParams{ .original_class_id = 27,
                .current_class_id = 3,
                .update_pre_class = 2,             // From 2
                .update_post_class = 3,            // To 3
                .update_timestamp_of_change = 100, // At current (past) timestamp
                .should_throw = false },
    TestParams{ .original_class_id = 27,
                .current_class_id = 2,
                .update_pre_class = 2,             // From 2
                .update_post_class = 3,            // To 3
                .update_timestamp_of_change = 100, // At current (past) timestamp
                .should_throw = true },
    TestParams{ .original_class_id = 1,
                .current_class_id = 1,
                .update_pre_class = 0,             // From original
                .update_post_class = 3,            // To 3
                .update_timestamp_of_change = 101, // At timestamp after current
                .should_throw = false },
    TestParams{ .original_class_id = 1,
                .current_class_id = 3,
                .update_pre_class = 0,             // From original
                .update_post_class = 3,            // To 3
                .update_timestamp_of_change = 101, // At timestamp after current
                .should_throw = true },
};

class UpdateCheckHashNonzeroTest : public TestWithParam<TestParams> {};

TEST_P(UpdateCheckHashNonzeroTest, WithHash)
{
    const auto& param = GetParam();

    uint64_t current_timestamp = 100;
    ContractInstance instance = testing::random_contract_instance();
    instance.current_class_id = param.current_class_id;
    instance.original_class_id = param.original_class_id;

    AztecAddress derived_address = compute_contract_address(instance);
    FF delayed_public_mutable_slot = poseidon2::hash({ UPDATED_CLASS_IDS_SLOT, derived_address });
    FF delayed_public_mutable_hash_slot = delayed_public_mutable_slot + UPDATES_DELAYED_PUBLIC_MUTABLE_VALUES_LEN;
    FF delayed_public_mutable_leaf_slot = poseidon2::hash(
        { GENERATOR_INDEX__PUBLIC_LEAF_INDEX, DEPLOYER_CONTRACT_ADDRESS, delayed_public_mutable_hash_slot });

    FF update_metadata = FF(static_cast<uint64_t>(123) << 32) + param.update_timestamp_of_change;
    std::vector<FF> update_preimage = { update_metadata, param.update_pre_class, param.update_post_class };
    std::vector<FF> update_preimage_slots;

    for (size_t i = 0; i < update_preimage.size(); ++i) {
        FF leaf_slot = poseidon2::hash(
            { GENERATOR_INDEX__PUBLIC_LEAF_INDEX, DEPLOYER_CONTRACT_ADDRESS, delayed_public_mutable_slot + i });
        update_preimage_slots.push_back(leaf_slot);
    }

    FF update_hash = poseidon2::hash(update_preimage);

    TreeStates tree_states = {};
    tree_states.publicDataTree.tree.root = 42;

    NiceMock<MockPoseidon2> poseidon2;
    NiceMock<MockHighLevelMerkleDB> merkle_db;
    NiceMock<MockLowLevelMerkleDB> mock_low_level_merkle_db;
    NiceMock<MockRangeCheck> range_check;

    EventEmitter<UpdateCheckEvent> event_emitter;
    UpdateCheck update_check(poseidon2, range_check, merkle_db, current_timestamp, event_emitter);

    EXPECT_CALL(merkle_db, storage_read(AztecAddress(DEPLOYER_CONTRACT_ADDRESS), delayed_public_mutable_hash_slot))
        .WillRepeatedly(Return(update_hash));
    EXPECT_CALL(merkle_db, get_tree_state()).WillRepeatedly(Return(tree_states));
    EXPECT_CALL(merkle_db, as_unconstrained()).WillRepeatedly(ReturnRef(mock_low_level_merkle_db));

    EXPECT_CALL(mock_low_level_merkle_db, get_low_indexed_leaf(world_state::MerkleTreeId::PUBLIC_DATA_TREE, _))
        .WillRepeatedly([&](world_state::MerkleTreeId, const FF& leaf_slot) {
            for (size_t i = 0; i < update_preimage_slots.size(); ++i) {
                if (leaf_slot == update_preimage_slots[i]) {
                    return GetLowIndexedLeafResponse(true, static_cast<uint64_t>(i));
                }
            }
            throw std::runtime_error("Leaf not found");
        });

    EXPECT_CALL(mock_low_level_merkle_db, get_leaf_preimage_public_data_tree(_))
        .WillRepeatedly([&](const uint64_t& index) {
            return PublicDataTreeLeafPreimage(
                PublicDataLeafValue(FF(index) + delayed_public_mutable_leaf_slot, update_preimage[index]), 0, 0);
        });

    EXPECT_CALL(poseidon2, hash(_)).WillRepeatedly([](const std::vector<FF>& input) { return poseidon2::hash(input); });

    EXPECT_CALL(range_check, assert_range(_, _)).WillRepeatedly([](const uint128_t& value, const uint8_t& range) {
        if (range > 128) {
            throw std::runtime_error("Range checks aren't supported for bit-sizes > 128");
        }
        if (range == 128) {
            return;
        }
        if (value > (static_cast<uint128_t>(1) << range)) {
            throw std::runtime_error("Value is out of range");
        }
    });

    if (param.should_throw) {
        EXPECT_THROW_WITH_MESSAGE(update_check.check_current_class_id(derived_address, instance),
                                  "Current class id.*does not match expected class id.*");
        EXPECT_THAT(event_emitter.dump_events(), SizeIs(0));
    } else {
        update_check.check_current_class_id(derived_address, instance);
        EXPECT_THAT(event_emitter.dump_events(),
                    ElementsAre(UpdateCheckEvent{
                        .address = derived_address,
                        .current_class_id = instance.current_class_id,
                        .original_class_id = instance.original_class_id,
                        .public_data_tree_root = tree_states.publicDataTree.tree.root,
                        .current_timestamp = current_timestamp,
                        .update_hash = update_hash,
                        .update_preimage_metadata = update_metadata,
                        .update_preimage_pre_class_id = param.update_pre_class,
                        .update_preimage_post_class_id = param.update_post_class,
                        .delayed_public_mutable_slot = delayed_public_mutable_slot,
                    }));
    }
}

INSTANTIATE_TEST_SUITE_P(AvmSimulationUpdateCheck, UpdateCheckHashNonzeroTest, ::testing::ValuesIn(hash_nonzero_tests));

TEST(AvmSimulationUpdateCheck, HashMismatch)
{
    uint64_t current_timestamp = 100;
    ContractInstance instance = testing::random_contract_instance();
    instance.current_class_id = instance.original_class_id;
    AztecAddress derived_address = compute_contract_address(instance);
    FF delayed_public_mutable_slot = poseidon2::hash({ UPDATED_CLASS_IDS_SLOT, derived_address });
    FF delayed_public_mutable_hash_slot = delayed_public_mutable_slot + UPDATES_DELAYED_PUBLIC_MUTABLE_VALUES_LEN;
    FF delayed_public_mutable_leaf_slot = poseidon2::hash(
        { GENERATOR_INDEX__PUBLIC_LEAF_INDEX, DEPLOYER_CONTRACT_ADDRESS, delayed_public_mutable_hash_slot });

    TreeSnapshots trees = {};

    NiceMock<MockPoseidon2> poseidon2;
    NiceMock<MockHighLevelMerkleDB> merkle_db;
    NiceMock<MockLowLevelMerkleDB> mock_low_level_merkle_db;
    StrictMock<MockRangeCheck> range_check;

    EventEmitter<UpdateCheckEvent> event_emitter;
    UpdateCheck update_check(poseidon2, range_check, merkle_db, current_timestamp, event_emitter);

    EXPECT_CALL(merkle_db, storage_read(AztecAddress(DEPLOYER_CONTRACT_ADDRESS), delayed_public_mutable_hash_slot))
        .WillRepeatedly(Return(FF(27)));
    EXPECT_CALL(mock_low_level_merkle_db, get_tree_roots()).WillRepeatedly(ReturnRef(trees));
    EXPECT_CALL(merkle_db, as_unconstrained()).WillRepeatedly(ReturnRef(mock_low_level_merkle_db));

    EXPECT_CALL(mock_low_level_merkle_db, get_low_indexed_leaf(world_state::MerkleTreeId::PUBLIC_DATA_TREE, _))
        .WillRepeatedly([&](world_state::MerkleTreeId, const FF& leaf_slot) {
            return GetLowIndexedLeafResponse(true, static_cast<uint64_t>(leaf_slot - delayed_public_mutable_leaf_slot));
        });

    EXPECT_CALL(mock_low_level_merkle_db, get_leaf_preimage_public_data_tree(_))
        .WillRepeatedly([&](const uint64_t& index) {
            return PublicDataTreeLeafPreimage(
                PublicDataLeafValue(FF(index) + delayed_public_mutable_leaf_slot, 0), 0, 0);
        });

    EXPECT_CALL(poseidon2, hash(_)).WillRepeatedly([](const std::vector<FF>& input) { return poseidon2::hash(input); });

    EXPECT_THROW_WITH_MESSAGE(update_check.check_current_class_id(derived_address, instance),
                              "Stored hash does not match preimage hash");
    EXPECT_THAT(event_emitter.dump_events(), SizeIs(0));
}

} // namespace

} // namespace bb::avm2::simulation
