#include "barretenberg/vm2/tracegen/public_data_tree_trace.hpp"

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
#include "barretenberg/vm2/simulation/field_gt.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"
#include "barretenberg/vm2/simulation/public_data_tree_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/testing/public_inputs_builder.hpp"
#include "barretenberg/vm2/testing/test_tree.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/public_inputs_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
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

using FF = AvmFlavorSettings::FF;
using C = Column;
using public_data_check = bb::avm2::public_data_check<FF>;
using poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

using lookup_low_leaf_slot_validation = lookup_public_data_check_low_leaf_slot_validation_relation<FF>;
using lookup_low_leaf_next_slot_validation = lookup_public_data_check_low_leaf_next_slot_validation_relation<FF>;
using lookup_low_leaf_poseidon2_0 = lookup_public_data_check_low_leaf_poseidon2_0_relation<FF>;
using lookup_low_leaf_poseidon2_1 = lookup_public_data_check_low_leaf_poseidon2_1_relation<FF>;
using lookup_updated_low_leaf_poseidon2_0 = lookup_public_data_check_updated_low_leaf_poseidon2_0_relation<FF>;
using lookup_updated_low_leaf_poseidon2_1 = lookup_public_data_check_updated_low_leaf_poseidon2_1_relation<FF>;
using lookup_low_leaf_merkle_check = lookup_public_data_check_low_leaf_merkle_check_relation<FF>;
using lookup_new_leaf_poseidon2_0 = lookup_public_data_check_new_leaf_poseidon2_0_relation<FF>;
using lookup_new_leaf_poseidon2_1 = lookup_public_data_check_new_leaf_poseidon2_1_relation<FF>;
using lookup_new_leaf_merkle_check = lookup_public_data_check_new_leaf_merkle_check_relation<FF>;

AztecAddress contract_address = 1;

struct TestParams {
    FF slot;
    FF value;
    PublicDataTreeLeafPreimage low_leaf;
};

std::vector<TestParams> read_positive_tests = {
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

class PublicDataReadInteractionsTests : public TestWithParam<TestParams> {};

TEST_P(PublicDataReadInteractionsTests, PositiveWithInteractions)
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
    RangeCheckTraceBuilder range_check_builder;
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

    range_check_builder.process(range_check_emitter.dump_events(), trace);
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);
    public_data_tree_read_builder.process(public_data_tree_check_event_emitter.dump_events(), trace);

    constraining::check_all_interactions<PublicDataTreeCheckTraceBuilder>(trace);
}

INSTANTIATE_TEST_SUITE_P(PublicDataTreeCheckTracegenTest,
                         PublicDataReadInteractionsTests,
                         ::testing::ValuesIn(read_positive_tests));

TEST(PublicDataTreeCheckTracegenTest, WriteExistsWithInteractions)
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

    auto test_public_inputs = testing::PublicInputsBuilder().set_accumulated_data(accumulated_data).build();
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
    RangeCheckTraceBuilder range_check_builder;
    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    PrecomputedTraceBuilder precomputed_builder;
    PublicInputsTraceBuilder public_inputs_builder;
    PublicDataTreeCheckTraceBuilder public_data_tree_builder;

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

    precomputed_builder.process_misc(trace, AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);
    public_inputs_builder.process_public_inputs(trace, test_public_inputs);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);
    range_check_builder.process(range_check_emitter.dump_events(), trace);
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);
    public_data_tree_builder.process(public_data_tree_check_event_emitter.dump_events(), trace);

    constraining::check_all_interactions<PublicDataTreeCheckTraceBuilder>(trace);
}

TEST(PublicDataTreeCheckTracegenTest, WriteAndUpdateWithInteractions)
{
    FF slot = 42;
    FF leaf_slot = unconstrained_compute_leaf_slot(contract_address, slot);
    FF new_value = 27; // Will get squashed
    FF updated_value = 28;
    FF low_leaf_slot = 40;
    TestMemoryTree<Poseidon2HashPolicy> public_data_tree(8, PUBLIC_DATA_TREE_HEIGHT);

    AvmAccumulatedData accumulated_data = {};
    accumulated_data.publicDataWrites[0] = PublicDataWrite{
        .leafSlot = leaf_slot,
        .value = updated_value,
    };

    auto test_public_inputs = testing::PublicInputsBuilder().set_accumulated_data(accumulated_data).build();

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
    RangeCheckTraceBuilder range_check_builder;
    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    PrecomputedTraceBuilder precomputed_builder;
    PublicInputsTraceBuilder public_inputs_builder;
    PublicDataTreeCheckTraceBuilder public_data_tree_read_builder;

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

    precomputed_builder.process_misc(trace, AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);
    public_inputs_builder.process_public_inputs(trace, test_public_inputs);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);
    range_check_builder.process(range_check_emitter.dump_events(), trace);
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);
    public_data_tree_read_builder.process(public_data_tree_check_event_emitter.dump_events(), trace);

    constraining::check_all_interactions<PublicDataTreeCheckTraceBuilder>(trace);
}

} // namespace
} // namespace bb::avm2::tracegen
