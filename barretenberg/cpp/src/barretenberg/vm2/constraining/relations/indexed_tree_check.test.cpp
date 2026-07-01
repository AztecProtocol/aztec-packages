#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/aztec/aztec_hash_policy.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/indexed_tree_check.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/indexed_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/indexed_tree_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/merkle_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/testing/test_tree.hpp"
#include "barretenberg/vm2/tracegen/indexed_tree_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {

using namespace bb::crypto::merkle_tree;
namespace {

using ::testing::NiceMock;
using ::testing::TestWithParam;

using testing::TestMemoryTree;

using simulation::EventEmitter;
using simulation::FieldGreaterThan;
using simulation::FieldGreaterThanEvent;
using simulation::IndexedTreeCheck;
using simulation::IndexedTreeCheckEvent;
using simulation::IndexedTreeLeafData;
using simulation::IndexedTreeSiloingParameters;
using simulation::MerkleCheck;
using simulation::MerkleCheckEvent;
using simulation::MockExecutionIdManager;
using simulation::MockGreaterThan;
using simulation::MockRangeCheck;
using simulation::NoopEventEmitter;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::Poseidon2PermutationMemoryEvent;
using simulation::unconstrained_root_from_path;

using tracegen::IndexedTreeCheckTraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using IndexedTreeCheckRelation = bb::avm2::indexed_tree_check<FF>;
using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

TEST(IndexedTreeCheckConstrainingTest, EmptyRow)
{
    check_relation<IndexedTreeCheckRelation>(testing::empty_trace());
}

struct TestParams {
    FF value;
    bool exists;
    IndexedTreeLeafData low_leaf;
};

std::vector<TestParams> positive_read_tests = {
    // Exists = true, leaf pointers to infinity
    TestParams{ .value = 42, .exists = true, .low_leaf = { .value = 42, .next_value = 0, .next_index = 0 } },
    // Exists = true, leaf points to higher value
    TestParams{ .value = 42, .exists = true, .low_leaf = { .value = 42, .next_value = 50, .next_index = 28 } },
    // Exists = false, low leaf points to infinity
    TestParams{ .value = 42, .exists = false, .low_leaf = { .value = 10, .next_value = 0, .next_index = 0 } },
    // Exists = false, low leaf points to higher value
    TestParams{ .value = 42, .exists = false, .low_leaf = { .value = 10, .next_value = 50, .next_index = 28 } }
};

class IndexedTreeReadPositiveTests : public TestWithParam<TestParams> {};

TEST_P(IndexedTreeReadPositiveTests, Positive)
{
    const auto& param = GetParam();

    NoopEventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    NoopEventEmitter<Poseidon2PermutationMemoryEvent> perm_mem_event_emitter;

    NiceMock<MockGreaterThan> mock_gt;
    NiceMock<MockExecutionIdManager> mock_exec_id_manager;
    Poseidon2 poseidon2(mock_exec_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
    NoopEventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    NiceMock<MockRangeCheck> range_check;

    NoopEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<IndexedTreeCheckEvent> indexed_tree_check_event_emitter;
    IndexedTreeCheck indexed_tree_check_simulator(
        poseidon2, merkle_check, field_gt, DOM_SEP__NULLIFIER_MERKLE, indexed_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    IndexedTreeCheckTraceBuilder indexed_tree_check_builder;

    FF low_leaf_hash = poseidon2.hash(param.low_leaf.get_hash_inputs());
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path;
    sibling_path.reserve(NULLIFIER_TREE_HEIGHT);
    for (size_t i = 0; i < NULLIFIER_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }
    FF root = unconstrained_root_from_path(DOM_SEP__NULLIFIER_MERKLE, low_leaf_hash, leaf_index, sibling_path);

    indexed_tree_check_simulator.assert_read(param.value,
                                             /*siloing_params*/ std::nullopt,
                                             param.exists,
                                             param.low_leaf,
                                             leaf_index,
                                             sibling_path,
                                             AppendOnlyTreeSnapshot{ .root = root, .next_available_leaf_index = 128 });

    indexed_tree_check_builder.process(indexed_tree_check_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), 1);

    check_relation<IndexedTreeCheckRelation>(trace);
}

INSTANTIATE_TEST_SUITE_P(IndexedTreeCheckConstrainingTest,
                         IndexedTreeReadPositiveTests,
                         ::testing::ValuesIn(positive_read_tests));

TEST(IndexedTreeCheckConstrainingTest, PositiveWriteAppend)
{
    NoopEventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    NoopEventEmitter<Poseidon2PermutationMemoryEvent> perm_mem_event_emitter;

    NiceMock<MockGreaterThan> mock_gt;
    NiceMock<MockExecutionIdManager> mock_exec_id_manager;
    Poseidon2 poseidon2(mock_exec_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
    NoopEventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    NiceMock<MockRangeCheck> range_check;

    NoopEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<IndexedTreeCheckEvent> indexed_tree_check_event_emitter;
    IndexedTreeCheck indexed_tree_check_simulator(
        poseidon2, merkle_check, field_gt, DOM_SEP__NULLIFIER_MERKLE, indexed_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    IndexedTreeCheckTraceBuilder indexed_tree_check_builder;

    FF value = 100;
    FF low_value = 40;
    TestMemoryTree<aztec::NullifierMerkleHashPolicy> tree(8, NULLIFIER_TREE_HEIGHT);

    IndexedTreeLeafData low_leaf = { .value = low_value, .next_value = value + 1, .next_index = 10 };
    FF low_leaf_hash = RawPoseidon2::hash(low_leaf.get_hash_inputs());
    uint64_t low_leaf_index = 0;
    tree.update_element(low_leaf_index, low_leaf_hash);

    AppendOnlyTreeSnapshot prev_snapshot =
        AppendOnlyTreeSnapshot{ .root = tree.root(), .next_available_leaf_index = 128 };
    std::vector<FF> low_leaf_sibling_path = tree.get_sibling_path(low_leaf_index);

    IndexedTreeLeafData updated_low_leaf = low_leaf;
    updated_low_leaf.next_index = prev_snapshot.next_available_leaf_index;
    updated_low_leaf.next_value = value;
    FF updated_low_leaf_hash = RawPoseidon2::hash(updated_low_leaf.get_hash_inputs());
    tree.update_element(low_leaf_index, updated_low_leaf_hash);

    std::vector<FF> insertion_sibling_path = tree.get_sibling_path(prev_snapshot.next_available_leaf_index);

    IndexedTreeLeafData new_leaf = { .value = value,
                                     .next_value = low_leaf.next_value,
                                     .next_index = low_leaf.next_index };
    FF new_leaf_hash = RawPoseidon2::hash(new_leaf.get_hash_inputs());
    tree.update_element(prev_snapshot.next_available_leaf_index, new_leaf_hash);

    indexed_tree_check_simulator.write(value,
                                       /*siloing_params*/ std::nullopt,
                                       0,
                                       low_leaf,
                                       low_leaf_index,
                                       low_leaf_sibling_path,
                                       prev_snapshot,
                                       insertion_sibling_path);

    indexed_tree_check_builder.process(indexed_tree_check_event_emitter.dump_events(), trace);

    EXPECT_EQ(trace.get_num_rows(), 1);

    check_relation<IndexedTreeCheckRelation>(trace);
}

TEST(IndexedTreeCheckConstrainingTest, PositiveWriteMembership)
{
    FF value = 42;
    IndexedTreeLeafData low_leaf = { .value = 42, .next_value = 0, .next_index = 0 };

    NoopEventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    NoopEventEmitter<Poseidon2PermutationMemoryEvent> perm_mem_event_emitter;

    NiceMock<MockGreaterThan> mock_gt;
    NiceMock<MockExecutionIdManager> mock_exec_id_manager;
    Poseidon2 poseidon2(mock_exec_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
    NoopEventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    NiceMock<MockRangeCheck> range_check;

    NoopEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<IndexedTreeCheckEvent> indexed_tree_check_event_emitter;
    IndexedTreeCheck indexed_tree_check_simulator(
        poseidon2, merkle_check, field_gt, DOM_SEP__NULLIFIER_MERKLE, indexed_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    IndexedTreeCheckTraceBuilder indexed_tree_check_builder;

    FF low_leaf_hash = poseidon2.hash(low_leaf.get_hash_inputs());
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path;
    sibling_path.reserve(NULLIFIER_TREE_HEIGHT);
    for (size_t i = 0; i < NULLIFIER_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }
    FF root = unconstrained_root_from_path(DOM_SEP__NULLIFIER_MERKLE, low_leaf_hash, leaf_index, sibling_path);

    indexed_tree_check_simulator.write(value,
                                       std::nullopt,
                                       10,
                                       low_leaf,
                                       leaf_index,
                                       sibling_path,
                                       AppendOnlyTreeSnapshot{ .root = root, .next_available_leaf_index = 128 },
                                       /* insertion_sibling_path */ std::nullopt);

    indexed_tree_check_builder.process(indexed_tree_check_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), 1);

    check_relation<IndexedTreeCheckRelation>(trace);
}

TEST(IndexedTreeCheckConstrainingTest, Siloing)
{
    AztecAddress contract_address = 1;
    FF value = 42;
    FF siloed_value = RawPoseidon2::hash({ DOM_SEP__SILOED_NULLIFIER, FF(contract_address), value });
    IndexedTreeLeafData low_leaf = { .value = siloed_value, .next_value = 0, .next_index = 0 };

    NoopEventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    NoopEventEmitter<Poseidon2PermutationMemoryEvent> perm_mem_event_emitter;

    NiceMock<MockGreaterThan> mock_gt;
    NiceMock<MockExecutionIdManager> mock_exec_id_manager;
    Poseidon2 poseidon2(mock_exec_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
    NoopEventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_event_emitter);

    NiceMock<MockRangeCheck> range_check;

    NoopEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<IndexedTreeCheckEvent> indexed_tree_check_event_emitter;
    IndexedTreeCheck indexed_tree_check_simulator(
        poseidon2, merkle_check, field_gt, DOM_SEP__NULLIFIER_MERKLE, indexed_tree_check_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    IndexedTreeCheckTraceBuilder indexed_tree_check_builder;

    FF low_leaf_hash = poseidon2.hash(low_leaf.get_hash_inputs());
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path;
    sibling_path.reserve(NULLIFIER_TREE_HEIGHT);
    for (size_t i = 0; i < NULLIFIER_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }
    FF root = unconstrained_root_from_path(DOM_SEP__NULLIFIER_MERKLE, low_leaf_hash, leaf_index, sibling_path);

    indexed_tree_check_simulator.write(
        value,
        IndexedTreeSiloingParameters{ .address = contract_address, .siloing_separator = DOM_SEP__SILOED_NULLIFIER },
        10,
        low_leaf,
        leaf_index,
        sibling_path,
        AppendOnlyTreeSnapshot{ .root = root, .next_available_leaf_index = 128 },
        /* insertion_sibling_path */ std::nullopt);

    indexed_tree_check_builder.process(indexed_tree_check_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), 1);

    check_relation<IndexedTreeCheckRelation>(trace);
}

TEST(IndexedTreeCheckConstrainingTest, NegativeExistsFlagCheck)
{
    // Test constraint: sel * (VALUE_LOW_LEAF_VALUE_DIFF * (exists * (1 - value_low_leaf_value_diff_inv)
    // + value_low_leaf_value_diff_inv) - 1 + exists) = 0
    TestTraceContainer trace({
        { { C::indexed_tree_check_sel, 1 },
          { C::indexed_tree_check_siloed_value, 27 },
          { C::indexed_tree_check_low_leaf_value, 27 },
          { C::indexed_tree_check_value_low_leaf_value_diff_inv, 0 },
          { C::indexed_tree_check_exists, 1 } },
        { { C::indexed_tree_check_sel, 1 },
          { C::indexed_tree_check_siloed_value, 28 },
          { C::indexed_tree_check_low_leaf_value, 27 },
          { C::indexed_tree_check_value_low_leaf_value_diff_inv, FF(1).invert() },
          { C::indexed_tree_check_exists, 0 } },
    });

    check_relation<IndexedTreeCheckRelation>(trace, IndexedTreeCheckRelation::SR_EXISTS_CHECK);
    trace.set(C::indexed_tree_check_exists, 0, 0);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<IndexedTreeCheckRelation>(trace, IndexedTreeCheckRelation::SR_EXISTS_CHECK), "EXISTS_CHECK");
    trace.set(C::indexed_tree_check_exists, 0, 1);
    trace.set(C::indexed_tree_check_exists, 1, 1);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<IndexedTreeCheckRelation>(trace, IndexedTreeCheckRelation::SR_EXISTS_CHECK), "EXISTS_CHECK");
}

TEST(IndexedTreeCheckConstrainingTest, NegativeNextValueIsZero)
{
    // Test constraint: not_exists * (low_leaf_next_value * (NEXT_VALUE_IS_ZERO * (1 - next_value_inv)
    // + next_value_inv) - 1 + NEXT_VALUE_IS_ZERO) = 0
    TestTraceContainer trace({
        {
            { C::indexed_tree_check_not_exists, 1 },
            { C::indexed_tree_check_low_leaf_next_value, 0 },
            { C::indexed_tree_check_next_value_inv, 0 },
            { C::indexed_tree_check_next_value_is_nonzero, 0 },
        },
        {
            { C::indexed_tree_check_not_exists, 1 },
            { C::indexed_tree_check_low_leaf_next_value, 1 },
            { C::indexed_tree_check_next_value_inv, FF(1).invert() },
            { C::indexed_tree_check_next_value_is_nonzero, 1 },
        },
    });

    check_relation<IndexedTreeCheckRelation>(trace, IndexedTreeCheckRelation::SR_NEXT_VALUE_IS_ZERO_CHECK);

    trace.set(C::indexed_tree_check_next_value_is_nonzero, 0, 1);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<IndexedTreeCheckRelation>(trace, IndexedTreeCheckRelation::SR_NEXT_VALUE_IS_ZERO_CHECK),
        "NEXT_VALUE_IS_ZERO_CHECK");

    trace.set(C::indexed_tree_check_next_value_is_nonzero, 0, 0);
    trace.set(C::indexed_tree_check_next_value_is_nonzero, 1, 0);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<IndexedTreeCheckRelation>(trace, IndexedTreeCheckRelation::SR_NEXT_VALUE_IS_ZERO_CHECK),
        "NEXT_VALUE_IS_ZERO_CHECK");
}

TEST(IndexedTreeCheckConstrainingTest, NegativePassthroughSiloing)
{
    // Test constraint: (1 - sel_silo) * (value - siloed_value) = 0
    TestTraceContainer trace({
        {
            { C::indexed_tree_check_sel, 1 },
            { C::indexed_tree_check_sel_silo, 1 },
            { C::indexed_tree_check_value, 27 },
            { C::indexed_tree_check_siloed_value, 42 },
        },
        {
            { C::indexed_tree_check_sel, 1 },
            { C::indexed_tree_check_sel_silo, 0 },
            { C::indexed_tree_check_value, 27 },
            { C::indexed_tree_check_siloed_value, 27 },
        },
    });

    check_relation<IndexedTreeCheckRelation>(trace, IndexedTreeCheckRelation::SR_PASSTHROUGH_SILOING);

    trace.set(C::indexed_tree_check_siloed_value, 1, 28);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<IndexedTreeCheckRelation>(trace, IndexedTreeCheckRelation::SR_PASSTHROUGH_SILOING),
        "PASSTHROUGH_SILOING");
}

} // namespace
} // namespace bb::avm2::constraining
