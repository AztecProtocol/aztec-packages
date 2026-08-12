#include "barretenberg/vm2/simulation/gadgets/indexed_tree_check.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/crypto/merkle_tree/memory_tree.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/indexed_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_merkle_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_poseidon2.hpp"
#include "barretenberg/vm2/testing/macros.hpp"

namespace bb::avm2::simulation {

using namespace bb::crypto::merkle_tree;

using ::testing::_;
using ::testing::ElementsAre;
using ::testing::Return;
using ::testing::StrictMock;

using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

namespace {

TEST(AvmSimulationIndexedTreeCheck, ReadExists)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<IndexedTreeCheckEvent> event_emitter;
    IndexedTreeCheck indexed_tree_check(poseidon2, merkle_check, field_gt, DOM_SEP__NULLIFIER_MERKLE, event_emitter);

    IndexedTreeLeafData low_leaf = { .value = 42, .next_value = 0, .next_index = 0 };
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = { .root = 123456, .next_available_leaf_index = 128 };

    FF value = 42;

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(low_leaf_hash));
    EXPECT_CALL(merkle_check,
                assert_membership(DOM_SEP__NULLIFIER_MERKLE, low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());

    indexed_tree_check.assert_read(
        value, /*siloing_params*/ std::nullopt, true, low_leaf, low_leaf_index, sibling_path, snapshot);

    IndexedTreeReadWriteEvent expect_event = {
        .value = value,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .tree_height = sibling_path.size(),
        .merkle_hash_separator = FF(DOM_SEP__NULLIFIER_MERKLE),
        .low_leaf_data = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: value does not exist
    EXPECT_THROW_WITH_MESSAGE(
        indexed_tree_check.assert_read(
            value, /*siloing_params*/ std::nullopt, false, low_leaf, low_leaf_index, sibling_path, snapshot),
        "non-membership check failed");
}

TEST(AvmSimulationIndexedTreeCheck, ReadNotExistsLowPointsToInfinity)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<IndexedTreeCheckEvent> event_emitter;
    IndexedTreeCheck indexed_tree_check(poseidon2, merkle_check, field_gt, DOM_SEP__NULLIFIER_MERKLE, event_emitter);

    IndexedTreeLeafData low_leaf = { .value = 40, .next_value = 0, .next_index = 0 };
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = { .root = 123456, .next_available_leaf_index = 128 };
    FF value = 42;

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(low_leaf_hash));
    EXPECT_CALL(merkle_check,
                assert_membership(DOM_SEP__NULLIFIER_MERKLE, low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());
    EXPECT_CALL(field_gt, ff_gt(value, low_leaf.value)).WillRepeatedly(Return(true));

    indexed_tree_check.assert_read(
        value, /*siloing_params*/ std::nullopt, false, low_leaf, low_leaf_index, sibling_path, snapshot);
    IndexedTreeReadWriteEvent expect_event = {
        .value = value,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .tree_height = sibling_path.size(),
        .merkle_hash_separator = FF(DOM_SEP__NULLIFIER_MERKLE),
        .low_leaf_data = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: value exists
    EXPECT_THROW_WITH_MESSAGE(
        indexed_tree_check.assert_read(
            value, /*siloing_params*/ std::nullopt, true, low_leaf, low_leaf_index, sibling_path, snapshot),
        "membership check failed");

    // Negative test: value not greater than low leaf value
    EXPECT_CALL(field_gt, ff_gt(value, low_leaf.value)).WillOnce(Return(false));
    EXPECT_THROW_WITH_MESSAGE(
        indexed_tree_check.assert_read(
            value, /*siloing_params*/ std::nullopt, true, low_leaf, low_leaf_index, sibling_path, snapshot),
        "Low leaf value is GTE leaf value");
}

TEST(AvmSimulationIndexedTreeCheck, ReadNotExistsLowPointsToAnotherLeaf)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<IndexedTreeCheckEvent> event_emitter;
    IndexedTreeCheck indexed_tree_check(poseidon2, merkle_check, field_gt, DOM_SEP__NULLIFIER_MERKLE, event_emitter);

    IndexedTreeLeafData low_leaf = { .value = 40, .next_value = 50, .next_index = 28 };
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = { .root = 123456, .next_available_leaf_index = 128 };
    FF value = 42;

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(low_leaf_hash));
    EXPECT_CALL(merkle_check,
                assert_membership(DOM_SEP__NULLIFIER_MERKLE, low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());
    EXPECT_CALL(field_gt, ff_gt(value, low_leaf.value)).WillRepeatedly(Return(true));
    EXPECT_CALL(field_gt, ff_gt(low_leaf.next_value, value)).WillRepeatedly(Return(true));

    indexed_tree_check.assert_read(
        value, /*siloing_params*/ std::nullopt, false, low_leaf, low_leaf_index, sibling_path, snapshot);
    IndexedTreeReadWriteEvent expect_event = {
        .value = value,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .tree_height = sibling_path.size(),
        .merkle_hash_separator = FF(DOM_SEP__NULLIFIER_MERKLE),
        .low_leaf_data = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: value exists
    EXPECT_THROW_WITH_MESSAGE(
        indexed_tree_check.assert_read(
            value, /*siloing_params*/ std::nullopt, true, low_leaf, low_leaf_index, sibling_path, snapshot),
        "membership check failed");

    // Negative test: next value not greater than value
    EXPECT_CALL(field_gt, ff_gt(low_leaf.next_value, value)).WillOnce(Return(false));
    EXPECT_THROW_WITH_MESSAGE(
        indexed_tree_check.assert_read(
            value, /*siloing_params*/ std::nullopt, true, low_leaf, low_leaf_index, sibling_path, snapshot),
        "Leaf value is GTE low leaf next value");
}

TEST(AvmSimulationIndexedTreeCheck, WriteExists)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<IndexedTreeCheckEvent> event_emitter;
    IndexedTreeCheck indexed_tree_check(poseidon2, merkle_check, field_gt, DOM_SEP__NULLIFIER_MERKLE, event_emitter);

    IndexedTreeLeafData low_leaf = { .value = 42, .next_value = 0, .next_index = 0 };
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = { .root = 123456, .next_available_leaf_index = 128 };

    FF value = 42;

    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(low_leaf_hash));
    EXPECT_CALL(merkle_check,
                assert_membership(DOM_SEP__NULLIFIER_MERKLE, low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());

    AppendOnlyTreeSnapshot result_snapshot = indexed_tree_check.write(value,
                                                                      /*siloing_params*/ std::nullopt,
                                                                      10,
                                                                      low_leaf,
                                                                      low_leaf_index,
                                                                      sibling_path,
                                                                      snapshot,
                                                                      /*insertion_path*/ std::nullopt);

    EXPECT_EQ(result_snapshot, snapshot);

    IndexedTreeReadWriteEvent expect_event = {
        .value = value,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .tree_height = sibling_path.size(),
        .merkle_hash_separator = FF(DOM_SEP__NULLIFIER_MERKLE),
        .low_leaf_data = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
        .write = true,
        .public_inputs_index = 10,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));
}

TEST(AvmSimulationIndexedTreeCheck, Siloing)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<IndexedTreeCheckEvent> event_emitter;
    IndexedTreeCheck indexed_tree_check(poseidon2, merkle_check, field_gt, DOM_SEP__NULLIFIER_MERKLE, event_emitter);

    FF value = 42;
    FF separator = 99;
    AztecAddress address = AztecAddress(1);
    IndexedTreeSiloingParameters siloing_params = { .address = address, .siloing_separator = separator };
    std::vector<FF> siloed_hash_inputs = { separator, address, value };
    FF siloed_value = RawPoseidon2::hash(siloed_hash_inputs);

    IndexedTreeLeafData low_leaf = { .value = siloed_value, .next_value = 0, .next_index = 0 };
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    std::vector<FF> sibling_path = { 1, 2, 3, 4, 5 };
    AppendOnlyTreeSnapshot snapshot = { .root = 123456, .next_available_leaf_index = 128 };

    EXPECT_CALL(poseidon2, hash(siloed_hash_inputs)).WillRepeatedly(Return(siloed_value));
    EXPECT_CALL(poseidon2, hash(low_leaf.get_hash_inputs())).WillRepeatedly(Return(low_leaf_hash));
    EXPECT_CALL(merkle_check,
                assert_membership(DOM_SEP__NULLIFIER_MERKLE, low_leaf_hash, low_leaf_index, _, snapshot.root))
        .WillRepeatedly(Return());

    indexed_tree_check.assert_read(value, siloing_params, true, low_leaf, low_leaf_index, sibling_path, snapshot);

    IndexedLeafSiloingData expected_siloing_data = { .siloed_value = siloed_value, .parameters = siloing_params };
    IndexedTreeReadWriteEvent read_event = {
        .value = value,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .tree_height = sibling_path.size(),
        .merkle_hash_separator = FF(DOM_SEP__NULLIFIER_MERKLE),
        .low_leaf_data = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
        .siloing_data = expected_siloing_data,
    };
    indexed_tree_check.write(value,
                             siloing_params,
                             10,
                             low_leaf,
                             low_leaf_index,
                             sibling_path,
                             snapshot,
                             /*insertion_path*/ std::nullopt);

    IndexedTreeReadWriteEvent write_event = {
        .value = value,
        .prev_snapshot = snapshot,
        .next_snapshot = snapshot,
        .tree_height = sibling_path.size(),
        .merkle_hash_separator = FF(DOM_SEP__NULLIFIER_MERKLE),
        .low_leaf_data = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
        .write = true,
        .siloing_data = expected_siloing_data,
        .public_inputs_index = 10,
    };
    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(read_event, write_event));
}

TEST(AvmSimulationIndexedTreeCheck, WriteAppend)
{
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockMerkleCheck> merkle_check;
    StrictMock<MockFieldGreaterThan> field_gt;

    EventEmitter<IndexedTreeCheckEvent> event_emitter;
    IndexedTreeCheck indexed_tree_check(poseidon2, merkle_check, field_gt, DOM_SEP__NULLIFIER_MERKLE, event_emitter);

    FF value = 100;
    FF low_value = 40;

    MemoryTree<Poseidon2HashPolicy> tree(8);

    IndexedTreeLeafData low_leaf = { .value = low_value, .next_value = value + 1, .next_index = 10 };
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 0;
    tree.update_element(low_leaf_index, low_leaf_hash);

    AppendOnlyTreeSnapshot prev_snapshot = { .root = tree.root(), .next_available_leaf_index = 128 };
    std::vector<FF> low_leaf_sibling_path = tree.get_sibling_path(low_leaf_index);

    IndexedTreeLeafData updated_low_leaf = {
        .value = low_leaf.value,
        .next_value = value,
        .next_index = prev_snapshot.next_available_leaf_index,
    };
    FF updated_low_leaf_hash = RawPoseidon2::hash(updated_low_leaf.get_hash_inputs());
    tree.update_element(low_leaf_index, updated_low_leaf_hash);

    FF intermediate_root = tree.root();
    std::vector<FF> insertion_sibling_path = tree.get_sibling_path(prev_snapshot.next_available_leaf_index);

    // The new leaf gets the old low leaf's next pointer.
    IndexedTreeLeafData new_leaf = { .value = value,
                                     .next_value = low_leaf.next_value,
                                     .next_index = low_leaf.next_index };
    FF new_leaf_hash = RawPoseidon2::hash(new_leaf.get_hash_inputs());
    tree.update_element(prev_snapshot.next_available_leaf_index, new_leaf_hash);

    AppendOnlyTreeSnapshot next_snapshot = {
        .root = tree.root(),
        .next_available_leaf_index = prev_snapshot.next_available_leaf_index + 1,
    };

    EXPECT_CALL(poseidon2, hash(_)).WillRepeatedly([](const std::vector<FF>& input) {
        return RawPoseidon2::hash(input);
    });
    EXPECT_CALL(
        merkle_check,
        write(DOM_SEP__NULLIFIER_MERKLE, low_leaf_hash, updated_low_leaf_hash, low_leaf_index, _, prev_snapshot.root))
        .WillRepeatedly(Return(intermediate_root));
    EXPECT_CALL(field_gt, ff_gt(value, low_leaf.value)).WillRepeatedly(Return(true));
    EXPECT_CALL(field_gt, ff_gt(low_leaf.next_value, value)).WillRepeatedly(Return(true));
    EXPECT_CALL(merkle_check,
                write(DOM_SEP__NULLIFIER_MERKLE,
                      FF(0),
                      new_leaf_hash,
                      prev_snapshot.next_available_leaf_index,
                      _,
                      intermediate_root))
        .WillRepeatedly(Return(next_snapshot.root));

    AppendOnlyTreeSnapshot result_snapshot = indexed_tree_check.write(value,
                                                                      /*siloing_params*/ std::nullopt,
                                                                      std::nullopt,
                                                                      low_leaf,
                                                                      low_leaf_index,
                                                                      low_leaf_sibling_path,
                                                                      prev_snapshot,
                                                                      insertion_sibling_path);

    EXPECT_EQ(next_snapshot, result_snapshot);

    IndexedTreeReadWriteEvent expect_event = {
        .value = value,
        .prev_snapshot = prev_snapshot,
        .next_snapshot = next_snapshot,
        .tree_height = low_leaf_sibling_path.size(),
        .merkle_hash_separator = FF(DOM_SEP__NULLIFIER_MERKLE),
        .low_leaf_data = low_leaf,
        .low_leaf_hash = low_leaf_hash,
        .low_leaf_index = low_leaf_index,
        .write = true,
        .append_data =
            IndexedLeafAppendData{
                .updated_low_leaf_hash = updated_low_leaf_hash,
                .new_leaf_hash = new_leaf_hash,
                .intermediate_root = intermediate_root,
            },
    };

    EXPECT_THAT(event_emitter.dump_events(), ElementsAre(expect_event));

    // Negative test: value already exists in tree
    IndexedTreeLeafData matching_leaf = { .value = value,
                                          .next_value = low_leaf.next_value,
                                          .next_index = low_leaf.next_index };
    EXPECT_THROW_WITH_MESSAGE(indexed_tree_check.write(value,
                                                       /*siloing_params*/ std::nullopt,
                                                       std::nullopt,
                                                       matching_leaf,
                                                       low_leaf_index,
                                                       low_leaf_sibling_path,
                                                       prev_snapshot,
                                                       insertion_sibling_path),
                              "non-membership check failed");

    // Negative test: value not greater than low leaf value
    EXPECT_CALL(field_gt, ff_gt(value, low_leaf.value)).WillOnce(Return(false));
    EXPECT_THROW_WITH_MESSAGE(indexed_tree_check.write(value,
                                                       /*siloing_params*/ std::nullopt,
                                                       std::nullopt,
                                                       low_leaf,
                                                       low_leaf_index,
                                                       low_leaf_sibling_path,
                                                       prev_snapshot,
                                                       insertion_sibling_path),
                              "Low leaf value is GTE leaf value");
    EXPECT_CALL(field_gt, ff_gt(value, low_leaf.value)).WillOnce(Return(true));

    // Negative test: next value not greater than value
    EXPECT_CALL(field_gt, ff_gt(low_leaf.next_value, value)).WillOnce(Return(false));
    EXPECT_THROW_WITH_MESSAGE(indexed_tree_check.write(value,
                                                       /*siloing_params*/ std::nullopt,
                                                       std::nullopt,
                                                       low_leaf,
                                                       low_leaf_index,
                                                       low_leaf_sibling_path,
                                                       prev_snapshot,
                                                       insertion_sibling_path),
                              "Leaf value is GTE low leaf next value");
}

} // namespace

} // namespace bb::avm2::simulation
