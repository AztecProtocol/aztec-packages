#include "barretenberg/vm2/tracegen/nullifier_tree_check_trace.hpp"

#include <cmath>
#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_nullifier_check.hpp"
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
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
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
using simulation::unconstrained_root_from_path;

using constraining::check_interaction;

using FF = AvmFlavorSettings::FF;
using C = Column;
using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
using NullifierLeafValue = crypto::merkle_tree::NullifierLeafValue;

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

class NullifierReadInteractionsTests : public TestWithParam<TestParams> {};

TEST_P(NullifierReadInteractionsTests, PositiveWithInteractions)
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

    EventEmitter<NullifierTreeCheckEvent> nullifier_tree_check_event_emitter;
    NullifierTreeCheck nullifier_tree_check_simulator(
        poseidon2, merkle_check, field_gt, nullifier_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    NullifierTreeCheckTraceBuilder nullifier_tree_check_builder;

    FF low_leaf_hash = poseidon2.hash(param.low_leaf.get_hash_inputs());
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path;
    sibling_path.reserve(NULLIFIER_TREE_HEIGHT);
    for (size_t i = 0; i < NULLIFIER_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }
    FF root = unconstrained_root_from_path(low_leaf_hash, leaf_index, sibling_path);

    nullifier_tree_check_simulator.assert_read(param.nullifier,
                                               /*contract_address*/ std::nullopt,
                                               param.exists,
                                               param.low_leaf,
                                               leaf_index,
                                               sibling_path,
                                               AppendOnlyTreeSnapshot{ .root = root });

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);
    nullifier_tree_check_builder.process(nullifier_tree_check_event_emitter.dump_events(), trace);

    check_interaction<NullifierTreeCheckTraceBuilder,
                      lookup_nullifier_check_silo_poseidon2_settings,
                      lookup_nullifier_check_low_leaf_poseidon2_settings,
                      lookup_nullifier_check_updated_low_leaf_poseidon2_settings,
                      lookup_nullifier_check_low_leaf_merkle_check_settings,
                      lookup_nullifier_check_low_leaf_nullifier_validation_settings,
                      lookup_nullifier_check_low_leaf_next_nullifier_validation_settings,
                      lookup_nullifier_check_new_leaf_poseidon2_settings,
                      lookup_nullifier_check_new_leaf_merkle_check_settings>(trace);
}

INSTANTIATE_TEST_SUITE_P(NullifierTreeCheckTracegenTest,
                         NullifierReadInteractionsTests,
                         ::testing::ValuesIn(positive_read_tests));

TEST(NullifierTreeCheckTracegenTest, WriteWithInteractions)
{
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    NiceMock<MockRangeCheck> range_check;

    EventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<NullifierTreeCheckEvent> nullifier_tree_check_event_emitter;
    NullifierTreeCheck nullifier_tree_check_simulator(
        poseidon2, merkle_check, field_gt, nullifier_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    NullifierTreeCheckTraceBuilder nullifier_tree_check_builder;

    AztecAddress contract_address = AztecAddress(1);
    FF nullifier = 100;
    FF siloed_nullifier = simulation::unconstrained_silo_nullifier(contract_address, nullifier);
    FF low_nullifier = 40;
    TestMemoryTree<Poseidon2HashPolicy> nullifier_tree(8, NULLIFIER_TREE_HEIGHT);

    NullifierTreeLeafPreimage low_leaf =
        NullifierTreeLeafPreimage(NullifierLeafValue(low_nullifier), 10, siloed_nullifier + 1);
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 0;
    nullifier_tree.update_element(low_leaf_index, low_leaf_hash);

    AppendOnlyTreeSnapshot prev_snapshot =
        AppendOnlyTreeSnapshot{ .root = nullifier_tree.root(), .nextAvailableLeafIndex = 128 };
    std::vector<FF> low_leaf_sibling_path = nullifier_tree.get_sibling_path(low_leaf_index);

    NullifierTreeLeafPreimage updated_low_leaf = low_leaf;
    updated_low_leaf.nextIndex = prev_snapshot.nextAvailableLeafIndex;
    updated_low_leaf.nextKey = siloed_nullifier;
    FF updated_low_leaf_hash = RawPoseidon2::hash(updated_low_leaf.get_hash_inputs());
    nullifier_tree.update_element(low_leaf_index, updated_low_leaf_hash);

    std::vector<FF> insertion_sibling_path = nullifier_tree.get_sibling_path(prev_snapshot.nextAvailableLeafIndex);

    NullifierTreeLeafPreimage new_leaf =
        NullifierTreeLeafPreimage(NullifierLeafValue(siloed_nullifier), low_leaf.nextIndex, low_leaf.nextKey);
    FF new_leaf_hash = RawPoseidon2::hash(new_leaf.get_hash_inputs());
    nullifier_tree.update_element(prev_snapshot.nextAvailableLeafIndex, new_leaf_hash);

    nullifier_tree_check_simulator.write(nullifier,
                                         contract_address,
                                         0,
                                         low_leaf,
                                         low_leaf_index,
                                         low_leaf_sibling_path,
                                         prev_snapshot,
                                         insertion_sibling_path);

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);
    nullifier_tree_check_builder.process(nullifier_tree_check_event_emitter.dump_events(), trace);

    // Not checking all interactions due to the public inputs interaction, which needs to be checked in an e2e test
    check_interaction<NullifierTreeCheckTraceBuilder,
                      lookup_nullifier_check_silo_poseidon2_settings,
                      lookup_nullifier_check_low_leaf_poseidon2_settings,
                      lookup_nullifier_check_updated_low_leaf_poseidon2_settings,
                      lookup_nullifier_check_low_leaf_merkle_check_settings,
                      lookup_nullifier_check_low_leaf_nullifier_validation_settings,
                      lookup_nullifier_check_low_leaf_next_nullifier_validation_settings,
                      lookup_nullifier_check_new_leaf_poseidon2_settings,
                      lookup_nullifier_check_new_leaf_merkle_check_settings>(trace);
}

} // namespace
} // namespace bb::avm2::tracegen
