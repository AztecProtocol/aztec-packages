#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cmath>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/merkle_check.hpp"
#include "barretenberg/vm2/generated/relations/written_public_data_slots_tree_check.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/written_public_data_slot_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/field_gt.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/simulation/written_public_data_slots_tree_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/testing/test_tree.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"
#include "barretenberg/vm2/tracegen/written_public_data_slots_tree_check_trace.hpp"

namespace bb::avm2::constraining {
namespace {

using ::testing::NiceMock;
using ::testing::TestWithParam;

using testing::TestMemoryTree;

using simulation::EventEmitter;
using simulation::FieldGreaterThan;
using simulation::FieldGreaterThanEvent;
using simulation::MerkleCheck;
using simulation::MerkleCheckEvent;
using simulation::MockRangeCheck;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::unconstrained_compute_leaf_slot;
using simulation::unconstrained_root_from_path;
using simulation::WrittenPublicDataSlotLeafValue;
using simulation::WrittenPublicDataSlotsTreeCheck;
using simulation::WrittenPublicDataSlotsTreeCheckEvent;
using simulation::WrittenPublicDataSlotsTreeLeafPreimage;

using tracegen::FieldGreaterThanTraceBuilder;
using tracegen::MerkleCheckTraceBuilder;
using tracegen::Poseidon2TraceBuilder;
using tracegen::TestTraceContainer;
using tracegen::WrittenPublicDataSlotsTreeCheckTraceBuilder;

using FF = AvmFlavorSettings::FF;
using C = Column;
using written_public_data_slots_tree_check = bb::avm2::written_public_data_slots_tree_check<FF>;
using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

TEST(WrittenPublicDataSlotsTreeCheckConstrainingTest, EmptyRow)
{
    check_relation<written_public_data_slots_tree_check>(testing::empty_trace());
}

struct TestParams {
    FF slot;
    AztecAddress contract_address;
    bool exists;
    WrittenPublicDataSlotsTreeLeafPreimage low_leaf;
};

std::vector<TestParams> positive_read_tests = {
    // Exists = true, leaf pointers to infinity
    TestParams{ .slot = 42,
                .contract_address = 27,
                .exists = true,
                .low_leaf = WrittenPublicDataSlotsTreeLeafPreimage(
                    WrittenPublicDataSlotLeafValue(unconstrained_compute_leaf_slot(27, 42)), 0, 0) },
    // Exists = true, leaf points to higher value
    TestParams{ .slot = 42,
                .contract_address = 27,
                .exists = true,
                .low_leaf = WrittenPublicDataSlotsTreeLeafPreimage(
                    WrittenPublicDataSlotLeafValue(unconstrained_compute_leaf_slot(27, 42)), 28, 50) },
    // Exists = false, low leaf points to infinity
    TestParams{ .slot = 42,
                .contract_address = 27,
                .exists = false,
                .low_leaf = WrittenPublicDataSlotsTreeLeafPreimage(WrittenPublicDataSlotLeafValue(10), 0, 0) },
    // Exists = false, low leaf points to higher value
    TestParams{ .slot = 42,
                .contract_address = 27,
                .exists = false,
                .low_leaf = WrittenPublicDataSlotsTreeLeafPreimage(
                    WrittenPublicDataSlotLeafValue(10), 28, unconstrained_compute_leaf_slot(27, 42) + 1) }
};

class WrittenPublicDataSlotsReadPositiveTests : public TestWithParam<TestParams> {};

TEST_P(WrittenPublicDataSlotsReadPositiveTests, Positive)
{
    const auto& param = GetParam();

    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    NiceMock<MockRangeCheck> range_check;

    EventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<WrittenPublicDataSlotsTreeCheckEvent> written_public_data_slots_tree_check_event_emitter;
    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check_simulator(
        poseidon2, merkle_check, field_gt, written_public_data_slots_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });

    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    WrittenPublicDataSlotsTreeCheckTraceBuilder written_public_data_slots_tree_check_builder;

    FF low_leaf_hash = poseidon2.hash(param.low_leaf.get_hash_inputs());
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path;
    sibling_path.reserve(AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_HEIGHT);
    for (size_t i = 0; i < AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }
    FF root = unconstrained_root_from_path(low_leaf_hash, leaf_index, sibling_path);

    written_public_data_slots_tree_check_simulator.assert_read(
        param.slot,
        param.contract_address,
        param.exists,
        param.low_leaf,
        leaf_index,
        sibling_path,
        AppendOnlyTreeSnapshot{ .root = root, .nextAvailableLeafIndex = 37 });

    written_public_data_slots_tree_check_builder.process(
        written_public_data_slots_tree_check_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), 1);

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);

    check_relation<written_public_data_slots_tree_check>(trace);
    check_all_interactions<WrittenPublicDataSlotsTreeCheckTraceBuilder>(trace);
}

INSTANTIATE_TEST_SUITE_P(WrittenPublicDataSlotsTreeCheckConstrainingTest,
                         WrittenPublicDataSlotsReadPositiveTests,
                         ::testing::ValuesIn(positive_read_tests));

TEST(WrittenPublicDataSlotsTreeCheckConstrainingTest, PositiveWriteAppend)
{
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    NiceMock<MockRangeCheck> range_check;

    EventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<WrittenPublicDataSlotsTreeCheckEvent> written_public_data_slots_tree_check_event_emitter;
    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check_simulator(
        poseidon2, merkle_check, field_gt, written_public_data_slots_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });

    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    WrittenPublicDataSlotsTreeCheckTraceBuilder written_public_data_slots_tree_check_builder;

    FF slot = 100;
    AztecAddress contract_address = 27;
    FF leaf_slot = unconstrained_compute_leaf_slot(contract_address, slot);
    FF low_slot = 40;
    TestMemoryTree<Poseidon2HashPolicy> written_public_data_slots_tree(AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_HEIGHT,
                                                                       AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_HEIGHT);

    WrittenPublicDataSlotsTreeLeafPreimage low_leaf =
        WrittenPublicDataSlotsTreeLeafPreimage(WrittenPublicDataSlotLeafValue(low_slot), 10, leaf_slot + 1);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 1;
    written_public_data_slots_tree.update_element(low_leaf_index, low_leaf_hash);

    AppendOnlyTreeSnapshot prev_snapshot =
        AppendOnlyTreeSnapshot{ .root = written_public_data_slots_tree.root(), .nextAvailableLeafIndex = 37 };
    std::vector<FF> low_leaf_sibling_path = written_public_data_slots_tree.get_sibling_path(low_leaf_index);

    WrittenPublicDataSlotsTreeLeafPreimage updated_low_leaf = low_leaf;
    updated_low_leaf.nextIndex = prev_snapshot.nextAvailableLeafIndex;
    updated_low_leaf.nextKey = leaf_slot;
    FF updated_low_leaf_hash = RawPoseidon2::hash(updated_low_leaf.get_hash_inputs());
    written_public_data_slots_tree.update_element(low_leaf_index, updated_low_leaf_hash);

    std::vector<FF> insertion_sibling_path =
        written_public_data_slots_tree.get_sibling_path(prev_snapshot.nextAvailableLeafIndex);

    WrittenPublicDataSlotsTreeLeafPreimage new_leaf = WrittenPublicDataSlotsTreeLeafPreimage(
        WrittenPublicDataSlotLeafValue(leaf_slot), low_leaf.nextIndex, low_leaf.nextKey);
    FF new_leaf_hash = RawPoseidon2::hash(new_leaf.get_hash_inputs());
    written_public_data_slots_tree.update_element(prev_snapshot.nextAvailableLeafIndex, new_leaf_hash);

    written_public_data_slots_tree_check_simulator.upsert(
        slot, contract_address, low_leaf, low_leaf_index, low_leaf_sibling_path, prev_snapshot, insertion_sibling_path);

    written_public_data_slots_tree_check_builder.process(
        written_public_data_slots_tree_check_event_emitter.dump_events(), trace);

    EXPECT_EQ(trace.get_num_rows(), 1);

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);

    check_relation<written_public_data_slots_tree_check>(trace);
    check_all_interactions<WrittenPublicDataSlotsTreeCheckTraceBuilder>(trace);
}

TEST(WrittenPublicDataSlotsTreeCheckConstrainingTest, PositiveWriteMembership)
{
    FF slot = 42;
    AztecAddress contract_address = 27;
    FF leaf_slot = unconstrained_compute_leaf_slot(contract_address, slot);
    auto low_leaf = WrittenPublicDataSlotsTreeLeafPreimage(WrittenPublicDataSlotLeafValue(leaf_slot), 0, 0);
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    NiceMock<MockRangeCheck> range_check;

    EventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<WrittenPublicDataSlotsTreeCheckEvent> written_public_data_slots_tree_check_event_emitter;
    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check_simulator(
        poseidon2, merkle_check, field_gt, written_public_data_slots_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });

    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    WrittenPublicDataSlotsTreeCheckTraceBuilder written_public_data_slots_tree_check_builder;

    FF low_leaf_hash = poseidon2.hash(low_leaf.get_hash_inputs());
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path;
    sibling_path.reserve(AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_HEIGHT);
    for (size_t i = 0; i < AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }
    FF root = unconstrained_root_from_path(low_leaf_hash, leaf_index, sibling_path);

    written_public_data_slots_tree_check_simulator.upsert(
        slot,
        contract_address,
        low_leaf,
        leaf_index,
        sibling_path,
        AppendOnlyTreeSnapshot{ .root = root, .nextAvailableLeafIndex = 37 },
        /* insertion_sibling_path */ std::vector<FF>());

    written_public_data_slots_tree_check_builder.process(
        written_public_data_slots_tree_check_event_emitter.dump_events(), trace);

    EXPECT_EQ(trace.get_num_rows(), 1);

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);

    check_relation<written_public_data_slots_tree_check>(trace);
    check_all_interactions<WrittenPublicDataSlotsTreeCheckTraceBuilder>(trace);
}

TEST(WrittenPublicDataSlotsTreeCheckConstrainingTest, NegativeExistsFlagCheck)
{
    // Test constraint: sel * (SLOT_LOW_LEAF_SLOT_DIFF * (exists * (1 - slot_low_leaf_slot_diff_inv)
    // + slot_low_leaf_slot_diff_inv) - 1 + exists) = 0
    TestTraceContainer trace({
        { { C::written_public_data_slots_tree_check_sel, 1 },
          { C::written_public_data_slots_tree_check_leaf_slot, 27 },
          { C::written_public_data_slots_tree_check_low_leaf_slot, 27 },
          { C::written_public_data_slots_tree_check_slot_low_leaf_slot_diff_inv, 0 },
          { C::written_public_data_slots_tree_check_exists, 1 } },
        { { C::written_public_data_slots_tree_check_sel, 1 },
          { C::written_public_data_slots_tree_check_leaf_slot, 28 },
          { C::written_public_data_slots_tree_check_low_leaf_slot, 27 },
          { C::written_public_data_slots_tree_check_slot_low_leaf_slot_diff_inv, FF(1).invert() },
          { C::written_public_data_slots_tree_check_exists, 0 } },
    });

    check_relation<written_public_data_slots_tree_check>(trace, written_public_data_slots_tree_check::SR_EXISTS_CHECK);
    trace.set(C::written_public_data_slots_tree_check_exists, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<written_public_data_slots_tree_check>(
                                  trace, written_public_data_slots_tree_check::SR_EXISTS_CHECK),
                              "EXISTS_CHECK");
    trace.set(C::written_public_data_slots_tree_check_exists, 0, 1);
    trace.set(C::written_public_data_slots_tree_check_exists, 1, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<written_public_data_slots_tree_check>(
                                  trace, written_public_data_slots_tree_check::SR_EXISTS_CHECK),
                              "EXISTS_CHECK");
}

TEST(WrittenPublicDataSlotsTreeCheckConstrainingTest, NegativeNextSlotIsZero)
{
    // Test constraint: leaf_not_exists * (low_leaf_next_slot * (NEXT_SLOT_IS_ZERO * (1 - next_slot_inv)
    // + next_slot_inv) - 1 + NEXT_SLOT_IS_ZERO) = 0
    TestTraceContainer trace({
        {
            { C::written_public_data_slots_tree_check_leaf_not_exists, 1 },
            { C::written_public_data_slots_tree_check_low_leaf_next_slot, 0 },
            { C::written_public_data_slots_tree_check_next_slot_inv, 0 },
            { C::written_public_data_slots_tree_check_next_slot_is_nonzero, 0 },
        },
        {
            { C::written_public_data_slots_tree_check_leaf_not_exists, 1 },
            { C::written_public_data_slots_tree_check_low_leaf_next_slot, 1 },
            { C::written_public_data_slots_tree_check_next_slot_inv, FF(1).invert() },
            { C::written_public_data_slots_tree_check_next_slot_is_nonzero, 1 },
        },
    });

    check_relation<written_public_data_slots_tree_check>(
        trace, written_public_data_slots_tree_check::SR_NEXT_SLOT_IS_ZERO_CHECK);

    trace.set(C::written_public_data_slots_tree_check_next_slot_is_nonzero, 0, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<written_public_data_slots_tree_check>(
                                  trace, written_public_data_slots_tree_check::SR_NEXT_SLOT_IS_ZERO_CHECK),
                              "NEXT_SLOT_IS_ZERO_CHECK");

    trace.set(C::written_public_data_slots_tree_check_next_slot_is_nonzero, 0, 0);
    trace.set(C::written_public_data_slots_tree_check_next_slot_is_nonzero, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<written_public_data_slots_tree_check>(
                                  trace, written_public_data_slots_tree_check::SR_NEXT_SLOT_IS_ZERO_CHECK),
                              "NEXT_SLOT_IS_ZERO_CHECK");
}

} // namespace
} // namespace bb::avm2::constraining
