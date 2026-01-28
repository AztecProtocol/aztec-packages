#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cmath>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_merkle_check.hpp"
#include "barretenberg/vm2/generated/relations/lookups_nullifier_check.hpp"
#include "barretenberg/vm2/generated/relations/merkle_check.hpp"
#include "barretenberg/vm2/simulation/events/nullifier_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/merkle_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/nullifier_tree_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/nullifier_tree_check_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using ::testing::NiceMock;

using simulation::DeduplicatingEventEmitter;
using simulation::EventEmitter;
using simulation::ExecutionIdManager;
using simulation::FieldGreaterThan;
using simulation::FieldGreaterThanEvent;
using simulation::MerkleCheck;
using simulation::MerkleCheckEvent;
using simulation::MockExecutionIdManager;
using simulation::MockGreaterThan;
using simulation::MockRangeCheck;
using simulation::NoopEventEmitter;
using simulation::NullifierTreeCheck;
using simulation::NullifierTreeCheckEvent;
using simulation::NullifierTreeLeafPreimage;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::Poseidon2PermutationMemoryEvent;
using simulation::unconstrained_root_from_path;

using tracegen::FieldGreaterThanTraceBuilder;
using tracegen::MerkleCheckTraceBuilder;
using tracegen::NullifierTreeCheckTraceBuilder;
using tracegen::Poseidon2TraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using merkle_check = bb::avm2::merkle_check<FF>;
using UnconstrainedPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
using NullifierLeafValue = crypto::merkle_tree::NullifierLeafValue;

TEST(MerkleCheckConstrainingTest, EmptyRow)
{
    check_relation<merkle_check>(testing::empty_trace());
}

TEST(MerkleCheckConstrainingTest, ComputationCannotBeStoppedPrematurely)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 }, { C::merkle_check_sel, 0 } },
        { { C::merkle_check_sel, 1 } },
        { { C::merkle_check_sel, 1 } },
        { { C::merkle_check_sel, 1 }, { C::merkle_check_end, 1 } },
        { { C::merkle_check_sel, 0 } },
    });

    check_relation<merkle_check>(
        trace, merkle_check::SR_COMPUTATION_FINISH_AT_END, merkle_check::SR_SELECTOR_ON_START_OR_END);

    const uint32_t last_row_idx = 3;
    // Negative test - now modify to an incorrect value
    trace.set(C::merkle_check_end, last_row_idx, 0); // This should fail - end went from 1 back to 0

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_COMPUTATION_FINISH_AT_END),
                              "COMPUTATION_FINISH_AT_END");
}

TEST(MerkleCheckConstrainingTest, EndCannotBeOneOnFirstRow)
{
    // First create a valid trace
    TestTraceContainer trace({
        // end is correctly 0 on first row
        { { C::precomputed_first_row, 1 }, { C::merkle_check_sel, 0 }, { C::merkle_check_end, 0 } },
    });

    // Verify it works with correct values
    check_relation<merkle_check>(trace);

    // Negative test - now modify to an invalid value
    trace.set(C::merkle_check_sel, 0, 1);
    trace.set(C::merkle_check_end, 0, 1); // This should fail - end can't be 1 on first row

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace), "Relation merkle_check");
}

TEST(MerkleCheckConstrainingTest, SelectorOnEnd)
{
    // Test constraint: (start + end) * (1 - sel) = 0
    // If end=1, sel must be 1
    TestTraceContainer trace({
        { { C::merkle_check_end, 1 }, { C::merkle_check_sel, 1 } }, // sel=1 when end=1 is correct
    });

    check_relation<merkle_check>(trace, merkle_check::SR_SELECTOR_ON_START_OR_END);

    // Negative test - now modify to an incorrect value
    trace.set(C::merkle_check_sel, 0, 0); // This should fail - sel cannot be 0 when end=1

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_SELECTOR_ON_START_OR_END),
                              "SELECTOR_ON_START_OR_END");
}

TEST(MerkleCheckConstrainingTest, SelectorOnStart)
{
    // Test constraint: (start + end) * (1 - sel) = 0
    // If start=1, sel must be 1
    TestTraceContainer trace({
        { { C::merkle_check_start, 1 }, { C::merkle_check_sel, 1 } }, // sel=1 when start=1 is correct
    });

    check_relation<merkle_check>(trace, merkle_check::SR_SELECTOR_ON_START_OR_END);

    // Negative test - now modify to an incorrect value
    trace.set(C::merkle_check_sel, 0, 0); // This should fail - sel cannot be 0 when start=1

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_SELECTOR_ON_START_OR_END),
                              "SELECTOR_ON_START_OR_END");
}

TEST(MerkleCheckConstrainingTest, PropagateReadRoot)
{
    // Test constraint: NOT_END * (root' - root) = 0
    // Root should stay the same in the next row unless it's an end row
    // When end=1, the next root can be different
    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 }, { C::merkle_check_end, 0 }, { C::merkle_check_read_root, 123 } },
        // Same leaf value is correct when NOT_END=1
        { { C::merkle_check_sel, 1 }, { C::merkle_check_end, 1 }, { C::merkle_check_read_root, 123 } },
        // Different leaf value is allowed after end row
        { { C::merkle_check_sel, 1 }, { C::merkle_check_end, 1 }, { C::merkle_check_read_root, 456 } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_PROPAGATE_READ_ROOT);

    // Negative test - now modify to an incorrect value
    trace.set(C::merkle_check_read_root, 1, 456); // This should fail - root should stay the same when NOT_END=1

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_PROPAGATE_READ_ROOT),
                              "PROPAGATE_READ_ROOT");
}

TEST(MerkleCheckConstrainingTest, PropagateWriteRoot)
{
    // Test constraint: NOT_END * (write_root' - write_root) = 0
    // write_root should stay the same in the next row unless it's an end row
    // When end=1, the next root can be different
    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 }, { C::merkle_check_end, 0 }, { C::merkle_check_write_root, 123 } },
        // Same leaf value is correct when NOT_END=1
        { { C::merkle_check_sel, 1 }, { C::merkle_check_end, 1 }, { C::merkle_check_write_root, 123 } },
        // Different leaf value is allowed after end row
        { { C::merkle_check_sel, 1 }, { C::merkle_check_end, 1 }, { C::merkle_check_write_root, 456 } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_PROPAGATE_WRITE_ROOT);

    // Negative test - now modify to an incorrect value
    trace.set(C::merkle_check_write_root, 1, 456); // This should fail - root should stay the same when NOT_END=1

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_PROPAGATE_WRITE_ROOT),
                              "PROPAGATE_WRITE_ROOT");
}

TEST(MerkleCheckConstrainingTest, PropagateWrite)
{
    // Test constraint: NOT_END * (write' - write) = 0
    // write should stay the same in the next row unless it's an end row
    // When end=1, the next write flag can be different
    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 }, { C::merkle_check_end, 0 }, { C::merkle_check_write, 1 } },
        // Same leaf value is correct when NOT_END=1
        { { C::merkle_check_sel, 1 }, { C::merkle_check_end, 1 }, { C::merkle_check_write, 1 } },
        // Different leaf value is allowed after end row
        { { C::merkle_check_sel, 1 }, { C::merkle_check_end, 1 }, { C::merkle_check_write, 0 } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_PROPAGATE_WRITE);

    // Negative test - now modify to an incorrect value
    trace.set(C::merkle_check_write, 1, 0); // This should fail - write should stay the same when NOT_END=1

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_PROPAGATE_WRITE), "PROPAGATE_WRITE");
}

TEST(MerkleCheckConstrainingTest, PathLenDecrements)
{
    TestTraceContainer trace({
        // Decrements until path_len=0
        { { C::merkle_check_sel, 1 }, { C::merkle_check_end, 0 }, { C::merkle_check_path_len, 3 } },
        { { C::merkle_check_sel, 1 }, { C::merkle_check_end, 0 }, { C::merkle_check_path_len, 2 } },
        { { C::merkle_check_sel, 1 }, { C::merkle_check_end, 1 }, { C::merkle_check_path_len, 1 } },
        // Path len can be different after end=1
        { { C::merkle_check_sel, 1 }, { C::merkle_check_end, 1 }, { C::merkle_check_path_len, 5 } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_PATH_LEN_DECREMENTS);

    // Negative test - now modify to an incorrect value and verify it fails
    trace.set(C::merkle_check_path_len, 1, 1); // Should be 2, change to 1

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_PATH_LEN_DECREMENTS),
                              "PATH_LEN_DECREMENTS");
}

TEST(MerkleCheckConstrainingTest, EndWhenPathLenOne)
{
    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_path_len, 2 },
          { C::merkle_check_path_len_min_one_inv, FF(1).invert() },
          { C::merkle_check_end, 0 } },
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_path_len, 1 },
          { C::merkle_check_path_len_min_one_inv, 0 },
          { C::merkle_check_end, 1 } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_END_IFF_REM_PATH_EMPTY);

    // Negative test - now modify to an incorrect value and verify it fails
    trace.set(C::merkle_check_end, 1, 0); // Should be 1, change to 0

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_END_IFF_REM_PATH_EMPTY),
                              "END_IFF_REM_PATH_EMPTY");
}

TEST(MerkleCheckConstrainingTest, NextIndexIsHalved)
{
    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_end, 0 },
          { C::merkle_check_index, 6 },
          { C::merkle_check_index_is_even, 1 } },
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_end, 0 },
          { C::merkle_check_index, 3 }, // 6/2 = 3
          { C::merkle_check_index_is_even, 0 } },
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_end, 1 },   // Set end=1 for final row
          { C::merkle_check_index, 1 }, // 3/2 = 1
          { C::merkle_check_index_is_even, 0 } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_NEXT_INDEX_IS_HALVED);

    // Test with odd index
    TestTraceContainer trace2({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_end, 0 },
          { C::merkle_check_index, 7 },
          { C::merkle_check_index_is_even, 0 } },
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_end, 0 },
          { C::merkle_check_index, 3 }, // (7-1)/2 = 3
          { C::merkle_check_index_is_even, 0 } },
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_end, 1 },   // Set end=1 for final row
          { C::merkle_check_index, 1 }, // 6/2 = 3
          { C::merkle_check_index_is_even, 0 } },
    });

    check_relation<merkle_check>(trace2, merkle_check::SR_NEXT_INDEX_IS_HALVED);

    // Negative test - now modify to an incorrect value and verify it fails
    trace2.set(C::merkle_check_index, 1, 4); // Should be 3, change to 4

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace2, merkle_check::SR_NEXT_INDEX_IS_HALVED),
                              "NEXT_INDEX_IS_HALVED");
}

TEST(MerkleCheckConstrainingTest, AssignReadNodesEven)
{
    // Test even index (current_node goes to left_node and sibling goes to right_node)
    TestTraceContainer trace({
        {
            { C::merkle_check_sel, 1 },
            { C::merkle_check_index_is_even, 1 },
            { C::merkle_check_read_node, 123 },
            { C::merkle_check_sibling, 456 },
            { C::merkle_check_read_left_node, 123 },
            { C::merkle_check_read_right_node, 456 },
        },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_READ_LEFT_NODE, merkle_check::SR_READ_RIGHT_NODE);

    // Negative test - swap values of read_left_node and read_right_node
    trace.set(C::merkle_check_read_left_node, 0, 456);
    trace.set(C::merkle_check_read_right_node, 0, 123);

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_READ_RIGHT_NODE), "READ_RIGHT_NODE");
    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_READ_LEFT_NODE), "READ_LEFT_NODE");
}

TEST(MerkleCheckConstrainingTest, AssignReadNodesOdd)
{
    // Test odd index (current_node goes to right_node and sibling goes to left_node)
    TestTraceContainer trace({
        {
            { C::merkle_check_sel, 1 },
            { C::merkle_check_index_is_even, 0 },
            { C::merkle_check_read_node, 123 },
            { C::merkle_check_sibling, 456 },
            { C::merkle_check_read_left_node, 456 },
            { C::merkle_check_read_right_node, 123 },
        },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_READ_LEFT_NODE, merkle_check::SR_READ_RIGHT_NODE);

    // Negative test - swap values of read_left_node and read_right_node
    trace.set(C::merkle_check_read_left_node, 0, 123);
    trace.set(C::merkle_check_read_right_node, 0, 456);

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_READ_RIGHT_NODE), "READ_RIGHT_NODE");
    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_READ_LEFT_NODE), "READ_LEFT_NODE");
}

TEST(MerkleCheckConstrainingTest, AssignWriteNodesEven)
{
    // Test even index (current_node goes to left_node and sibling goes to right_node)
    TestTraceContainer trace({
        {
            { C::merkle_check_sel, 1 },
            { C::merkle_check_write, 1 },
            { C::merkle_check_index_is_even, 1 },
            { C::merkle_check_write_node, 123 },
            { C::merkle_check_sibling, 456 },
            { C::merkle_check_write_left_node, 123 },
            { C::merkle_check_write_right_node, 456 },
        },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_WRITE_LEFT_NODE, merkle_check::SR_WRITE_RIGHT_NODE);

    // Negative test - swap values of write_left_node and write_right_node
    trace.set(C::merkle_check_write_left_node, 0, 456);
    trace.set(C::merkle_check_write_right_node, 0, 123);

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_WRITE_RIGHT_NODE),
                              "WRITE_RIGHT_NODE");
    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_WRITE_LEFT_NODE), "WRITE_LEFT_NODE");
}

TEST(MerkleCheckConstrainingTest, AssignWriteNodesOdd)
{
    // Test odd index (current_node goes to right_node and sibling goes to left_node)
    TestTraceContainer trace({
        {
            { C::merkle_check_sel, 1 },
            { C::merkle_check_write, 1 },
            { C::merkle_check_index_is_even, 0 },
            { C::merkle_check_write_node, 123 },
            { C::merkle_check_sibling, 456 },
            { C::merkle_check_write_left_node, 456 },
            { C::merkle_check_write_right_node, 123 },
        },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_WRITE_LEFT_NODE, merkle_check::SR_WRITE_RIGHT_NODE);

    // Negative test - swap values of write_left_node and write_right_node
    trace.set(C::merkle_check_write_left_node, 0, 123);
    trace.set(C::merkle_check_write_right_node, 0, 456);

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_WRITE_RIGHT_NODE),
                              "WRITE_RIGHT_NODE");
    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_WRITE_LEFT_NODE), "WRITE_LEFT_NODE");
}

TEST(MerkleCheckConstrainingTest, ReadOutputHashIsNextRowsNode)
{
    FF left_node = FF(123);
    FF right_node = FF(456);
    FF output_hash = UnconstrainedPoseidon2::hash({ left_node, right_node });

    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_end, 0 },
          { C::merkle_check_read_node, left_node },
          { C::merkle_check_read_right_node, right_node },
          { C::merkle_check_read_output_hash, output_hash } },
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_end, 1 }, // Set end=1 for final row
          { C::merkle_check_read_node, output_hash } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_OUTPUT_HASH_IS_NEXT_ROWS_READ_NODE);

    // Negative test - now modify to an incorrect value and verify it fails
    trace.set(C::merkle_check_read_node, 1, output_hash + 1); // Should be output_hash

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_OUTPUT_HASH_IS_NEXT_ROWS_READ_NODE),
                              "OUTPUT_HASH_IS_NEXT_ROWS_READ_NODE");
}

TEST(MerkleCheckConstrainingTest, WriteOutputHashIsNextRowsNode)
{
    FF left_node = FF(123);
    FF right_node = FF(456);
    FF output_hash = UnconstrainedPoseidon2::hash({ left_node, right_node });

    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_end, 0 },
          { C::merkle_check_write_node, left_node },
          { C::merkle_check_write_right_node, right_node },
          { C::merkle_check_write_output_hash, output_hash } },
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_end, 1 }, // Set end=1 for final row
          { C::merkle_check_write_node, output_hash } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_OUTPUT_HASH_IS_NEXT_ROWS_WRITE_NODE);

    // Negative test - now modify to an incorrect value and verify it fails
    trace.set(C::merkle_check_write_node, 1, output_hash + 1); // Should be output_hash

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_OUTPUT_HASH_IS_NEXT_ROWS_WRITE_NODE),
                              "OUTPUT_HASH_IS_NEXT_ROWS_WRITE_NODE");
}

TEST(MerkleCheckConstrainingTest, OutputHashIsNotNextRowsCurrentNodeValueForLastRow)
{
    FF output_hash = FF(456);
    FF next_current_node = FF(789);

    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_end, 1 },
          { C::merkle_check_read_output_hash, output_hash },
          { C::merkle_check_write_output_hash, output_hash } },
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_read_node, next_current_node },
          { C::merkle_check_write_node, next_current_node } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_OUTPUT_HASH_IS_NEXT_ROWS_READ_NODE);
    check_relation<merkle_check>(trace, merkle_check::SR_OUTPUT_HASH_IS_NEXT_ROWS_WRITE_NODE);
}

TEST(MerkleCheckConstrainingTest, ReadWithTracegen)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });
    MerkleCheckTraceBuilder builder;

    // Create a Merkle tree path with 3 levels
    FF leaf_value = FF(123);
    uint64_t leaf_index = 5;

    // Create a sibling path of length 3
    std::vector<FF> sibling_path = { FF(456), FF(789), FF(3333) };

    // Compute expected root
    FF root = unconstrained_root_from_path(leaf_value, leaf_index, sibling_path);

    MerkleCheckEvent event = {
        .leaf_value = leaf_value, .leaf_index = leaf_index, .sibling_path = sibling_path, .root = root
    };

    builder.process({ event }, trace);

    // Check the relation for all rows
    check_relation<merkle_check>(trace);

    // Negative test - now corrupt the trace and verify it fails
    uint32_t last_row = static_cast<uint32_t>(trace.get_num_rows() - 1);
    // Corrupt the last row
    trace.set(C::merkle_check_path_len, last_row, 66);

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace), "Relation merkle_check");
}

TEST(MerkleCheckConstrainingTest, WriteWithTracegen)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });
    MerkleCheckTraceBuilder builder;

    // Create a Merkle tree path with 3 levels
    FF leaf_value = FF(123);
    FF new_leaf_value = FF(456);
    uint64_t leaf_index = 5;

    // Create a sibling path of length 3
    std::vector<FF> sibling_path = { FF(456), FF(789), FF(3333) };

    // Compute read root
    FF root = unconstrained_root_from_path(leaf_value, leaf_index, sibling_path);
    // Compute new root
    FF new_root = unconstrained_root_from_path(new_leaf_value, leaf_index, sibling_path);

    MerkleCheckEvent event = { .leaf_value = leaf_value,
                               .new_leaf_value = new_leaf_value,
                               .leaf_index = leaf_index,
                               .sibling_path = sibling_path,
                               .root = root,
                               .new_root = new_root };

    builder.process({ event }, trace);

    // Check the relation for all rows
    check_relation<merkle_check>(trace);
}

class MerkleCheckPoseidon2Test : public ::testing::Test {
  protected:
    MerkleCheckPoseidon2Test() = default;

    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    NoopEventEmitter<Poseidon2PermutationMemoryEvent> perm_mem_event_emitter;

    NiceMock<MockExecutionIdManager> execution_id_manager;
    NiceMock<MockGreaterThan> mock_gt;
    Poseidon2 poseidon2 =
        Poseidon2(execution_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
};

TEST_F(MerkleCheckPoseidon2Test, ReadWithInteractions)
{
    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check_sim(poseidon2, merkle_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;

    FF leaf_value = 333;
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path = { 10, 2, 30, 4, 50, 6 };
    FF root = unconstrained_root_from_path(leaf_value, leaf_index, sibling_path);
    merkle_check_sim.assert_membership(leaf_value, leaf_index, sibling_path, root);

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);

    check_interaction<MerkleCheckTraceBuilder,
                      lookup_merkle_check_merkle_poseidon2_read_settings,
                      lookup_merkle_check_merkle_poseidon2_write_settings>(trace);

    check_relation<merkle_check>(trace);

    // Negative test - now corrupt the trace and verify it fails
    trace.set(Column::merkle_check_read_output_hash, static_cast<uint32_t>(sibling_path.size()), 66);

    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<MerkleCheckTraceBuilder, lookup_merkle_check_merkle_poseidon2_read_settings>(trace)),
        "Failed.*LOOKUP_MERKLE_CHECK_MERKLE_POSEIDON2.* Could not find tuple in destination");
    check_interaction<MerkleCheckTraceBuilder, lookup_merkle_check_merkle_poseidon2_write_settings>(trace);
}

TEST_F(MerkleCheckPoseidon2Test, WriteWithInteractions)
{
    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check_sim(poseidon2, merkle_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;

    FF leaf_value = 333;
    FF new_leaf_value = 444;
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path = { 10, 2, 30, 4, 50, 6 };
    FF root = unconstrained_root_from_path(leaf_value, leaf_index, sibling_path);
    FF expected_new_root = unconstrained_root_from_path(new_leaf_value, leaf_index, sibling_path);

    FF new_root = merkle_check_sim.write(leaf_value, new_leaf_value, leaf_index, sibling_path, root);

    EXPECT_EQ(new_root, expected_new_root);

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);

    check_interaction<MerkleCheckTraceBuilder,
                      lookup_merkle_check_merkle_poseidon2_read_settings,
                      lookup_merkle_check_merkle_poseidon2_write_settings>(trace);

    check_relation<merkle_check>(trace);

    // Negative test - now corrupt the trace and verify it fails
    trace.set(Column::merkle_check_read_output_hash, static_cast<uint32_t>(sibling_path.size()), 66);
    trace.set(Column::merkle_check_write_output_hash, static_cast<uint32_t>(sibling_path.size()), 77);

    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<MerkleCheckTraceBuilder, lookup_merkle_check_merkle_poseidon2_read_settings>(trace)),
        "Failed.*LOOKUP_MERKLE_CHECK_MERKLE_POSEIDON2.* Could not find tuple in destination");

    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<MerkleCheckTraceBuilder, lookup_merkle_check_merkle_poseidon2_write_settings>(trace)),
        "Failed.*LOOKUP_MERKLE_CHECK_MERKLE_POSEIDON2_WRITE.* Could not find tuple in "
        "destination");
}

TEST_F(MerkleCheckPoseidon2Test, MultipleWithTracegen)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });
    MerkleCheckTraceBuilder builder;

    FF leaf_value = 333;
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path = { 10, 2, 30, 4, 50, 6 };
    FF root = unconstrained_root_from_path(leaf_value, leaf_index, sibling_path);
    MerkleCheckEvent event = {
        .leaf_value = leaf_value, .leaf_index = leaf_index, .sibling_path = sibling_path, .root = root
    };

    FF leaf_value2 = 444;
    FF new_leaf_value2 = 555;
    uint64_t leaf_index2 = 40;
    std::vector<FF> sibling_path2 = { 11, 22, 33, 44, 55, 66 };
    FF root2 = unconstrained_root_from_path(leaf_value2, leaf_index2, sibling_path2);
    FF new_root2 = unconstrained_root_from_path(new_leaf_value2, leaf_index2, sibling_path2);
    MerkleCheckEvent event2 = { .leaf_value = leaf_value2,
                                .new_leaf_value = new_leaf_value2,
                                .leaf_index = leaf_index2,
                                .sibling_path = sibling_path2,
                                .root = root2,
                                .new_root = new_root2 };

    builder.process({ event, event2 }, trace);

    // Empty row after last real merkle row
    uint32_t after_last_row_index = 1 + static_cast<uint32_t>(sibling_path.size() + sibling_path2.size());
    trace.set(Column::merkle_check_sel, after_last_row_index, 0);
    trace.set(Column::merkle_check_write, after_last_row_index, 0);
    trace.set(Column::merkle_check_read_node, after_last_row_index, 0);
    trace.set(Column::merkle_check_write_node, after_last_row_index, 0);
    trace.set(Column::merkle_check_index, after_last_row_index, 0);
    trace.set(Column::merkle_check_path_len, after_last_row_index, 0);
    trace.set(Column::merkle_check_path_len_min_one_inv, after_last_row_index, 0);
    trace.set(Column::merkle_check_read_root, after_last_row_index, 0);
    trace.set(Column::merkle_check_write_root, after_last_row_index, 0);
    trace.set(Column::merkle_check_sibling, after_last_row_index, 0);
    trace.set(Column::merkle_check_start, after_last_row_index, 0);
    trace.set(Column::merkle_check_end, after_last_row_index, 0);
    trace.set(Column::merkle_check_index_is_even, after_last_row_index, 0);
    trace.set(Column::merkle_check_read_left_node, after_last_row_index, 0);
    trace.set(Column::merkle_check_read_right_node, after_last_row_index, 0);
    trace.set(Column::merkle_check_write_left_node, after_last_row_index, 0);
    trace.set(Column::merkle_check_write_right_node, after_last_row_index, 0);
    trace.set(Column::merkle_check_read_output_hash, after_last_row_index, 0);
    trace.set(Column::merkle_check_write_output_hash, after_last_row_index, 0);

    check_relation<merkle_check>(trace);
}

TEST_F(MerkleCheckPoseidon2Test, MultipleWithInteractions)
{
    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check_sim(poseidon2, merkle_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    MerkleCheckTraceBuilder merkle_check_builder;
    Poseidon2TraceBuilder poseidon2_builder;

    FF leaf_value = 333;
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path = { 10, 2, 30, 4, 50, 6 };
    FF root = unconstrained_root_from_path(leaf_value, leaf_index, sibling_path);

    merkle_check_sim.assert_membership(leaf_value, leaf_index, sibling_path, root);

    FF leaf_value2 = 444;
    FF new_leaf_value2 = 555;
    uint64_t leaf_index2 = 40;
    std::vector<FF> sibling_path2 = { 11, 22, 33, 44, 55, 66 };
    FF root2 = unconstrained_root_from_path(leaf_value2, leaf_index2, sibling_path2);
    FF expected_new_root2 = unconstrained_root_from_path(new_leaf_value2, leaf_index2, sibling_path2);

    FF new_root2 = merkle_check_sim.write(leaf_value2, new_leaf_value2, leaf_index2, sibling_path2, root2);
    EXPECT_EQ(new_root2, expected_new_root2);

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);

    check_interaction<MerkleCheckTraceBuilder,
                      lookup_merkle_check_merkle_poseidon2_read_settings,
                      lookup_merkle_check_merkle_poseidon2_write_settings>(trace);

    check_relation<merkle_check>(trace);
}

// ============================================================================
// REGRESSION TESTS: Verify NO_ACTIVITY_ON_FIRST_ROW blocks the LATCH_CONDITION exploit
// ============================================================================
//
// BACKGROUND (the vulnerability that was fixed):
// merkle_check.pil defines: pol LATCH_CONDITION = end + precomputed.first_row;
// Propagation constraints use: (1 - LATCH_CONDITION) * (value' - value) = 0
//
// At row 0 (first_row=1), LATCH_CONDITION = end + 1 >= 1, so (1 - LATCH_CONDITION) = 0
// regardless of `end`. This means propagation from row 0 to row 1 is ALWAYS relaxed.
//
// Without a guard, a malicious prover could start a multi-row merkle check at row 0,
// allowing read_root to change from row 0 to row 1 undetected.
//
// FIX: The constraint `sel * precomputed.first_row = 0` (#[NO_ACTIVITY_ON_FIRST_ROW])
// prevents merkle_check from being active at row 0, blocking this attack.
//
// These tests verify the fix works by constructing exploit traces and confirming
// they are rejected by the NO_ACTIVITY_ON_FIRST_ROW constraint.

/**
 * REGRESSION TEST: Verify NO_ACTIVITY_ON_FIRST_ROW blocks a manual exploit trace.
 *
 * This test constructs a 2-layer merkle check starting at row 0 (the first_row):
 * - Row 0: start=1, end=0, read_root=R_real
 * - Row 1: start=0, end=1, read_root=R_fake
 *
 * Without the fix, LATCH_CONDITION=1 at row 0 would relax propagation constraints,
 * allowing read_root to change from R_real to R_fake undetected.
 *
 * With the fix, the constraint `sel * precomputed.first_row = 0` rejects this trace
 * because sel=1 at row 0.
 */
TEST(MerkleCheckConstrainingTest, ExploitFirstRowLatchConditionBypass)
{
    // ========================================================================
    // Step 1: Build a legitimate merkle path (leaf_index=1, path_len=2)
    // ========================================================================
    FF leaf = FF(123);
    uint64_t leaf_index = 1; // Odd index

    FF sibling_0 = FF(456); // Sibling at level 0
    FF sibling_1 = FF(789); // Sibling at level 1

    // Level 0: index 1 is odd -> sibling is left, leaf is right
    FF left_0 = sibling_0;
    FF right_0 = leaf;
    FF hash_0 = UnconstrainedPoseidon2::hash({ left_0, right_0 });

    // Level 1: index 0 is even -> hash is left, sibling is right
    FF left_1_legit = hash_0;
    FF right_1_legit = sibling_1;
    FF R_real = UnconstrainedPoseidon2::hash({ left_1_legit, right_1_legit });

    // ========================================================================
    // Step 2: Build a FAKE merkle path for level 1 (the exploited layer)
    // The prover picks arbitrary node and sibling values for row 1.
    // ========================================================================
    FF fake_node = FF(999);
    FF fake_sibling = FF(888);
    // Index at row 1 = 0 (halved from 1), so index_is_even = 1
    // Even index -> node is left, sibling is right
    FF fake_left = fake_node;
    FF fake_right = fake_sibling;
    FF R_fake = UnconstrainedPoseidon2::hash({ fake_left, fake_right });

    // Sanity check: the roots MUST be different for this to be a real exploit
    ASSERT_NE(R_real, R_fake) << "Exploit requires different roots - pick different fake values";

    // ========================================================================
    // Step 3: Build the EXPLOIT trace - merkle check starting at row 0
    // ========================================================================
    TestTraceContainer trace({
        // Row 0: first_row=1, sel=1, start=1, end=0, path_len=2
        // This is the lookup target. Callers see read_root = R_real.
        // LATCH_CONDITION = end + first_row = 0 + 1 = 1
        // => (1 - LATCH_CONDITION) = 0 => ALL propagation to row 1 is relaxed!
        {
            { C::precomputed_first_row, 1 },
            { C::merkle_check_sel, 1 },
            { C::merkle_check_start, 1 },
            { C::merkle_check_end, 0 },
            { C::merkle_check_read_node, leaf },
            { C::merkle_check_index, leaf_index },
            { C::merkle_check_path_len, 2 },
            { C::merkle_check_path_len_min_one_inv, FF(1).invert() },
            { C::merkle_check_read_root, R_real }, // <-- CALLER SEES THIS ROOT
            { C::merkle_check_sibling, sibling_0 },
            { C::merkle_check_index_is_even, 0 }, // index 1 is odd
            { C::merkle_check_read_left_node, left_0 },
            { C::merkle_check_read_right_node, right_0 },
            { C::merkle_check_read_output_hash, hash_0 },
        },
        // Row 1: sel=1, start=0, end=1, path_len=1
        // EXPLOIT: read_root = R_fake (DIFFERENT from R_real!)
        //          read_node = fake_node (NOT hash_0 from row 0!)
        // This is allowed because LATCH_CONDITION=1 at row 0 broke propagation.
        {
            { C::merkle_check_sel, 1 },
            { C::merkle_check_start, 0 },
            { C::merkle_check_end, 1 },
            { C::merkle_check_read_node, fake_node }, // <-- NOT hash_0!
            { C::merkle_check_index, 0 },             // halved from index 1
            { C::merkle_check_path_len, 1 },
            { C::merkle_check_path_len_min_one_inv, 0 },
            { C::merkle_check_read_root, R_fake }, // <-- DIFFERENT ROOT!
            { C::merkle_check_sibling, fake_sibling },
            { C::merkle_check_index_is_even, 1 }, // index 0 is even
            { C::merkle_check_read_left_node, fake_left },
            { C::merkle_check_read_right_node, fake_right },
            { C::merkle_check_read_output_hash, R_fake }, // hash == root on end row
        },
    });

    // ========================================================================
    // Step 4: Verify the exploit is BLOCKED by the NO_ACTIVITY_ON_FIRST_ROW constraint
    // ========================================================================
    // The exploit trace has sel=1 at row 0, which violates the constraint:
    //   sel * precomputed.first_row = 0
    //
    // This constraint prevents merkle_check from being active at row 0, blocking the attack
    // where a malicious prover would exploit LATCH_CONDITION=1 at row 0 to break propagation.
    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace), "NO_ACTIVITY_ON_FIRST_ROW");

    // The relation check already rejects the trace, so there's no need to test the lookup.
    // The exploit is blocked at the relation level before any lookup matching can occur.
}

/**
 * REGRESSION TEST: Verify NO_ACTIVITY_ON_FIRST_ROW blocks a shift-based exploit.
 *
 * This test uses the full simulation pipeline to generate a legitimate 42-level merkle proof,
 * then shifts all merkle_check rows from 1..42 to 0..41. After shifting:
 *   - Row 0 has start=1, path_len=42, read_root=R_legit (then changed to R_fake)
 *   - Row 41 has end=1, read_root=R_legit
 *
 * Without the fix, LATCH_CONDITION=1 at row 0 would allow read_root to change from R_fake
 * (row 0) to R_legit (row 1) undetected, deceiving the caller.
 *
 * With the fix, the constraint `sel * precomputed.first_row = 0` rejects this trace
 * because the shifted trace has sel=1 at row 0.
 */
TEST(MerkleCheckConstrainingTest, ExploitShiftRowsAttack)
{
    // ========================================================================
    // Step 1: Set up simulation pipeline
    // ========================================================================
    ExecutionIdManager execution_id_manager(0);
    NiceMock<MockGreaterThan> mock_gt;

    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    EventEmitter<Poseidon2PermutationMemoryEvent> perm_mem_event_emitter;
    Poseidon2 sim_poseidon2(
        execution_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check_sim(sim_poseidon2, merkle_event_emitter);

    NiceMock<MockRangeCheck> range_check;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);

    EventEmitter<NullifierTreeCheckEvent> nullifier_tree_check_event_emitter;
    NullifierTreeCheck nullifier_tree_check_simulator(
        sim_poseidon2, merkle_check_sim, field_gt, nullifier_tree_check_event_emitter);

    // ========================================================================
    // Step 2: Perform a legitimate nullifier read via the simulation
    // ========================================================================
    NullifierTreeLeafPreimage low_leaf(NullifierLeafValue(42), 0, 0);
    FF low_leaf_hash = sim_poseidon2.hash(low_leaf.get_hash_inputs());
    uint64_t leaf_index = 30;

    std::vector<FF> sibling_path;
    sibling_path.reserve(NULLIFIER_TREE_HEIGHT);
    for (size_t i = 0; i < NULLIFIER_TREE_HEIGHT; ++i) {
        sibling_path.emplace_back(i);
    }
    FF R_legit = unconstrained_root_from_path(low_leaf_hash, leaf_index, sibling_path);

    nullifier_tree_check_simulator.assert_read(
        /*nullifier=*/42,
        /*contract_address=*/std::nullopt,
        /*exists=*/true,
        low_leaf,
        leaf_index,
        sibling_path,
        AppendOnlyTreeSnapshot{ .root = R_legit });

    // ========================================================================
    // Step 3: Build trace using tracegen modules (the canonical pipeline)
    // ========================================================================
    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    NullifierTreeCheckTraceBuilder nullifier_tree_check_builder;

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_event_emitter.dump_events(), trace);
    nullifier_tree_check_builder.process(nullifier_tree_check_event_emitter.dump_events(), trace);

    // ========================================================================
    // Step 4: Verify the legitimate trace is correct (sanity check)
    // ========================================================================
    ASSERT_NO_THROW(check_relation<merkle_check>(trace)) << "Legitimate trace should pass all merkle_check relations";
    ASSERT_NO_THROW(
        (check_interaction<NullifierTreeCheckTraceBuilder, lookup_nullifier_check_low_leaf_merkle_check_settings>(
            trace)))
        << "Legitimate trace should pass the nullifier->merkle lookup";

    // Verify canonical trace structure: merkle starts at row 1 with path_len=42
    ASSERT_EQ(trace.get(C::merkle_check_start, 1), FF(1)) << "Canonical: start=1 at row 1";
    ASSERT_EQ(trace.get(C::merkle_check_path_len, 1), FF(NULLIFIER_TREE_HEIGHT)) << "Canonical: path_len=42 at row 1";
    ASSERT_EQ(trace.get(C::merkle_check_read_root, 1), R_legit) << "Canonical: read_root=R_legit at row 1";
    ASSERT_EQ(trace.get(C::merkle_check_end, 42), FF(1)) << "Canonical: end=1 at row 42";

    // ========================================================================
    // Step 5: SHIFT all merkle_check columns from rows 1..42 to rows 0..41
    // ========================================================================
    // This is the key insight: instead of adding a fake extra level with path_len=43,
    // we shift the entire trace down by 1 row. The start row (now at row 0) still has
    // path_len=42, matching the constrained tree_height=42.

    // List of all merkle_check columns to shift
    std::array<Column, 19> merkle_columns = { C::merkle_check_sel,
                                              C::merkle_check_start,
                                              C::merkle_check_end,
                                              C::merkle_check_read_node,
                                              C::merkle_check_write_node,
                                              C::merkle_check_index,
                                              C::merkle_check_index_is_even,
                                              C::merkle_check_path_len,
                                              C::merkle_check_path_len_min_one_inv,
                                              C::merkle_check_read_root,
                                              C::merkle_check_write_root,
                                              C::merkle_check_sibling,
                                              C::merkle_check_read_left_node,
                                              C::merkle_check_read_right_node,
                                              C::merkle_check_read_output_hash,
                                              C::merkle_check_write_left_node,
                                              C::merkle_check_write_right_node,
                                              C::merkle_check_write_output_hash,
                                              C::merkle_check_write };

    // Read all values from rows 1..42 and write to rows 0..41
    for (uint32_t src_row = 1; src_row <= NULLIFIER_TREE_HEIGHT; ++src_row) {
        uint32_t dst_row = src_row - 1;
        for (Column col : merkle_columns) {
            FF value = trace.get(col, src_row);
            trace.set(col, dst_row, value);
        }
    }

    // Clear old row 42 (now vacated)
    for (Column col : merkle_columns) {
        trace.set(col, NULLIFIER_TREE_HEIGHT, FF(0));
    }

    // ========================================================================
    // Step 6: Apply the EXPLOIT - only change read_root at row 0
    // ========================================================================
    FF R_fake = FF(12345); // Arbitrary fake root
    ASSERT_NE(R_legit, R_fake) << "Exploit requires different roots";

    // The shifted trace now has:
    //   - Row 0: start=1, path_len=42, read_root=R_legit (about to become R_fake)
    //   - Rows 1..40: middle rows of merkle check
    //   - Row 41: end=1, read_root=R_legit (still correct)

    // Verify shift worked correctly
    ASSERT_EQ(trace.get(C::merkle_check_start, 0), FF(1)) << "After shift: start=1 at row 0";
    ASSERT_EQ(trace.get(C::merkle_check_path_len, 0), FF(NULLIFIER_TREE_HEIGHT))
        << "After shift: path_len=42 at row 0 (matches tree_height!)";
    ASSERT_EQ(trace.get(C::merkle_check_end, 41), FF(1)) << "After shift: end=1 at row 41";

    // Now apply the exploit: change read_root ONLY at row 0
    trace.set(C::merkle_check_read_root, 0, R_fake);

    // Also update nullifier_check_root to match (caller expects R_fake now)
    trace.set(C::nullifier_check_root, 0, R_fake);

    // IMPORTANT: We do NOT change tree_height or low_leaf_index!
    // The lookup still uses:
    //   - tree_height = 42 (matches path_len=42 at row 0)
    //   - low_leaf_index = 30 (matches index at row 0)
    // All lookup columns match naturally after the shift.

    // ========================================================================
    // Step 7: Verify the exploit is BLOCKED by the NO_ACTIVITY_ON_FIRST_ROW constraint
    // ========================================================================
    // The shifted trace has sel=1 at row 0, which violates the constraint:
    //   sel * precomputed.first_row = 0
    //
    // This constraint prevents merkle_check from being active at row 0, blocking the attack
    // where a malicious prover would exploit LATCH_CONDITION=1 at row 0 to break propagation.
    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace), "NO_ACTIVITY_ON_FIRST_ROW");

    // The relation check already rejects the trace, so there's no need to test the lookup.
    // The exploit is blocked at the relation level before any lookup matching can occur.
}

} // namespace
} // namespace bb::avm2::constraining
