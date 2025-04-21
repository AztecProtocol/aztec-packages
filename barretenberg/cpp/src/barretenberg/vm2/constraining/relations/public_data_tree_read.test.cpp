#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cmath>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/merkle_check.hpp"
#include "barretenberg/vm2/generated/relations/public_data_read.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/public_data_tree_read_event.hpp"
#include "barretenberg/vm2/simulation/field_gt.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"
#include "barretenberg/vm2/simulation/public_data_tree_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/public_data_tree_read_trace.hpp"
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
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::PublicDataTreeCheck;
using simulation::PublicDataTreeLeafPreimage;
using simulation::PublicDataTreeReadEvent;
using simulation::root_from_path;

using tracegen::FieldGreaterThanTraceBuilder;
using tracegen::MerkleCheckTraceBuilder;
using tracegen::Poseidon2TraceBuilder;
using tracegen::PublicDataTreeReadTraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using public_data_read = bb::avm2::public_data_read<FF>;
using poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
using PublicDataLeafValue = crypto::merkle_tree::PublicDataLeafValue;

TEST(PublicDataTreeReadConstrainingTest, EmptyRow)
{
    check_relation<public_data_read>(testing::empty_trace());
}

struct TestParams {
    FF leaf_slot;
    FF value;
    PublicDataTreeLeafPreimage low_leaf;
};

std::vector<TestParams> positive_tests = {
    // Exists = true, leaf pointers to infinity
    TestParams{
        .leaf_slot = 42, .value = 27, .low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(42, 27), 0, 0) },
    // Exists = true, leaf points to higher value
    TestParams{
        .leaf_slot = 42, .value = 27, .low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(42, 27), 28, 50) },
    // Exists = false, low leaf points to infinity
    TestParams{ .leaf_slot = 42, .value = 0, .low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(10, 0), 0, 0) },
    // Exists = false, low leaf points to higher value
    TestParams{
        .leaf_slot = 42, .value = 0, .low_leaf = PublicDataTreeLeafPreimage(PublicDataLeafValue(10, 0), 28, 50) }
};

class PublicDataReadPositiveTests : public TestWithParam<TestParams> {};

TEST_P(PublicDataReadPositiveTests, Positive)
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

    EventEmitter<PublicDataTreeReadEvent> public_data_tree_read_event_emitter;
    PublicDataTreeCheck public_data_tree_check_simulator(
        poseidon2, merkle_check, field_gt, public_data_tree_read_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    PublicDataTreeReadTraceBuilder public_data_tree_read_builder;

    FF low_leaf_hash = poseidon2.hash(param.low_leaf.get_hash_inputs());
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path;
    sibling_path.reserve(PUBLIC_DATA_TREE_HEIGHT);
    for (size_t i = 0; i < PUBLIC_DATA_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }
    FF root = root_from_path(low_leaf_hash, leaf_index, sibling_path);

    public_data_tree_check_simulator.assert_read(
        param.leaf_slot, param.value, param.low_leaf, leaf_index, sibling_path, root);

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);
    public_data_tree_read_builder.process(public_data_tree_read_event_emitter.dump_events(), trace);

    check_relation<public_data_read>(trace);
}

INSTANTIATE_TEST_SUITE_P(PublicDataTreeReadConstrainingTest,
                         PublicDataReadPositiveTests,
                         ::testing::ValuesIn(positive_tests));

TEST(PublicDataTreeReadConstrainingTest, NegativeExistsFlagCheck)
{
    // Test constraint: sel * (SLOT_LOW_LEAF_SLOT_DIFF * (LEAF_EXISTS * (1 - slot_low_leaf_slot_diff_inv) +
    // slot_low_leaf_slot_diff_inv) - 1 + LEAF_EXISTS) = 0
    TestTraceContainer trace({
        { { C::public_data_read_sel, 1 },
          { C::public_data_read_slot, 27 },
          { C::public_data_read_low_leaf_slot, 27 },
          { C::public_data_read_slot_low_leaf_slot_diff_inv, 0 },
          { C::public_data_read_leaf_not_exists, 0 } },
        { { C::public_data_read_sel, 1 },
          { C::public_data_read_slot, 28 },
          { C::public_data_read_low_leaf_slot, 27 },
          { C::public_data_read_slot_low_leaf_slot_diff_inv, FF(1).invert() },
          { C::public_data_read_leaf_not_exists, 1 } },
    });

    check_relation<public_data_read>(trace, public_data_read::SR_EXISTS_FLAG_CHECK);

    trace.set(C::public_data_read_leaf_not_exists, 0, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_read>(trace, public_data_read::SR_EXISTS_FLAG_CHECK),
                              "EXISTS_FLAG_CHECK");

    trace.set(C::public_data_read_leaf_not_exists, 0, 0);
    trace.set(C::public_data_read_leaf_not_exists, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_read>(trace, public_data_read::SR_EXISTS_FLAG_CHECK),
                              "EXISTS_FLAG_CHECK");
}

TEST(PublicDataTreeReadConstrainingTest, NegativeNextSlotIsZero)
{
    // Test constraint: leaf_not_exists * (low_leaf_next_slot * (NEXT_SLOT_IS_ZERO * (1 - next_slot_inv) +
    // next_slot_inv) - 1 + NEXT_SLOT_IS_ZERO) = 0
    TestTraceContainer trace({
        {
            { C::public_data_read_leaf_not_exists, 1 },
            { C::public_data_read_low_leaf_next_slot, 0 },
            { C::public_data_read_next_slot_inv, 0 },
            { C::public_data_read_next_slot_is_nonzero, 0 },
        },
        {
            { C::public_data_read_leaf_not_exists, 1 },
            { C::public_data_read_low_leaf_next_slot, 1 },
            { C::public_data_read_next_slot_inv, FF(1).invert() },
            { C::public_data_read_next_slot_is_nonzero, 1 },
        },
    });

    check_relation<public_data_read>(trace, public_data_read::SR_NEXT_SLOT_IS_ZERO_CHECK);

    trace.set(C::public_data_read_next_slot_is_nonzero, 0, 1);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_read>(trace, public_data_read::SR_NEXT_SLOT_IS_ZERO_CHECK),
                              "NEXT_SLOT_IS_ZERO_CHECK");

    trace.set(C::public_data_read_next_slot_is_nonzero, 0, 0);
    trace.set(C::public_data_read_next_slot_is_nonzero, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_read>(trace, public_data_read::SR_NEXT_SLOT_IS_ZERO_CHECK),
                              "NEXT_SLOT_IS_ZERO_CHECK");
}

TEST(PublicDataTreeReadConstrainingTest, NegativeValueIsCorrect)
{
    // Test constraint: leaf_not_exists * (low_leaf_next_slot * (NEXT_SLOT_IS_ZERO * (1 - next_slot_inv) +
    // next_slot_inv) - 1 + NEXT_SLOT_IS_ZERO) = 0
    TestTraceContainer trace({
        {
            { C::public_data_read_low_leaf_value, 27 },
            { C::public_data_read_leaf_not_exists, 0 },
            { C::public_data_read_value, 27 },
        },
        {
            { C::public_data_read_low_leaf_value, 27 },
            { C::public_data_read_leaf_not_exists, 1 },
            { C::public_data_read_value, 0 },
        },
    });

    check_relation<public_data_read>(trace, public_data_read::SR_VALUE_IS_CORRECT);

    // Invalid, if leaf exists, the value should be the low leaf value
    trace.set(C::public_data_read_value, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_read>(trace, public_data_read::SR_VALUE_IS_CORRECT),
                              "VALUE_IS_CORRECT");

    trace.set(C::public_data_read_value, 0, 27);
    // Invalid, if leaf does not exists, the value should be zero
    trace.set(C::public_data_read_value, 1, 27);

    EXPECT_THROW_WITH_MESSAGE(check_relation<public_data_read>(trace, public_data_read::SR_VALUE_IS_CORRECT),
                              "VALUE_IS_CORRECT");
}

} // namespace
} // namespace bb::avm2::constraining
