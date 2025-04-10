#include "barretenberg/vm2/tracegen/nullifier_tree_read_trace.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cmath>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/generated/relations/lookups_nullifier_read.hpp"
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
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
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

using FF = AvmFlavorSettings::FF;
using C = Column;
using nullifier_read = bb::avm2::nullifier_read<FF>;
using poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

using lookup_low_leaf_poseidon2 = lookup_nullifier_read_low_leaf_poseidon2_relation<FF>;
using lookup_low_leaf_membership = lookup_nullifier_read_low_leaf_membership_relation<FF>;
using lookup_low_leaf_nullifier_validation = lookup_nullifier_read_low_leaf_nullifier_validation_relation<FF>;
using lookup_low_leaf_next_nullifier_validation = lookup_nullifier_read_low_leaf_next_nullifier_validation_relation<FF>;

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

    LookupIntoDynamicTableSequential<lookup_low_leaf_poseidon2::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_low_leaf_membership::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_low_leaf_nullifier_validation::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_low_leaf_next_nullifier_validation::Settings>().process(trace);
}

INSTANTIATE_TEST_SUITE_P(NullifierTreeReadTracegenTest,
                         NullifierReadInteractionsTests,
                         ::testing::ValuesIn(positive_tests));

} // namespace
} // namespace bb::avm2::tracegen
