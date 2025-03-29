#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cmath>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/generated/relations/lookups_public_data_read.hpp"
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
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::PublicDataTreeCheck;
using simulation::PublicDataTreeLeafPreimage;
using simulation::PublicDataTreeReadEvent;
using simulation::root_from_path;

using FF = AvmFlavorSettings::FF;
using C = Column;
using public_data_read = bb::avm2::public_data_read<FF>;
using poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
using PublicDataLeafValue = crypto::merkle_tree::PublicDataLeafValue;

using lookup_low_leaf_poseidon2_0 = lookup_public_data_read_low_leaf_poseidon2_0_relation<FF>;
using lookup_low_leaf_poseidon2_1 = lookup_public_data_read_low_leaf_poseidon2_1_relation<FF>;
using lookup_low_leaf_membership = lookup_public_data_read_low_leaf_membership_relation<FF>;
using lookup_low_leaf_slot_validation = lookup_public_data_read_low_leaf_slot_validation_relation<FF>;
using lookup_low_leaf_next_slot_validation = lookup_public_data_read_low_leaf_next_slot_validation_relation<FF>;

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

class PublicDataReadInteractionsTests : public TestWithParam<TestParams> {};

TEST_P(PublicDataReadInteractionsTests, PositiveWithInteractions)
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

    LookupIntoDynamicTableSequential<lookup_low_leaf_poseidon2_0::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_low_leaf_poseidon2_1::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_low_leaf_membership::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_low_leaf_slot_validation::Settings>().process(trace);
    LookupIntoDynamicTableSequential<lookup_low_leaf_next_slot_validation::Settings>().process(trace);
}

INSTANTIATE_TEST_SUITE_P(PublicDataTreeReadTracegenTest,
                         PublicDataReadInteractionsTests,
                         ::testing::ValuesIn(positive_tests));

} // namespace
} // namespace bb::avm2::tracegen
