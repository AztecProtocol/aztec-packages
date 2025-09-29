#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cmath>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_public_data_check.hpp"
#include "barretenberg/vm2/generated/relations/merkle_check.hpp"
#include "barretenberg/vm2/generated/relations/public_data_check.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/public_data_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/gadgets/public_data_tree_check.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/testing/public_inputs_builder.hpp"
#include "barretenberg/vm2/testing/test_tree.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/public_data_tree_trace.hpp"
#include "barretenberg/vm2/tracegen/public_inputs_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using ::testing::NiceMock;
using ::testing::TestWithParam;

using testing::TestMemoryTree;

using simulation::DeduplicatingEventEmitter;
using simulation::EventEmitter;
using simulation::ExecutionIdManager;
using simulation::FieldGreaterThan;
using simulation::FieldGreaterThanEvent;
using simulation::MerkleCheck;
using simulation::MerkleCheckEvent;
using simulation::MockGreaterThan;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::Poseidon2PermutationMemoryEvent;
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
using tracegen::PrecomputedTraceBuilder;
using tracegen::PublicDataTreeTraceBuilder;
using tracegen::PublicInputsTraceBuilder;
using tracegen::RangeCheckTraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using public_data_check = bb::avm2::public_data_check<FF>;
using public_data_squash = bb::avm2::public_data_squash<FF>;
using UnconstrainedPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

AztecAddress contract_address = 1;

class PublicDataTreeCheckConstrainingTest : public ::testing::Test {
  protected:
    PublicDataTreeCheckConstrainingTest()
        : execution_id_manager(0) {};

    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    EventEmitter<Poseidon2PermutationMemoryEvent> perm_mem_event_emitter;

    ExecutionIdManager execution_id_manager;
    NiceMock<MockGreaterThan> mock_gt;
    Poseidon2 poseidon2 =
        Poseidon2(execution_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
};

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

class PublicDataReadPositiveTests : public PublicDataTreeCheckConstrainingTest,
                                    public ::testing::WithParamInterface<TestParams> {};

TEST_P(PublicDataReadPositiveTests, Positive)
{
    const auto& param = GetParam();

    auto test_public_inputs = testing::PublicInputsBuilder().build();

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    EventEmitter<RangeCheckEvent> range_check_emitter;
    RangeCheck range_check(range_check_emitter);

    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<PublicDataTreeCheckEvent> public_data_tree_check_event_emitter;
    PublicDataTreeCheck public_data_tree_check_simulator(
        poseidon2, merkle_check, field_gt, execution_id_manager, public_data_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    RangeCheckTraceBuilder range_check_builder;
    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    PrecomputedTraceBuilder precomputed_builder;
    PublicInputsTraceBuilder public_inputs_builder;
    PublicDataTreeTraceBuilder public_data_tree_read_builder;

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

    precomputed_builder.process_misc(trace, 1 << 16);
    precomputed_builder.process_sel_range_16(trace);
    public_inputs_builder.process_public_inputs(trace, test_public_inputs);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);
    range_check_builder.process(range_check_emitter.dump_events(), trace);
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);
    public_data_tree_read_builder.process(public_data_tree_check_event_emitter.dump_events(), trace);

    check_all_interactions<PublicDataTreeTraceBuilder>(trace);

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

TEST_F(PublicDataTreeCheckConstrainingTest, PositiveWriteExists)
{
    FF slot = 40;
    FF leaf_slot = unconstrained_compute_leaf_slot(contract_address, slot);
    FF new_value = 27;
    TestMemoryTree<Poseidon2HashPolicy> public_data_tree(8, PUBLIC_DATA_TREE_HEIGHT);

    AvmAccumulatedData accumulated_data = {};
    accumulated_data.publicDataWrites[0] = PublicDataWrite{
        .leafSlot = leaf_slot,
        .value = new_value,
    };

    auto test_public_inputs = testing::PublicInputsBuilder()
                                  .set_accumulated_data(accumulated_data)
                                  .set_accumulated_data_array_lengths({ .publicDataWrites = 1 })
                                  .build();

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    EventEmitter<RangeCheckEvent> range_check_emitter;
    RangeCheck range_check(range_check_emitter);

    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<PublicDataTreeCheckEvent> public_data_tree_check_event_emitter;
    PublicDataTreeCheck public_data_tree_check_simulator(
        poseidon2, merkle_check, field_gt, execution_id_manager, public_data_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    RangeCheckTraceBuilder range_check_builder;
    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    PrecomputedTraceBuilder precomputed_builder;
    PublicInputsTraceBuilder public_inputs_builder;
    PublicDataTreeTraceBuilder public_data_tree_builder;

    PublicDataTreeLeafPreimage low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(leaf_slot, 1), 0, 0);
    FF low_leaf_hash = UnconstrainedPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    public_data_tree.update_element(low_leaf_index, low_leaf_hash);

    AppendOnlyTreeSnapshot prev_snapshot =
        AppendOnlyTreeSnapshot{ .root = public_data_tree.root(), .nextAvailableLeafIndex = 128 };
    std::vector<FF> low_leaf_sibling_path = public_data_tree.get_sibling_path(low_leaf_index);

    PublicDataTreeLeafPreimage updated_low_leaf = low_leaf;
    updated_low_leaf.leaf.value = new_value;
    FF updated_low_leaf_hash = UnconstrainedPoseidon2::hash(updated_low_leaf.get_hash_inputs());
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

    precomputed_builder.process_misc(trace, 1 << 16);
    precomputed_builder.process_sel_range_16(trace);
    public_inputs_builder.process_public_inputs(trace, test_public_inputs);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);
    range_check_builder.process(range_check_emitter.dump_events(), trace);
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);
    public_data_tree_builder.process(public_data_tree_check_event_emitter.dump_events(), trace);

    check_relation<public_data_check>(trace);
    check_relation<public_data_squash>(trace);

    check_all_interactions<PublicDataTreeTraceBuilder>(trace);
}

TEST_F(PublicDataTreeCheckConstrainingTest, PositiveSquashing)
{
    // This test will write
    // 1. slot 42 with value 27
    // 2. (dummy write to check ordering) slot 50 with value 0
    // 3. slot 42 with value 28
    // If squashing is correct, we should get (42, 28), (50, 0)
    FF slot = 42;
    FF leaf_slot = unconstrained_compute_leaf_slot(contract_address, slot);
    FF new_value = 27; // Will get squashed
    FF updated_value = 28;

    FF dummy_slot = 50;
    FF dummy_leaf_slot = unconstrained_compute_leaf_slot(contract_address, dummy_slot);
    FF dummy_leaf_value = 0;

    // The expected tree order is low_leaf_slot := 40 < leaf_slot < second_low_leaf_slot < dummy_leaf_slot
    // We set second_low_leaf_slot == leaf_slot + 1. (We do not need to know the preimage for second_low_leaf_slot)
    ASSERT_GT(dummy_leaf_slot, leaf_slot + 1);

    FF low_leaf_slot = 40;
    TestMemoryTree<Poseidon2HashPolicy> public_data_tree(8, PUBLIC_DATA_TREE_HEIGHT);

    AvmAccumulatedData accumulated_data = {};
    accumulated_data.publicDataWrites[0] = PublicDataWrite{
        .leafSlot = leaf_slot,
        .value = updated_value,
    };

    accumulated_data.publicDataWrites[1] = PublicDataWrite{
        .leafSlot = dummy_leaf_slot,
        .value = dummy_leaf_value,
    };

    auto test_public_inputs = testing::PublicInputsBuilder()
                                  .set_accumulated_data(accumulated_data)
                                  .set_accumulated_data_array_lengths({ .publicDataWrites = 2 })
                                  .build();

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    EventEmitter<RangeCheckEvent> range_check_emitter;
    RangeCheck range_check(range_check_emitter);

    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<PublicDataTreeCheckEvent> public_data_tree_check_event_emitter;
    PublicDataTreeCheck public_data_tree_check_simulator(
        poseidon2, merkle_check, field_gt, execution_id_manager, public_data_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    RangeCheckTraceBuilder range_check_builder;
    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    PrecomputedTraceBuilder precomputed_builder;
    PublicInputsTraceBuilder public_inputs_builder;
    PublicDataTreeTraceBuilder public_data_tree_read_builder;

    // Insert leaves which are already present in the tree (test preparation)
    PublicDataTreeLeafPreimage low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(low_leaf_slot, 1), 0, 0);
    FF low_leaf_hash = UnconstrainedPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 30;
    public_data_tree.update_element(low_leaf_index, low_leaf_hash);

    uint64_t second_low_leaf_index = 31;
    FF second_low_leaf_slot = leaf_slot + 1;

    PublicDataTreeLeafPreimage second_low_leaf =
        PublicDataTreeLeafPreimage(PublicDataLeafValue(second_low_leaf_slot, 1), 0, 0);
    FF second_low_leaf_hash = UnconstrainedPoseidon2::hash(second_low_leaf.get_hash_inputs());
    public_data_tree.update_element(second_low_leaf_index, second_low_leaf_hash);

    AppendOnlyTreeSnapshot prev_snapshot =
        AppendOnlyTreeSnapshot{ .root = public_data_tree.root(), .nextAvailableLeafIndex = 128 };
    std::vector<FF> low_leaf_sibling_path = public_data_tree.get_sibling_path(low_leaf_index);

    // Insertion section
    PublicDataTreeLeafPreimage updated_low_leaf = low_leaf;
    updated_low_leaf.nextIndex = prev_snapshot.nextAvailableLeafIndex;
    updated_low_leaf.nextKey = leaf_slot;
    FF updated_low_leaf_hash = UnconstrainedPoseidon2::hash(updated_low_leaf.get_hash_inputs());
    public_data_tree.update_element(low_leaf_index, updated_low_leaf_hash);

    std::vector<FF> insertion_sibling_path = public_data_tree.get_sibling_path(prev_snapshot.nextAvailableLeafIndex);

    PublicDataTreeLeafPreimage new_leaf =
        PublicDataTreeLeafPreimage(PublicDataLeafValue(leaf_slot, new_value), low_leaf.nextIndex, low_leaf.nextKey);
    FF new_leaf_hash = UnconstrainedPoseidon2::hash(new_leaf.get_hash_inputs());

    uint64_t value_to_be_updated_leaf_index = prev_snapshot.nextAvailableLeafIndex;
    public_data_tree.update_element(value_to_be_updated_leaf_index, new_leaf_hash);

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

    // Dummy insertion section

    prev_snapshot = snapshot_after_insertion;

    low_leaf = second_low_leaf;
    low_leaf_hash = second_low_leaf_hash;
    low_leaf_index = second_low_leaf_index;
    low_leaf_sibling_path = public_data_tree.get_sibling_path(low_leaf_index);

    updated_low_leaf = low_leaf;
    updated_low_leaf.nextIndex = prev_snapshot.nextAvailableLeafIndex;
    updated_low_leaf.nextKey = dummy_leaf_slot;
    updated_low_leaf_hash = UnconstrainedPoseidon2::hash(updated_low_leaf.get_hash_inputs());
    public_data_tree.update_element(low_leaf_index, updated_low_leaf_hash);
    insertion_sibling_path = public_data_tree.get_sibling_path(prev_snapshot.nextAvailableLeafIndex);

    new_leaf = PublicDataTreeLeafPreimage(
        PublicDataLeafValue(dummy_leaf_slot, dummy_leaf_value), low_leaf.nextIndex, low_leaf.nextKey);
    new_leaf_hash = UnconstrainedPoseidon2::hash(new_leaf.get_hash_inputs());

    uint64_t dummy_leaf_index = prev_snapshot.nextAvailableLeafIndex;
    public_data_tree.update_element(dummy_leaf_index, new_leaf_hash);

    next_snapshot = AppendOnlyTreeSnapshot{ .root = public_data_tree.root(),
                                            .nextAvailableLeafIndex = prev_snapshot.nextAvailableLeafIndex + 1 };

    AppendOnlyTreeSnapshot snapshot_after_dummy_insertion =
        public_data_tree_check_simulator.write(dummy_slot,
                                               contract_address,
                                               dummy_leaf_value,
                                               low_leaf,
                                               low_leaf_index,
                                               low_leaf_sibling_path,
                                               prev_snapshot,
                                               insertion_sibling_path,
                                               false);
    EXPECT_EQ(next_snapshot, snapshot_after_dummy_insertion);

    // Update section

    low_leaf_index = value_to_be_updated_leaf_index;
    prev_snapshot = snapshot_after_dummy_insertion;

    low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(leaf_slot, new_value), 0, 0);
    low_leaf_sibling_path = public_data_tree.get_sibling_path(low_leaf_index);

    updated_low_leaf = low_leaf;
    updated_low_leaf.leaf.value = updated_value;
    updated_low_leaf_hash = UnconstrainedPoseidon2::hash(updated_low_leaf.get_hash_inputs());
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

    ASSERT_LE(test_public_inputs.accumulatedDataArrayLengths.publicDataWrites,
              test_public_inputs.accumulatedData.publicDataWrites.size());

    const auto* public_data_writes_start = test_public_inputs.accumulatedData.publicDataWrites.begin();
    std::vector<PublicDataWrite> public_data_writes(
        public_data_writes_start,
        public_data_writes_start + test_public_inputs.accumulatedDataArrayLengths.publicDataWrites);

    public_data_tree_check_simulator.generate_ff_gt_events_for_squashing(public_data_writes);

    precomputed_builder.process_misc(trace, 1 << 16);
    precomputed_builder.process_sel_range_16(trace);
    public_inputs_builder.process_public_inputs(trace, test_public_inputs);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);
    range_check_builder.process(range_check_emitter.dump_events(), trace);
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);
    public_data_tree_read_builder.process(public_data_tree_check_event_emitter.dump_events(), trace);

    check_relation<public_data_check>(trace);
    check_relation<public_data_squash>(trace);

    check_all_interactions<PublicDataTreeTraceBuilder>(trace);
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

// Negative clock diff decompostion
TEST(PublicDataTreeConstrainingTest, NegativeClockDiffDecomposition)
{
    // Test constraint: CLK_DIFF = clk_diff_lo + 2**16 * clk_diff_hi;
    TestTraceContainer trace({
        {
            { C::public_data_check_not_end, 1 },
            { C::public_data_check_clk, 12 << 28 },
            { C::public_data_check_clk_diff_lo, 234 },
            { C::public_data_check_clk_diff_hi, 1 << 12 },
        },
        {
            { C::public_data_check_clk, (13 << 28) + 234 },
        },
    });

    check_relation<public_data_check>(trace, public_data_check::SR_CLK_DIFF_DECOMP);

    // Mutate wrongly clk_diff_lo
    trace.set(C::public_data_check_clk_diff_lo, 0, trace.get(C::public_data_check_clk_diff_lo, 0) + 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_check>(trace, public_data_check::SR_CLK_DIFF_DECOMP),
                              "CLK_DIFF_DECOMP");

    // Reset
    trace.set(C::public_data_check_clk_diff_lo, 0, trace.get(C::public_data_check_clk_diff_lo, 0) - 1);

    // Mutate wrongly clk_diff_hi
    trace.set(C::public_data_check_clk_diff_hi, 0, trace.get(C::public_data_check_clk_diff_hi, 0) + 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_check>(trace, public_data_check::SR_CLK_DIFF_DECOMP),
                              "CLK_DIFF_DECOMP");
}

// Out of range clock diff
TEST(PublicDataTreeConstrainingTest, NegativeOutOfRangeClockDiff)
{
    TestTraceContainer trace({
        {
            { C::public_data_check_not_end, 1 },
            { C::public_data_check_clk_diff_lo, UINT16_MAX },
            { C::public_data_check_clk_diff_hi, UINT16_MAX },
        },
    });

    PrecomputedTraceBuilder precomputed_trace_builder;
    precomputed_trace_builder.process_sel_range_16(trace);
    precomputed_trace_builder.process_misc(trace, 1 << 16);

    check_interaction<PublicDataTreeTraceBuilder,
                      lookup_public_data_check_clk_diff_range_lo_settings,
                      lookup_public_data_check_clk_diff_range_hi_settings>(trace);

    // Mutate wrongly clk_diff_lo
    trace.set(C::public_data_check_clk_diff_lo, 0, UINT16_MAX + 1);

    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<PublicDataTreeTraceBuilder, lookup_public_data_check_clk_diff_range_lo_settings>(trace)),
        "Failed.*LOOKUP_PUBLIC_DATA_CHECK_CLK_DIFF_RANGE_LO. Could not find tuple in destination.");

    // Mutate wrongly clk_diff_hi
    trace.set(C::public_data_check_clk_diff_hi, 0, UINT16_MAX + 1);

    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<PublicDataTreeTraceBuilder, lookup_public_data_check_clk_diff_range_hi_settings>(trace)),
        "Failed.*LOOKUP_PUBLIC_DATA_CHECK_CLK_DIFF_RANGE_HI. Could not find tuple in destination.");
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

TEST(PublicDataTreeConstrainingTest, SquashingNegativeFinalValuePropagation)
{
    // Test constraint: check_clock * (final_value - final_value') = 0;
    TestTraceContainer trace({ {
                                   { C::public_data_squash_sel, 1 },
                                   { C::public_data_squash_check_clock, 1 },
                                   { C::public_data_squash_final_value, 27 },
                               },
                               {
                                   { C::public_data_squash_sel, 1 },
                                   { C::public_data_squash_check_clock, 0 },
                                   { C::public_data_squash_final_value, 27 },
                               } });

    check_relation<public_data_squash>(trace, public_data_squash::SR_FINAL_VALUE_PROPAGATION);

    // Invalid: if final value changes, check_clk must be 0
    trace.set(C::public_data_squash_final_value, 1, 28);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_squash>(trace, public_data_squash::SR_FINAL_VALUE_PROPAGATION),
                              "FINAL_VALUE_PROPAGATION");
}

TEST(PublicDataTreeConstrainingTest, SquashingNegativeFinalValueCheck)
{
    // Test constraint:
    // LEAF_SLOT_END * (final_value - value) = 0;
    TestTraceContainer trace({ {
                                   { C::public_data_squash_sel, 1 },
                                   { C::public_data_squash_final_value, 27 },
                                   { C::public_data_squash_value, 99 },
                               },
                               {
                                   { C::public_data_squash_sel, 1 },
                                   { C::public_data_squash_final_value, 27 },
                                   { C::public_data_squash_leaf_slot_increase, 1 },
                                   { C::public_data_squash_value, 27 },
                               },
                               {
                                   { C::public_data_squash_sel, 1 },
                                   { C::public_data_squash_final_value, 42 },
                                   { C::public_data_squash_value, 42 },
                               } });

    check_relation<public_data_squash>(trace, public_data_squash::SR_FINAL_VALUE_CHECK);

    // Negative test: if END, value == final_value
    trace.set(C::public_data_squash_value, 2, 99);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_squash>(trace, public_data_squash::SR_FINAL_VALUE_CHECK),
                              "FINAL_VALUE_CHECK");

    trace.set(C::public_data_squash_value, 2, 42);

    // Negative test: if leaf_slot_increase, value == final_value
    trace.set(C::public_data_squash_value, 1, 99);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_squash>(trace, public_data_squash::SR_FINAL_VALUE_CHECK),
                              "FINAL_VALUE_CHECK");
    trace.set(C::public_data_squash_value, 1, 27);
}

TEST(PublicDataTreeConstrainingTest, SquashingNegativeLeafSlotIncrease)
{
    // Test constraint: leaf_slot_increase { leaf_slot', leaf_slot, sel } in ff_gt.sel_gt { ff_gt.a, ff_gt.b,
    // ff_gt.result }
    TestTraceContainer trace({ {
                                   { C::public_data_squash_leaf_slot_increase, 1 },
                                   { C::public_data_squash_leaf_slot, FF::modulus_minus_two },
                                   { C::public_data_squash_sel, 1 },
                               },
                               {
                                   { C::public_data_squash_leaf_slot_increase, 0 },
                                   { C::public_data_squash_leaf_slot, FF::modulus - 1 },
                                   { C::public_data_squash_sel, 1 },
                               } });

    // Corresponding ff_gt values. For this trace we keep the correct result.
    trace.set(0,
              { {
                  { C::ff_gt_sel_gt, 1 },
                  { C::ff_gt_a, FF::modulus - 1 },
                  { C::ff_gt_b, FF::modulus_minus_two },
                  { C::ff_gt_result, 1 },
              } });

    trace.set(1,
              { {
                  { C::ff_gt_sel_gt, 1 },
                  { C::ff_gt_a, FF::modulus_minus_two },
                  { C::ff_gt_b, FF::modulus_minus_two },
                  { C::ff_gt_result, 0 },
              } });

    trace.set(2,
              { {
                  { C::ff_gt_sel_gt, 1 },
                  { C::ff_gt_a, FF::modulus_minus_two },
                  { C::ff_gt_b, FF::modulus - 3 },
                  { C::ff_gt_result, 0 },
              } });

    check_interaction<PublicDataTreeTraceBuilder, lookup_public_data_squash_leaf_slot_increase_ff_gt_settings>(trace);

    // Mutate the second row to be equal to the first row
    trace.set(C::public_data_squash_leaf_slot, 1, FF::modulus_minus_two);

    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<PublicDataTreeTraceBuilder, lookup_public_data_squash_leaf_slot_increase_ff_gt_settings>(
            trace)),
        "Failed.*LOOKUP_PUBLIC_DATA_SQUASH_LEAF_SLOT_INCREASE_FF_GT. Could not find tuple in destination.");

    // Mutate the second row to be smaller than the first row
    trace.set(C::public_data_squash_leaf_slot, 1, FF::modulus - 3);

    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<PublicDataTreeTraceBuilder, lookup_public_data_squash_leaf_slot_increase_ff_gt_settings>(
            trace)),
        "Failed.*LOOKUP_PUBLIC_DATA_SQUASH_LEAF_SLOT_INCREASE_FF_GT. Could not find tuple in destination.");
}

TEST(PublicDataTreeConstrainingTest, SquashingNegativeClockDecomposition)
{
    // Test constraint: CLK_DIFF = clk_diff_lo + 2**16 * clk_diff_hi;
    TestTraceContainer trace({
        {
            { C::public_data_squash_sel, 1 },
            { C::public_data_squash_check_clock, 1 },
            { C::public_data_squash_clk, 1 << 25 },
            { C::public_data_squash_clk_diff_lo, 37 },
            { C::public_data_squash_clk_diff_hi, 12 },
        },
        {
            { C::public_data_squash_sel, 1 },
            { C::public_data_squash_clk, (1 << 25) + (12 << 16) + 37 },
        },
    });

    check_relation<public_data_squash>(trace, public_data_squash::SR_CLK_DIFF_DECOMP);

    // Mutate wrongly clk_diff_lo
    trace.set(C::public_data_squash_clk_diff_lo, 0, trace.get(C::public_data_squash_clk_diff_lo, 0) + 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_squash>(trace, public_data_squash::SR_CLK_DIFF_DECOMP),
                              "CLK_DIFF_DECOMP");

    // Reset
    trace.set(C::public_data_squash_clk_diff_lo, 0, trace.get(C::public_data_squash_clk_diff_lo, 0) - 1);

    // Mutate wrongly clk_diff_hi
    trace.set(C::public_data_squash_clk_diff_hi, 0, trace.get(C::public_data_squash_clk_diff_hi, 0) + 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_squash>(trace, public_data_squash::SR_CLK_DIFF_DECOMP),
                              "CLK_DIFF_DECOMP");
}

// Out of range clk diff
TEST(PublicDataTreeConstrainingTest, SquashingNegativeOutOfRangeClockDiff)
{
    TestTraceContainer trace({
        {
            { C::public_data_squash_sel, 1 },
            { C::public_data_squash_check_clock, 1 },
            { C::public_data_squash_clk, 1 << 25 },
            { C::public_data_squash_clk_diff_lo, UINT16_MAX },
            { C::public_data_squash_clk_diff_hi, UINT16_MAX },
        },
    });

    PrecomputedTraceBuilder precomputed_trace_builder;
    precomputed_trace_builder.process_sel_range_16(trace);
    precomputed_trace_builder.process_misc(trace, 1 << 16);

    check_interaction<PublicDataTreeTraceBuilder,
                      lookup_public_data_squash_clk_diff_range_lo_settings,
                      lookup_public_data_squash_clk_diff_range_hi_settings>(trace);

    // Mutate wrongly clk_diff_lo
    trace.set(C::public_data_squash_clk_diff_lo, 0, UINT16_MAX + 1);

    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<PublicDataTreeTraceBuilder, lookup_public_data_squash_clk_diff_range_lo_settings>(trace)),
        "Failed.*LOOKUP_PUBLIC_DATA_SQUASH_CLK_DIFF_RANGE_LO. Could not find tuple in destination.");

    // Mutate wrongly clk_diff_hi
    trace.set(C::public_data_squash_clk_diff_hi, 0, UINT16_MAX + 1);

    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<PublicDataTreeTraceBuilder, lookup_public_data_squash_clk_diff_range_hi_settings>(trace)),
        "Failed.*LOOKUP_PUBLIC_DATA_SQUASH_CLK_DIFF_RANGE_HI. Could not find tuple in destination.");
}

} // namespace
} // namespace bb::avm2::constraining
