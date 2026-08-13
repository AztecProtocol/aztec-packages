#include "barretenberg/vm2/tracegen/indexed_tree_check_trace.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/aztec/aztec_hash_policy.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_indexed_tree_check.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/indexed_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/indexed_tree_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/merkle_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/test_tree.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {

using namespace bb::crypto::merkle_tree;
namespace {

using ::testing::NiceMock;

using testing::TestMemoryTree;

using simulation::DeduplicatingEventEmitter;
using simulation::EventEmitter;
using simulation::ExecutionIdManager;
using simulation::FieldGreaterThan;
using simulation::FieldGreaterThanEvent;
using simulation::IndexedTreeCheck;
using simulation::IndexedTreeCheckEvent;
using simulation::IndexedTreeLeafData;
using simulation::IndexedTreeSiloingParameters;
using simulation::MerkleCheck;
using simulation::MerkleCheckEvent;
using simulation::MockGreaterThan;
using simulation::MockRangeCheck;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::Poseidon2PermutationMemoryEvent;
using simulation::unconstrained_root_from_path;

using constraining::check_interaction;

using FF = AvmFlavorSettings::FF;
using C = Column;
using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

constexpr size_t TREE_HEIGHT = 8;

class IndexedTreeCheckTracegenTest : public ::testing::Test {
  protected:
    IndexedTreeCheckTracegenTest()
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
    FF value;
    bool exists;
    IndexedTreeLeafData low_leaf;
};

std::vector<TestParams> positive_read_tests = {
    // Exists = true, leaf points to infinity
    TestParams{ .value = 42, .exists = true, .low_leaf = { .value = 42, .next_value = 0, .next_index = 0 } },
    // Exists = true, leaf points to higher value
    TestParams{ .value = 42, .exists = true, .low_leaf = { .value = 42, .next_value = 50, .next_index = 28 } },
    // Exists = false, low leaf points to infinity
    TestParams{ .value = 42, .exists = false, .low_leaf = { .value = 10, .next_value = 0, .next_index = 0 } },
    // Exists = false, low leaf points to higher value
    TestParams{ .value = 42, .exists = false, .low_leaf = { .value = 10, .next_value = 50, .next_index = 28 } }
};

class ReadInteractionsTests : public IndexedTreeCheckTracegenTest, public ::testing::WithParamInterface<TestParams> {};

TEST_P(ReadInteractionsTests, PositiveWithInteractions)
{
    const auto& param = GetParam();

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    NiceMock<MockRangeCheck> range_check;

    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<IndexedTreeCheckEvent> indexed_tree_check_event_emitter;
    IndexedTreeCheck indexed_tree_check(
        poseidon2, merkle_check, field_gt, DOM_SEP__NULLIFIER_MERKLE, indexed_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    IndexedTreeCheckTraceBuilder indexed_tree_check_builder;

    FF low_leaf_hash = poseidon2.hash(param.low_leaf.get_hash_inputs());
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path;
    sibling_path.reserve(TREE_HEIGHT);
    for (size_t i = 0; i < TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }
    FF root = unconstrained_root_from_path(DOM_SEP__NULLIFIER_MERKLE, low_leaf_hash, leaf_index, sibling_path);

    indexed_tree_check.assert_read(param.value,
                                   std::nullopt,
                                   param.exists,
                                   param.low_leaf,
                                   leaf_index,
                                   sibling_path,
                                   AppendOnlyTreeSnapshot{ .root = root });

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);
    indexed_tree_check_builder.process(indexed_tree_check_event_emitter.dump_events(), trace);

    check_interaction<IndexedTreeCheckTraceBuilder,
                      lookup_indexed_tree_check_silo_poseidon2_settings,
                      lookup_indexed_tree_check_low_leaf_poseidon2_settings,
                      lookup_indexed_tree_check_updated_low_leaf_poseidon2_settings,
                      lookup_indexed_tree_check_low_leaf_merkle_check_settings,
                      lookup_indexed_tree_check_low_leaf_value_validation_settings,
                      lookup_indexed_tree_check_low_leaf_next_value_validation_settings,
                      lookup_indexed_tree_check_new_leaf_poseidon2_settings,
                      lookup_indexed_tree_check_new_leaf_merkle_check_settings>(trace);
}

INSTANTIATE_TEST_SUITE_P(IndexedTreeCheckTracegenTest, ReadInteractionsTests, ::testing::ValuesIn(positive_read_tests));

TEST_F(IndexedTreeCheckTracegenTest, WriteWithInteractions)
{
    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    NiceMock<MockRangeCheck> range_check;

    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<IndexedTreeCheckEvent> indexed_tree_check_event_emitter;
    IndexedTreeCheck indexed_tree_check(
        poseidon2, merkle_check, field_gt, DOM_SEP__NULLIFIER_MERKLE, indexed_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    IndexedTreeCheckTraceBuilder indexed_tree_check_builder;

    AztecAddress contract_address = AztecAddress(1);
    FF value = 100;
    FF siloing_separator = 42;
    FF siloed_value = RawPoseidon2::hash({ siloing_separator, contract_address, value });
    FF low_value = 40;
    TestMemoryTree<aztec::NullifierMerkleHashPolicy> tree(8, TREE_HEIGHT);

    IndexedTreeLeafData low_leaf = { .value = low_value, .next_value = siloed_value + 1, .next_index = 10 };
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 0;
    tree.update_element(low_leaf_index, low_leaf_hash);

    AppendOnlyTreeSnapshot prev_snapshot =
        AppendOnlyTreeSnapshot{ .root = tree.root(), .next_available_leaf_index = 128 };
    std::vector<FF> low_leaf_sibling_path = tree.get_sibling_path(low_leaf_index);

    IndexedTreeLeafData updated_low_leaf = low_leaf;
    updated_low_leaf.next_index = prev_snapshot.next_available_leaf_index;
    updated_low_leaf.next_value = siloed_value;
    FF updated_low_leaf_hash = RawPoseidon2::hash(updated_low_leaf.get_hash_inputs());
    tree.update_element(low_leaf_index, updated_low_leaf_hash);

    std::vector<FF> insertion_sibling_path = tree.get_sibling_path(prev_snapshot.next_available_leaf_index);

    IndexedTreeLeafData new_leaf = { .value = siloed_value,
                                     .next_value = low_leaf.next_value,
                                     .next_index = low_leaf.next_index };
    FF new_leaf_hash = RawPoseidon2::hash(new_leaf.get_hash_inputs());
    tree.update_element(prev_snapshot.next_available_leaf_index, new_leaf_hash);

    IndexedTreeSiloingParameters siloing_params = {
        .address = contract_address,
        .siloing_separator = siloing_separator,
    };

    indexed_tree_check.write(value,
                             siloing_params,
                             0,
                             low_leaf,
                             low_leaf_index,
                             low_leaf_sibling_path,
                             prev_snapshot,
                             insertion_sibling_path);

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);
    indexed_tree_check_builder.process(indexed_tree_check_event_emitter.dump_events(), trace);

    // Not checking all interactions due to the public inputs interaction, which needs to be checked in an e2e test
    check_interaction<IndexedTreeCheckTraceBuilder,
                      lookup_indexed_tree_check_silo_poseidon2_settings,
                      lookup_indexed_tree_check_low_leaf_poseidon2_settings,
                      lookup_indexed_tree_check_updated_low_leaf_poseidon2_settings,
                      lookup_indexed_tree_check_low_leaf_merkle_check_settings,
                      lookup_indexed_tree_check_low_leaf_value_validation_settings,
                      lookup_indexed_tree_check_low_leaf_next_value_validation_settings,
                      lookup_indexed_tree_check_new_leaf_poseidon2_settings,
                      lookup_indexed_tree_check_new_leaf_merkle_check_settings>(trace);
}

} // namespace
} // namespace bb::avm2::tracegen
