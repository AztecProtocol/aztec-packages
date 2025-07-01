#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cmath>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/merkle_check.hpp"
#include "barretenberg/vm2/generated/relations/public_data_check.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/public_data_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/field_gt.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"
#include "barretenberg/vm2/simulation/public_data_tree_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/testing/test_tree.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/public_data_tree_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using ::testing::NiceMock;
using ::testing::TestWithParam;

using testing::TestMemoryTree;

using simulation::EventEmitter;
using simulation::ExecutionIdManager;
using simulation::FieldGreaterThan;
using simulation::FieldGreaterThanEvent;
using simulation::MerkleCheck;
using simulation::MerkleCheckEvent;
using simulation::NoopEventEmitter;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::PublicDataTreeCheck;
using simulation::PublicDataTreeCheckEvent;
using simulation::PublicDataTreeLeafPreimage;
using simulation::RangeCheck;
using simulation::RangeCheckEvent;
using simulation::unconstrained_compute_leaf_slot;
using simulation::unconstrained_root_from_path;

using tracegen::FieldGreaterThanTraceBuilder;
using tracegen::MerkleCheckTraceBuilder;
using tracegen::Poseidon2TraceBuilder;
using tracegen::PublicDataTreeCheckTraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using public_data_check = bb::avm2::public_data_check<FF>;
using public_data_squash = bb::avm2::public_data_squash<FF>;
using poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

AztecAddress contract_address = 1;

struct TestParams {
    FF slot;
    FF value;
    PublicDataTreeLeafPreimage low_leaf;
};

std::vector<TestParams> positive_tests = {
    // Exists = true, leaf pointers to infinity
    TestParams{ .slot = 42,
                .value = 27,
                .low_leaf = PublicDataTreeLeafPreimage(
                    PublicDataLeafValue(unconstrained_compute_leaf_slot(contract_address, 42), 27), 0, 0) },
    // Exists = true, leaf points to higher value
    TestParams{
        .slot = 42,
        .value = 27,
        .low_leaf = PublicDataTreeLeafPreimage(
            PublicDataLeafValue(unconstrained_compute_leaf_slot(contract_address, 42), 27), 28, FF::neg_one()) },
    // Exists = false, low leaf points to infinity
    TestParams{ .slot = 42, .value = 0, .low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(10, 0), 0, 0) },
    // Exists = false, low leaf points to higher value
    TestParams{
        .slot = 42, .value = 0, .low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(10, 0), 28, FF::neg_one()) }
};

class PublicDataReadPositiveTests : public TestWithParam<TestParams> {};

TEST_P(PublicDataReadPositiveTests, Positive)
{
    const auto& param = GetParam();

    ExecutionIdManager execution_id_manager(0);
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    EventEmitter<RangeCheckEvent> range_check_emitter;
    RangeCheck range_check(range_check_emitter);

    EventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<PublicDataTreeCheckEvent> public_data_tree_check_event_emitter;
    PublicDataTreeCheck public_data_tree_check_simulator(
        poseidon2, merkle_check, field_gt, execution_id_manager, range_check, public_data_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    PublicDataTreeCheckTraceBuilder public_data_tree_read_builder;

    FF low_leaf_hash = poseidon2.hash(param.low_leaf.get_hash_inputs());
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path;
    sibling_path.reserve(PUBLIC_DATA_TREE_HEIGHT);
    for (size_t i = 0; i < PUBLIC_DATA_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }
    FF root = unconstrained_root_from_path(low_leaf_hash, leaf_index, sibling_path);

    public_data_tree_check_simulator.assert_read(param.slot,
                                                 contract_address,
                                                 param.value,
                                                 param.low_leaf,
                                                 leaf_index,
                                                 sibling_path,
                                                 AppendOnlyTreeSnapshot{
                                                     .root = root,
                                                     .nextAvailableLeafIndex = 128,
                                                 });

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);
    public_data_tree_read_builder.process(public_data_tree_check_event_emitter.dump_events(), trace);

    check_relation<public_data_check>(trace);
    check_relation<public_data_squash>(trace);
}

INSTANTIATE_TEST_SUITE_P(PublicDataTreeConstrainingTest,
                         PublicDataReadPositiveTests,
                         ::testing::ValuesIn(positive_tests));

TEST(PublicDataTreeConstrainingTest, NegativeStartCondition)
{
    // Test constraint: sel' * (1 - sel) * (1 - precomputed.first_row) = 0
    TestTraceContainer trace({ {
                                   { C::public_data_check_sel, 0 },
                                   { C::precomputed_first_row, 1 },
                               },
                               {
                                   { C::public_data_check_sel, 1 },
                               },
                               {
                                   { C::public_data_check_sel, 1 },
                               } });

    check_relation<public_data_check>(trace, public_data_check::SR_START_CONDITION);

    // Invalid: sel can't be activated if prev is not the first row
    trace.set(C::precomputed_first_row, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_check>(trace, public_data_check::SR_START_CONDITION),
                              "START_CONDITION");
}

TEST(PublicDataTreeConstrainingTest, NegativeExistsFlagCheck)
{
    // Test constraint: sel * (LEAF_SLOT_LOW_LEAF_SLOT_DIFF * (LEAF_EXISTS * (1 - leaf_slot_low_leaf_slot_diff_inv) +
    // leaf_slot_low_leaf_slot_diff_inv) - 1 + LEAF_EXISTS) = 0
    TestTraceContainer trace({
        { { C::public_data_check_sel, 1 },
          { C::public_data_check_leaf_slot, 27 },
          { C::public_data_check_low_leaf_slot, 27 },
          { C::public_data_check_leaf_slot_low_leaf_slot_diff_inv, 0 },
          { C::public_data_check_leaf_not_exists, 0 } },
        { { C::public_data_check_sel, 1 },
          { C::public_data_check_leaf_slot, 28 },
          { C::public_data_check_low_leaf_slot, 27 },
          { C::public_data_check_leaf_slot_low_leaf_slot_diff_inv, FF(1).invert() },
          { C::public_data_check_leaf_not_exists, 1 } },
    });

    check_relation<public_data_check>(trace, public_data_check::SR_EXISTS_FLAG_CHECK);

    trace.set(C::public_data_check_leaf_not_exists, 0, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_check>(trace, public_data_check::SR_EXISTS_FLAG_CHECK),
                              "EXISTS_FLAG_CHECK");

    trace.set(C::public_data_check_leaf_not_exists, 0, 0);
    trace.set(C::public_data_check_leaf_not_exists, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_check>(trace, public_data_check::SR_EXISTS_FLAG_CHECK),
                              "EXISTS_FLAG_CHECK");
}

TEST(PublicDataTreeConstrainingTest, NegativeNextSlotIsZero)
{
    // Test constraint: leaf_not_exists * (low_leaf_next_slot * (NEXT_SLOT_IS_ZERO * (1 - next_slot_inv) +
    // next_slot_inv) - 1 + NEXT_SLOT_IS_ZERO) = 0
    TestTraceContainer trace({
        {
            { C::public_data_check_leaf_not_exists, 1 },
            { C::public_data_check_low_leaf_next_slot, 0 },
            { C::public_data_check_next_slot_inv, 0 },
            { C::public_data_check_next_slot_is_nonzero, 0 },
        },
        {
            { C::public_data_check_leaf_not_exists, 1 },
            { C::public_data_check_low_leaf_next_slot, 1 },
            { C::public_data_check_next_slot_inv, FF(1).invert() },
            { C::public_data_check_next_slot_is_nonzero, 1 },
        },
    });

    check_relation<public_data_check>(trace, public_data_check::SR_NEXT_SLOT_IS_ZERO_CHECK);

    trace.set(C::public_data_check_next_slot_is_nonzero, 0, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_check>(trace, public_data_check::SR_NEXT_SLOT_IS_ZERO_CHECK),
                              "NEXT_SLOT_IS_ZERO_CHECK");

    trace.set(C::public_data_check_next_slot_is_nonzero, 0, 0);
    trace.set(C::public_data_check_next_slot_is_nonzero, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_check>(trace, public_data_check::SR_NEXT_SLOT_IS_ZERO_CHECK),
                              "NEXT_SLOT_IS_ZERO_CHECK");
}

TEST(PublicDataTreeConstrainingTest, NegativeValueIsCorrect)
{
    // Test constraint: leaf_not_exists * (low_leaf_next_slot * (NEXT_SLOT_IS_ZERO * (1 - next_slot_inv) +
    // next_slot_inv) - 1 + NEXT_SLOT_IS_ZERO) = 0
    TestTraceContainer trace({
        {
            { C::public_data_check_low_leaf_value, 27 },
            { C::public_data_check_leaf_not_exists, 0 },
            { C::public_data_check_value, 27 },
        },
        {
            { C::public_data_check_low_leaf_value, 27 },
            { C::public_data_check_leaf_not_exists, 1 },
            { C::public_data_check_value, 0 },
        },
    });

    check_relation<public_data_check>(trace, public_data_check::SR_VALUE_IS_CORRECT);

    // Invalid, if leaf exists, the value should be the low leaf value
    trace.set(C::public_data_check_value, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_check>(trace, public_data_check::SR_VALUE_IS_CORRECT),
                              "VALUE_IS_CORRECT");

    trace.set(C::public_data_check_value, 0, 27);
    // Invalid, if leaf does not exists, the value should be zero
    trace.set(C::public_data_check_value, 1, 27);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_check>(trace, public_data_check::SR_VALUE_IS_CORRECT),
                              "VALUE_IS_CORRECT");
}

TEST(PublicDataTreeConstrainingTest, PositiveWriteExists)
{
    ExecutionIdManager execution_id_manager(0);
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    EventEmitter<RangeCheckEvent> range_check_emitter;
    RangeCheck range_check(range_check_emitter);

    EventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<PublicDataTreeCheckEvent> public_data_tree_check_event_emitter;
    PublicDataTreeCheck public_data_tree_check_simulator(
        poseidon2, merkle_check, field_gt, execution_id_manager, range_check, public_data_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    PublicDataTreeCheckTraceBuilder public_data_tree_read_builder;

    FF slot = 40;
    FF leaf_slot = unconstrained_compute_leaf_slot(contract_address, slot);
    FF new_value = 27;
    TestMemoryTree<Poseidon2HashPolicy> public_data_tree(8, PUBLIC_DATA_TREE_HEIGHT);

    PublicDataTreeLeafPreimage low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(leaf_slot, 1), 0, 0);
    FF low_leaf_hash = poseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    public_data_tree.update_element(low_leaf_index, low_leaf_hash);

    AppendOnlyTreeSnapshot prev_snapshot =
        AppendOnlyTreeSnapshot{ .root = public_data_tree.root(), .nextAvailableLeafIndex = 128 };
    std::vector<FF> low_leaf_sibling_path = public_data_tree.get_sibling_path(low_leaf_index);

    PublicDataTreeLeafPreimage updated_low_leaf = low_leaf;
    updated_low_leaf.leaf.value = new_value;
    FF updated_low_leaf_hash = poseidon2::hash(updated_low_leaf.get_hash_inputs());
    public_data_tree.update_element(low_leaf_index, updated_low_leaf_hash);

    FF intermediate_root = public_data_tree.root();
    std::vector<FF> insertion_sibling_path = public_data_tree.get_sibling_path(prev_snapshot.nextAvailableLeafIndex);

    // No insertion happens
    AppendOnlyTreeSnapshot next_snapshot =
        AppendOnlyTreeSnapshot{ .root = intermediate_root,
                                .nextAvailableLeafIndex = prev_snapshot.nextAvailableLeafIndex };

    AppendOnlyTreeSnapshot result_snapshot = public_data_tree_check_simulator.write(slot,
                                                                                    contract_address,
                                                                                    new_value,
                                                                                    low_leaf,
                                                                                    low_leaf_index,
                                                                                    low_leaf_sibling_path,
                                                                                    prev_snapshot,
                                                                                    insertion_sibling_path,
                                                                                    false);
    EXPECT_EQ(next_snapshot, result_snapshot);

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);
    public_data_tree_read_builder.process(public_data_tree_check_event_emitter.dump_events(), trace);

    check_relation<public_data_check>(trace);
    check_relation<public_data_squash>(trace);
}

TEST(PublicDataTreeConstrainingTest, PositiveWriteAndUpdate)
{
    ExecutionIdManager execution_id_manager(0);
    NoopEventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    NoopEventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    NoopEventEmitter<RangeCheckEvent> range_check_emitter;
    RangeCheck range_check(range_check_emitter);

    NoopEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    NoopEventEmitter<PublicDataTreeCheckEvent> public_data_tree_check_event_emitter;
    PublicDataTreeCheck public_data_tree_check_simulator(
        poseidon2, merkle_check, field_gt, execution_id_manager, range_check, public_data_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    PublicDataTreeCheckTraceBuilder public_data_tree_read_builder;

    FF slot = 42;
    FF leaf_slot = unconstrained_compute_leaf_slot(contract_address, slot);
    FF new_value = 27; // Squashed value
    FF updated_value = 28;
    FF low_leaf_slot = 40;
    TestMemoryTree<Poseidon2HashPolicy> public_data_tree(8, PUBLIC_DATA_TREE_HEIGHT);

    PublicDataTreeLeafPreimage low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(low_leaf_slot, 1), 0, 0);
    FF low_leaf_hash = poseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    public_data_tree.update_element(low_leaf_index, low_leaf_hash);

    AppendOnlyTreeSnapshot prev_snapshot =
        AppendOnlyTreeSnapshot{ .root = public_data_tree.root(), .nextAvailableLeafIndex = 128 };
    std::vector<FF> low_leaf_sibling_path = public_data_tree.get_sibling_path(low_leaf_index);

    PublicDataTreeLeafPreimage updated_low_leaf = low_leaf;
    updated_low_leaf.nextIndex = prev_snapshot.nextAvailableLeafIndex;
    updated_low_leaf.nextKey = leaf_slot;
    FF updated_low_leaf_hash = poseidon2::hash(updated_low_leaf.get_hash_inputs());
    public_data_tree.update_element(low_leaf_index, updated_low_leaf_hash);

    std::vector<FF> insertion_sibling_path = public_data_tree.get_sibling_path(prev_snapshot.nextAvailableLeafIndex);

    PublicDataTreeLeafPreimage new_leaf =
        PublicDataTreeLeafPreimage(PublicDataLeafValue(leaf_slot, new_value), low_leaf.nextIndex, low_leaf.nextKey);
    FF new_leaf_hash = poseidon2::hash(new_leaf.get_hash_inputs());
    public_data_tree.update_element(prev_snapshot.nextAvailableLeafIndex, new_leaf_hash);

    AppendOnlyTreeSnapshot next_snapshot =
        AppendOnlyTreeSnapshot{ .root = public_data_tree.root(),
                                .nextAvailableLeafIndex = prev_snapshot.nextAvailableLeafIndex + 1 };

    AppendOnlyTreeSnapshot snapshot_after_insertion = public_data_tree_check_simulator.write(slot,
                                                                                             contract_address,
                                                                                             new_value,
                                                                                             low_leaf,
                                                                                             low_leaf_index,
                                                                                             low_leaf_sibling_path,
                                                                                             prev_snapshot,
                                                                                             insertion_sibling_path,
                                                                                             false);
    EXPECT_EQ(next_snapshot, snapshot_after_insertion);

    low_leaf_index = prev_snapshot.nextAvailableLeafIndex;
    prev_snapshot = snapshot_after_insertion;

    low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(leaf_slot, new_value), 0, 0);
    low_leaf_hash = poseidon2::hash(low_leaf.get_hash_inputs());
    public_data_tree.update_element(low_leaf_index, low_leaf_hash);
    low_leaf_sibling_path = public_data_tree.get_sibling_path(low_leaf_index);

    updated_low_leaf = low_leaf;
    updated_low_leaf.leaf.value = updated_value;
    updated_low_leaf_hash = poseidon2::hash(updated_low_leaf.get_hash_inputs());
    public_data_tree.update_element(low_leaf_index, updated_low_leaf_hash);

    insertion_sibling_path = public_data_tree.get_sibling_path(prev_snapshot.nextAvailableLeafIndex);

    // No insertion happens
    next_snapshot = AppendOnlyTreeSnapshot{ .root = public_data_tree.root(),
                                            .nextAvailableLeafIndex = prev_snapshot.nextAvailableLeafIndex };

    AppendOnlyTreeSnapshot snapshot_after_update = public_data_tree_check_simulator.write(slot,
                                                                                          contract_address,
                                                                                          updated_value,
                                                                                          low_leaf,
                                                                                          low_leaf_index,
                                                                                          low_leaf_sibling_path,
                                                                                          prev_snapshot,
                                                                                          insertion_sibling_path,
                                                                                          true);
    EXPECT_EQ(next_snapshot, snapshot_after_update);
    public_data_tree_read_builder.process(public_data_tree_check_event_emitter.dump_events(), trace);

    check_relation<public_data_check>(trace);
    check_relation<public_data_squash>(trace);
}

TEST(PublicDataTreeConstrainingTest, NegativeLowLeafValueUpdate)
{
    // Test constraint: write * ((low_leaf_value - value) * leaf_not_exists + value - updated_low_leaf_value) = 0
    TestTraceContainer trace({
        {
            { C::public_data_check_write, 1 },
            { C::public_data_check_leaf_not_exists, 0 },
            { C::public_data_check_low_leaf_value, 27 },
            { C::public_data_check_value, 28 },
            { C::public_data_check_updated_low_leaf_value, 28 },
        },
        {
            { C::public_data_check_write, 1 },
            { C::public_data_check_leaf_not_exists, 1 },
            { C::public_data_check_low_leaf_value, 27 },
            { C::public_data_check_value, 28 },
            { C::public_data_check_updated_low_leaf_value, 27 },
        },
    });

    check_relation<public_data_check>(trace, public_data_check::SR_LOW_LEAF_VALUE_UPDATE);

    // Invalid, if leaf exists, updated_low_leaf_value should be the value to write
    trace.set(C::public_data_check_leaf_not_exists, 0, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_check>(trace, public_data_check::SR_LOW_LEAF_VALUE_UPDATE),
                              "LOW_LEAF_VALUE_UPDATE");

    trace.set(C::public_data_check_leaf_not_exists, 0, 0);
    // Invalid, if leaf does not exist, updated_low_leaf_value should be the low leaf value
    trace.set(C::public_data_check_leaf_not_exists, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_check>(trace, public_data_check::SR_LOW_LEAF_VALUE_UPDATE),
                              "LOW_LEAF_VALUE_UPDATE");
}

TEST(PublicDataTreeConstrainingTest, NegativeLowLeafNextIndexUpdate)
{
    // Test constraint: write * ((tree_size_before_write - low_leaf_next_index) * leaf_not_exists + low_leaf_next_index
    // - updated_low_leaf_next_index) = 0
    TestTraceContainer trace({
        {
            { C::public_data_check_write, 1 },
            { C::public_data_check_leaf_not_exists, 0 },
            { C::public_data_check_low_leaf_next_index, 27 },
            { C::public_data_check_tree_size_before_write, 128 },
            { C::public_data_check_updated_low_leaf_next_index, 27 },
        },
        {
            { C::public_data_check_write, 1 },
            { C::public_data_check_leaf_not_exists, 1 },
            { C::public_data_check_low_leaf_next_index, 27 },
            { C::public_data_check_tree_size_before_write, 128 },
            { C::public_data_check_updated_low_leaf_next_index, 128 },
        },
    });

    check_relation<public_data_check>(trace, public_data_check::SR_LOW_LEAF_NEXT_INDEX_UPDATE);

    // Invalid, if leaf not exists, the updated_low_leaf_next_index should be the newly inserted leaf
    trace.set(C::public_data_check_leaf_not_exists, 0, 1);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<public_data_check>(trace, public_data_check::SR_LOW_LEAF_NEXT_INDEX_UPDATE),
        "LOW_LEAF_NEXT_INDEX_UPDATE");

    trace.set(C::public_data_check_leaf_not_exists, 0, 0);
    // Invalid, if leaf exists, the updated_low_leaf_next_index should be untouched
    trace.set(C::public_data_check_leaf_not_exists, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<public_data_check>(trace, public_data_check::SR_LOW_LEAF_NEXT_INDEX_UPDATE),
        "LOW_LEAF_NEXT_INDEX_UPDATE");
}

TEST(PublicDataTreeConstrainingTest, NegativeLowLeafNextSlotUpdate)
{
    // Test constraint: write * ((leaf_slot - low_leaf_next_slot) * leaf_not_exists + low_leaf_next_slot -
    // updated_low_leaf_next_slot) = 0
    TestTraceContainer trace({
        {
            { C::public_data_check_write, 1 },
            { C::public_data_check_leaf_not_exists, 0 },
            { C::public_data_check_low_leaf_next_slot, 27 },
            { C::public_data_check_leaf_slot, 28 },
            { C::public_data_check_updated_low_leaf_next_slot, 27 },
        },
        {
            { C::public_data_check_write, 1 },
            { C::public_data_check_leaf_not_exists, 1 },
            { C::public_data_check_low_leaf_next_slot, 27 },
            { C::public_data_check_leaf_slot, 28 },
            { C::public_data_check_updated_low_leaf_next_slot, 28 },
        },
    });

    check_relation<public_data_check>(trace, public_data_check::SR_LOW_LEAF_NEXT_SLOT_UPDATE);

    // Invalid, if leaf not exists, the updated_low_leaf_next_slot should be the newly inserted leaf slot
    trace.set(C::public_data_check_leaf_not_exists, 0, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_check>(trace, public_data_check::SR_LOW_LEAF_NEXT_SLOT_UPDATE),
                              "LOW_LEAF_NEXT_SLOT_UPDATE");

    trace.set(C::public_data_check_leaf_not_exists, 0, 0);
    // Invalid, if leaf exists, the updated_low_leaf_next_slot should be untouched
    trace.set(C::public_data_check_leaf_not_exists, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_check>(trace, public_data_check::SR_LOW_LEAF_NEXT_SLOT_UPDATE),
                              "LOW_LEAF_NEXT_SLOT_UPDATE");
}

TEST(PublicDataTreeConstrainingTest, NegativeUpdateRootValidation)
{
    // Test constraint: (1 - leaf_not_exists) * write * (write_root - intermediate_root) = 0
    TestTraceContainer trace({
        {
            { C::public_data_check_write, 1 },
            { C::public_data_check_leaf_not_exists, 0 },
            { C::public_data_check_intermediate_root, 28 },
            { C::public_data_check_write_root, 28 },
        },
        {
            { C::public_data_check_write, 1 },
            { C::public_data_check_leaf_not_exists, 1 },
            { C::public_data_check_intermediate_root, 28 },
            { C::public_data_check_write_root, 30 },
        },
    });

    check_relation<public_data_check>(trace, public_data_check::SR_LOW_LEAF_NEXT_SLOT_UPDATE);

    // Invalid, if leaf exists, the write root should be the intermediate root
    trace.set(C::public_data_check_write_root, 0, 30);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_check>(trace, public_data_check::SR_UPDATE_ROOT_VALIDATION),
                              "UPDATE_ROOT_VALIDATION");
}

TEST(PublicDataTreeConstrainingTest, NegativeWriteIdxInitialValue)
{
    // Test constraint: (1 - sel) * sel' * (constants.AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX
    // - write_idx') = 0
    TestTraceContainer trace(
        { {
              { C::public_data_check_sel, 0 },
          },
          {
              { C::public_data_check_sel, 1 },
              { C::public_data_check_write_idx, AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_DATA_WRITES_ROW_IDX },
          } });

    check_relation<public_data_check>(trace, public_data_check::SR_WRITE_IDX_INITIAL_VALUE);

    // Invalid, if sel goes from 0 to 1, the write_idx should be the initial value
    trace.set(C::public_data_check_write_idx, 1, 27);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_check>(trace, public_data_check::SR_WRITE_IDX_INITIAL_VALUE),
                              "WRITE_IDX_INITIAL_VALUE");
}

TEST(PublicDataTreeConstrainingTest, NegativeWriteIdxIncrement)
{
    // Test constraint: not_end * (write_idx + should_write_to_public_inputs - write_idx') = 0
    TestTraceContainer trace({
        {
            { C::public_data_check_not_end, 1 },
            { C::public_data_check_write_idx, 5 },
            { C::public_data_check_should_write_to_public_inputs, 1 },
        },
        {
            { C::public_data_check_not_end, 1 },
            { C::public_data_check_write_idx, 6 },
            { C::public_data_check_should_write_to_public_inputs, 0 },
        },
        {
            { C::public_data_check_write_idx, 6 },
        },
    });

    check_relation<public_data_check>(trace, public_data_check::SR_WRITE_IDX_INCREMENT);

    // Invalid, if should_write_to_public_inputs is 0, the write_idx should not increment
    trace.set(C::public_data_check_should_write_to_public_inputs, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_check>(trace, public_data_check::SR_WRITE_IDX_INCREMENT),
                              "WRITE_IDX_INCREMENT");

    // Invalid, if should_write_to_public_inputs is 1, the write_idx should increment
    trace.set(C::public_data_check_should_write_to_public_inputs, 0, 1);
    trace.set(C::public_data_check_should_write_to_public_inputs, 1, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_check>(trace, public_data_check::SR_WRITE_IDX_INCREMENT),
                              "WRITE_IDX_INCREMENT");
}

// Squashing subtrace

TEST(PublicDataTreeConstrainingTest, SquashingNegativeStartCondition)
{
    // Test constraint: sel' * (1 - sel) * (1 - precomputed.first_row) = 0
    TestTraceContainer trace({ {
                                   { C::public_data_squash_sel, 0 },
                                   { C::precomputed_first_row, 1 },
                               },
                               {
                                   { C::public_data_squash_sel, 1 },
                               },
                               {
                                   { C::public_data_squash_sel, 1 },
                               } });

    check_relation<public_data_squash>(trace, public_data_squash::SR_START_CONDITION);

    // Invalid: sel can't be activated if prev is not the first row
    trace.set(C::precomputed_first_row, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_squash>(trace, public_data_squash::SR_START_CONDITION),
                              "START_CONDITION");
}

TEST(PublicDataTreeConstrainingTest, SquashingNegativeCheckSameLeafSlot)
{
    // Test constraint: (sel * sel') * (1 - leaf_slot_increase) * (leaf_slot - leaf_slot') = 0
    TestTraceContainer trace({ {
                                   { C::public_data_squash_sel, 1 },
                                   { C::public_data_squash_leaf_slot_increase, 1 },
                                   { C::public_data_squash_leaf_slot, 27 },
                               },
                               {
                                   { C::public_data_squash_sel, 1 },
                                   { C::public_data_squash_leaf_slot_increase, 0 },
                                   { C::public_data_squash_leaf_slot, 40 },
                               } });

    check_relation<public_data_squash>(trace, public_data_squash::SR_CHECK_SAME_LEAF_SLOT);

    // Invalid: if leaf_slot_increase is 0, the leaf_slot should not be different from the previous leaf_slot
    trace.set(C::public_data_squash_leaf_slot_increase, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_squash>(trace, public_data_squash::SR_CHECK_SAME_LEAF_SLOT),
                              "CHECK_SAME_LEAF_SLOT");
}

} // namespace
} // namespace bb::avm2::constraining
