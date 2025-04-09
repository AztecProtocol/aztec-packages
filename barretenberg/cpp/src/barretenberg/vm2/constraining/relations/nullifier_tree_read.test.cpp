#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cmath>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/merkle_check.hpp"
#include "barretenberg/vm2/generated/relations/nullifier_read.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/nullifier_tree_read_event.hpp"
#include "barretenberg/vm2/simulation/field_gt.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/nullifier_tree_check.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/nullifier_tree_read_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using ::testing::NiceMock;
using ::testing::TestWithParam;

using simulation::EventEmitter;
using simulation::FieldGreaterThan;
using simulation::FieldGreaterThanEvent;
using simulation::MerkleCheck;
using simulation::MerkleCheckEvent;
using simulation::MockRangeCheck;
using simulation::NoopEventEmitter;
using simulation::NullifierTreeCheck;
using simulation::NullifierTreeLeafPreimage;
using simulation::NullifierTreeReadEvent;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::root_from_path;

using tracegen::FieldGreaterThanTraceBuilder;
using tracegen::MerkleCheckTraceBuilder;
using tracegen::NullifierTreeReadTraceBuilder;
using tracegen::Poseidon2TraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using nullifier_read = bb::avm2::nullifier_read<FF>;
using poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

TEST(NullifierTreeReadConstrainingTest, EmptyRow)
{
    check_relation<nullifier_read>(testing::empty_trace());
}

struct TestParams {
    FF nullifier;
    bool exists;
    NullifierTreeLeafPreimage low_leaf;
};

std::vector<TestParams> positive_tests = {
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

    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    NiceMock<MockRangeCheck> range_check;

    EventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<NullifierTreeReadEvent> nullifier_tree_read_event_emitter;
    NullifierTreeCheck nullifier_tree_check_simulator(
        poseidon2, merkle_check, field_gt, nullifier_tree_read_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    NullifierTreeReadTraceBuilder nullifier_tree_read_builder;

    FF low_leaf_hash = poseidon2.hash(param.low_leaf.get_hash_inputs());
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path;
    sibling_path.reserve(NULLIFIER_TREE_HEIGHT);
    for (size_t i = 0; i < NULLIFIER_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }
    FF root = root_from_path(low_leaf_hash, leaf_index, sibling_path);

    nullifier_tree_check_simulator.assert_read(
        param.nullifier, param.exists, param.low_leaf, leaf_index, sibling_path, root);

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);
    nullifier_tree_read_builder.process(nullifier_tree_read_event_emitter.dump_events(), trace);

    check_relation<nullifier_read>(trace);
}

INSTANTIATE_TEST_SUITE_P(NullifierTreeReadConstrainingTest,
                         NullifierReadPositiveTests,
                         ::testing::ValuesIn(positive_tests));

TEST(NullifierTreeReadConstrainingTest, NegativeExistsFlagCheck)
{
    // Test constraint: sel * (NULLIFIER_LOW_LEAF_NULLIFIER_DIFF * (exists * (1 - nullifier_low_leaf_nullifier_diff_inv)
    // + nullifier_low_leaf_nullifier_diff_inv) - 1 + exists) = 0
    TestTraceContainer trace({
        { { C::nullifier_read_sel, 1 },
          { C::nullifier_read_nullifier, 27 },
          { C::nullifier_read_low_leaf_nullifier, 27 },
          { C::nullifier_read_nullifier_low_leaf_nullifier_diff_inv, 0 },
          { C::nullifier_read_exists, 1 } },
        { { C::nullifier_read_sel, 1 },
          { C::nullifier_read_nullifier, 28 },
          { C::nullifier_read_low_leaf_nullifier, 27 },
          { C::nullifier_read_nullifier_low_leaf_nullifier_diff_inv, FF(1).invert() },
          { C::nullifier_read_exists, 0 } },
    });

    check_relation<nullifier_read>(trace, nullifier_read::SR_EXISTS_CHECK);
    trace.set(C::nullifier_read_exists, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<nullifier_read>(trace, nullifier_read::SR_EXISTS_CHECK), "EXISTS_CHECK");
    trace.set(C::nullifier_read_exists, 0, 1);
    trace.set(C::nullifier_read_exists, 1, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<nullifier_read>(trace, nullifier_read::SR_EXISTS_CHECK), "EXISTS_CHECK");
}

TEST(NullifierTreeReadConstrainingTest, NegativeNextSlotIsZero)
{
    // Test constraint: leaf_not_exists * (low_leaf_next_nullifier * (NEXT_NULLIFIER_IS_ZERO * (1 - next_nullifier_inv)
    // + next_nullifier_inv) - 1 + NEXT_NULLIFIER_IS_ZERO) = 0
    TestTraceContainer trace({
        {
            { C::nullifier_read_leaf_not_exists, 1 },
            { C::nullifier_read_low_leaf_next_nullifier, 0 },
            { C::nullifier_read_next_nullifier_inv, 0 },
            { C::nullifier_read_next_nullifier_is_nonzero, 0 },
        },
        {
            { C::nullifier_read_leaf_not_exists, 1 },
            { C::nullifier_read_low_leaf_next_nullifier, 1 },
            { C::nullifier_read_next_nullifier_inv, FF(1).invert() },
            { C::nullifier_read_next_nullifier_is_nonzero, 1 },
        },
    });

    check_relation<nullifier_read>(trace, nullifier_read::SR_NEXT_NULLIFIER_IS_ZERO_CHECK);

    trace.set(C::nullifier_read_next_nullifier_is_nonzero, 0, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<nullifier_read>(trace, nullifier_read::SR_NEXT_NULLIFIER_IS_ZERO_CHECK),
                              "NEXT_NULLIFIER_IS_ZERO_CHECK");

    trace.set(C::nullifier_read_next_nullifier_is_nonzero, 0, 0);
    trace.set(C::nullifier_read_next_nullifier_is_nonzero, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<nullifier_read>(trace, nullifier_read::SR_NEXT_NULLIFIER_IS_ZERO_CHECK),
                              "NEXT_NULLIFIER_IS_ZERO_CHECK");
}

} // namespace
} // namespace bb::avm2::constraining
