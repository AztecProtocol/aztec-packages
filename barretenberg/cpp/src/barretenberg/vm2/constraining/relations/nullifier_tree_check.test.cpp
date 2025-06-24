#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cmath>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/merkle_check.hpp"
#include "barretenberg/vm2/generated/relations/nullifier_check.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/nullifier_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/field_gt.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/nullifier_tree_check.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/testing/test_tree.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/nullifier_tree_check_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

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
using simulation::NoopEventEmitter;
using simulation::NullifierTreeCheck;
using simulation::NullifierTreeCheckEvent;
using simulation::NullifierTreeLeafPreimage;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::root_from_path;

using tracegen::NullifierTreeCheckTraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using nullifier_check = bb::avm2::nullifier_check<FF>;
using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

TEST(NullifierTreeCheckConstrainingTest, EmptyRow)
{
    check_relation<nullifier_check>(testing::empty_trace());
}

struct TestParams {
    FF nullifier;
    bool exists;
    NullifierTreeLeafPreimage low_leaf;
};

std::vector<TestParams> positive_read_tests = {
    // Exists = true, leaf pointers to infinity
    TestParams{ .nullifier = 42, .exists = true, .low_leaf = NullifierTreeLeafPreimage(NullifierLeafValue(42), 0, 0) },
    // Exists = true, leaf points to higher value
    TestParams{
        .nullifier = 42, .exists = true, .low_leaf = NullifierTreeLeafPreimage(NullifierLeafValue(42), 28, 50) },
    // Exists = false, low leaf points to infinity
    TestParams{ .nullifier = 42, .exists = false, .low_leaf = NullifierTreeLeafPreimage(NullifierLeafValue(10), 0, 0) },
    // Exists = false, low leaf points to higher value
    TestParams{
        .nullifier = 42, .exists = false, .low_leaf = NullifierTreeLeafPreimage(NullifierLeafValue(10), 28, 50) }
};

class NullifierReadPositiveTests : public TestWithParam<TestParams> {};

TEST_P(NullifierReadPositiveTests, Positive)
{
    const auto& param = GetParam();

    NoopEventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    NoopEventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    NiceMock<MockRangeCheck> range_check;

    NoopEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<NullifierTreeCheckEvent> nullifier_tree_check_event_emitter;
    NullifierTreeCheck nullifier_tree_check_simulator(
        poseidon2, merkle_check, field_gt, nullifier_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    NullifierTreeCheckTraceBuilder nullifier_tree_check_builder;

    FF low_leaf_hash = poseidon2.hash(param.low_leaf.get_hash_inputs());
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path;
    sibling_path.reserve(NULLIFIER_TREE_HEIGHT);
    for (size_t i = 0; i < NULLIFIER_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }
    FF root = root_from_path(low_leaf_hash, leaf_index, sibling_path);

    nullifier_tree_check_simulator.assert_read(param.nullifier,
                                               param.exists,
                                               param.low_leaf,
                                               leaf_index,
                                               sibling_path,
                                               AppendOnlyTreeSnapshot{ .root = root, .nextAvailableLeafIndex = 128 });

    nullifier_tree_check_builder.process(nullifier_tree_check_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), 1);

    check_relation<nullifier_check>(trace);
}

INSTANTIATE_TEST_SUITE_P(NullifierTreeCheckConstrainingTest,
                         NullifierReadPositiveTests,
                         ::testing::ValuesIn(positive_read_tests));

TEST(NullifierTreeCheckConstrainingTest, PositiveWriteAppend)
{
    NoopEventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    NoopEventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    NiceMock<MockRangeCheck> range_check;

    NoopEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<NullifierTreeCheckEvent> nullifier_tree_check_event_emitter;
    NullifierTreeCheck nullifier_tree_check_simulator(
        poseidon2, merkle_check, field_gt, nullifier_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    NullifierTreeCheckTraceBuilder nullifier_tree_check_builder;

    FF nullifier = 100;
    FF low_nullifier = 40;
    TestMemoryTree<Poseidon2HashPolicy> nullifier_tree(8, NULLIFIER_TREE_HEIGHT);

    NullifierTreeLeafPreimage low_leaf =
        NullifierTreeLeafPreimage(NullifierLeafValue(low_nullifier), 10, nullifier + 1);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 0;
    nullifier_tree.update_element(low_leaf_index, low_leaf_hash);

    AppendOnlyTreeSnapshot prev_snapshot =
        AppendOnlyTreeSnapshot{ .root = nullifier_tree.root(), .nextAvailableLeafIndex = 128 };
    std::vector<FF> low_leaf_sibling_path = nullifier_tree.get_sibling_path(low_leaf_index);

    NullifierTreeLeafPreimage updated_low_leaf = low_leaf;
    updated_low_leaf.nextIndex = prev_snapshot.nextAvailableLeafIndex;
    updated_low_leaf.nextKey = nullifier;
    FF updated_low_leaf_hash = RawPoseidon2::hash(updated_low_leaf.get_hash_inputs());
    nullifier_tree.update_element(low_leaf_index, updated_low_leaf_hash);

    std::vector<FF> insertion_sibling_path = nullifier_tree.get_sibling_path(prev_snapshot.nextAvailableLeafIndex);

    NullifierTreeLeafPreimage new_leaf =
        NullifierTreeLeafPreimage(NullifierLeafValue(nullifier), low_leaf.nextIndex, low_leaf.nextKey);
    FF new_leaf_hash = RawPoseidon2::hash(new_leaf.get_hash_inputs());
    nullifier_tree.update_element(prev_snapshot.nextAvailableLeafIndex, new_leaf_hash);

    nullifier_tree_check_simulator.write(nullifier,
                                         /*contract_address*/ std::nullopt,
                                         0,
                                         low_leaf,
                                         low_leaf_index,
                                         low_leaf_sibling_path,
                                         prev_snapshot,
                                         insertion_sibling_path);

    nullifier_tree_check_builder.process(nullifier_tree_check_event_emitter.dump_events(), trace);

    EXPECT_EQ(trace.get_num_rows(), 1);

    check_relation<nullifier_check>(trace);
}

TEST(NullifierTreeCheckConstrainingTest, PositiveWriteMembership)
{
    FF nullifier = 42;
    auto low_leaf = NullifierTreeLeafPreimage(NullifierLeafValue(42), 0, 0);
    NoopEventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    NoopEventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    NiceMock<MockRangeCheck> range_check;

    NoopEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<NullifierTreeCheckEvent> nullifier_tree_check_event_emitter;
    NullifierTreeCheck nullifier_tree_check_simulator(
        poseidon2, merkle_check, field_gt, nullifier_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    NullifierTreeCheckTraceBuilder nullifier_tree_check_builder;

    FF low_leaf_hash = poseidon2.hash(low_leaf.get_hash_inputs());
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path;
    sibling_path.reserve(NULLIFIER_TREE_HEIGHT);
    for (size_t i = 0; i < NULLIFIER_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }
    FF root = root_from_path(low_leaf_hash, leaf_index, sibling_path);

    nullifier_tree_check_simulator.write(nullifier,
                                         std::nullopt,
                                         10,
                                         low_leaf,
                                         leaf_index,
                                         sibling_path,
                                         AppendOnlyTreeSnapshot{ .root = root, .nextAvailableLeafIndex = 128 },
                                         /* insertion_sibling_path */ std::nullopt);

    nullifier_tree_check_builder.process(nullifier_tree_check_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), 1);

    check_relation<nullifier_check>(trace);
}

TEST(NullifierTreeCheckConstrainingTest, Siloing)
{
    AztecAddress contract_address = 1;
    FF nullifier = 42;
    FF siloed_nullifier = simulation::silo_nullifier(contract_address, nullifier);
    auto low_leaf = NullifierTreeLeafPreimage(NullifierLeafValue(siloed_nullifier), 0, 0);
    NoopEventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    NoopEventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    NiceMock<MockRangeCheck> range_check;

    NoopEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<NullifierTreeCheckEvent> nullifier_tree_check_event_emitter;
    NullifierTreeCheck nullifier_tree_check_simulator(
        poseidon2, merkle_check, field_gt, nullifier_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    NullifierTreeCheckTraceBuilder nullifier_tree_check_builder;

    FF low_leaf_hash = poseidon2.hash(low_leaf.get_hash_inputs());
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path;
    sibling_path.reserve(NULLIFIER_TREE_HEIGHT);
    for (size_t i = 0; i < NULLIFIER_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }
    FF root = root_from_path(low_leaf_hash, leaf_index, sibling_path);

    nullifier_tree_check_simulator.write(nullifier,
                                         contract_address,
                                         10,
                                         low_leaf,
                                         leaf_index,
                                         sibling_path,
                                         AppendOnlyTreeSnapshot{ .root = root, .nextAvailableLeafIndex = 128 },
                                         /* insertion_sibling_path */ std::nullopt);

    nullifier_tree_check_builder.process(nullifier_tree_check_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), 1);

    check_relation<nullifier_check>(trace);
}

TEST(NullifierTreeCheckConstrainingTest, NegativeExistsFlagCheck)
{
    // Test constraint: sel * (NULLIFIER_LOW_LEAF_NULLIFIER_DIFF * (exists * (1 - nullifier_low_leaf_nullifier_diff_inv)
    // + nullifier_low_leaf_nullifier_diff_inv) - 1 + exists) = 0
    TestTraceContainer trace({
        { { C::nullifier_check_sel, 1 },
          { C::nullifier_check_siloed_nullifier, 27 },
          { C::nullifier_check_low_leaf_nullifier, 27 },
          { C::nullifier_check_nullifier_low_leaf_nullifier_diff_inv, 0 },
          { C::nullifier_check_exists, 1 } },
        { { C::nullifier_check_sel, 1 },
          { C::nullifier_check_siloed_nullifier, 28 },
          { C::nullifier_check_low_leaf_nullifier, 27 },
          { C::nullifier_check_nullifier_low_leaf_nullifier_diff_inv, FF(1).invert() },
          { C::nullifier_check_exists, 0 } },
    });

    check_relation<nullifier_check>(trace, nullifier_check::SR_EXISTS_CHECK);
    trace.set(C::nullifier_check_exists, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<nullifier_check>(trace, nullifier_check::SR_EXISTS_CHECK), "EXISTS_CHECK");
    trace.set(C::nullifier_check_exists, 0, 1);
    trace.set(C::nullifier_check_exists, 1, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<nullifier_check>(trace, nullifier_check::SR_EXISTS_CHECK), "EXISTS_CHECK");
}

TEST(NullifierTreeCheckConstrainingTest, NegativeNextSlotIsZero)
{
    // Test constraint: leaf_not_exists * (low_leaf_next_nullifier * (NEXT_NULLIFIER_IS_ZERO * (1 - next_nullifier_inv)
    // + next_nullifier_inv) - 1 + NEXT_NULLIFIER_IS_ZERO) = 0
    TestTraceContainer trace({
        {
            { C::nullifier_check_leaf_not_exists, 1 },
            { C::nullifier_check_low_leaf_next_nullifier, 0 },
            { C::nullifier_check_next_nullifier_inv, 0 },
            { C::nullifier_check_next_nullifier_is_nonzero, 0 },
        },
        {
            { C::nullifier_check_leaf_not_exists, 1 },
            { C::nullifier_check_low_leaf_next_nullifier, 1 },
            { C::nullifier_check_next_nullifier_inv, FF(1).invert() },
            { C::nullifier_check_next_nullifier_is_nonzero, 1 },
        },
    });

    check_relation<nullifier_check>(trace, nullifier_check::SR_NEXT_NULLIFIER_IS_ZERO_CHECK);

    trace.set(C::nullifier_check_next_nullifier_is_nonzero, 0, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<nullifier_check>(trace, nullifier_check::SR_NEXT_NULLIFIER_IS_ZERO_CHECK),
                              "NEXT_NULLIFIER_IS_ZERO_CHECK");

    trace.set(C::nullifier_check_next_nullifier_is_nonzero, 0, 0);
    trace.set(C::nullifier_check_next_nullifier_is_nonzero, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<nullifier_check>(trace, nullifier_check::SR_NEXT_NULLIFIER_IS_ZERO_CHECK),
                              "NEXT_NULLIFIER_IS_ZERO_CHECK");
}

TEST(NullifierTreeCheckConstrainingTest, NegativePassthrougSiloing)
{
    // Test constraint: sel * (1 - should_silo) * (nullifier - siloed_nullifier) = 0;
    TestTraceContainer trace({
        {
            { C::nullifier_check_sel, 1 },
            { C::nullifier_check_should_silo, 1 },
            { C::nullifier_check_nullifier, 27 },
            { C::nullifier_check_siloed_nullifier, 42 },
        },
        {
            { C::nullifier_check_sel, 1 },
            { C::nullifier_check_should_silo, 0 },
            { C::nullifier_check_nullifier, 27 },
            { C::nullifier_check_siloed_nullifier, 27 },
        },
    });

    check_relation<nullifier_check>(trace, nullifier_check::SR_PASSTHROUGH_SILOING);

    trace.set(C::nullifier_check_siloed_nullifier, 1, 28);

    EXPECT_THROW_WITH_MESSAGE(check_relation<nullifier_check>(trace, nullifier_check::SR_PASSTHROUGH_SILOING),
                              "PASSTHROUGH_SILOING");
}

} // namespace
} // namespace bb::avm2::constraining
