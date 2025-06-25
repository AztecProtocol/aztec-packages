#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cmath>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_merkle_check.hpp"
#include "barretenberg/vm2/generated/relations/merkle_check.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/merkle_check.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using simulation::EventEmitter;
using simulation::MerkleCheck;
using simulation::MerkleCheckEvent;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::root_from_path;

using tracegen::MerkleCheckTraceBuilder;
using tracegen::Poseidon2TraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using merkle_check = bb::avm2::merkle_check<FF>;
using UnconstrainedPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

TEST(MerkleCheckConstrainingTest, EmptyRow)
{
    check_relation<merkle_check>(testing::empty_trace());
}

TEST(MerkleCheckConstrainingTest, TraceContinuity)
{
    // Test that the trace is contiguous
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 }, { C::merkle_check_sel, 0 } },
        { { C::merkle_check_sel, 1 } },
        { { C::merkle_check_sel, 1 } },
        { { C::merkle_check_sel, 0 } },
        { { C::merkle_check_sel, 0 } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_TRACE_CONTINUITY);

    const uint32_t last_row_idx = 4;
    // Negative test - now modify to an incorrect value
    trace.set(C::merkle_check_sel, last_row_idx, 1); // This should fail - sel went from 0 back to 1

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_TRACE_CONTINUITY),
                              "TRACE_CONTINUITY");
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

TEST(MerkleCheckConstrainingTest, StartAfterLatch)
{
    // Test constraint: sel' * (start' - LATCH_CONDITION) = 0
    // After a row with end=1, the next row with sel=1 must have start=1
    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_start, 0 },
          { C::merkle_check_end, 1 } },                               // end=1 triggers LATCH_CONDITION
        { { C::merkle_check_sel, 1 }, { C::merkle_check_start, 1 } }, // start=1 after LATCH is correct
    });

    check_relation<merkle_check>(trace, merkle_check::SR_START_AFTER_LATCH);

    // First row has precomputed_first_row=1, which also triggers LATCH_CONDITION
    TestTraceContainer trace2({
        { { C::precomputed_first_row, 1 }, { C::merkle_check_sel, 0 } },
        { { C::merkle_check_sel, 1 }, { C::merkle_check_start, 1 } }, // start=1 after precomputed_first_row is correct
    });

    check_relation<merkle_check>(trace2, merkle_check::SR_START_AFTER_LATCH);

    // Negative test - start=0 after LATCH
    trace.set(C::merkle_check_start, 1, 0); // This should fail - start should be 1 after LATCH

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_START_AFTER_LATCH),
                              "START_AFTER_LATCH");
}

TEST(MerkleCheckConstrainingTest, SelectorOnEnd)
{
    // Test constraint: end * (1 - sel) = 0
    // If end=1, sel must be 1
    TestTraceContainer trace({
        { { C::merkle_check_end, 1 }, { C::merkle_check_sel, 1 } }, // sel=1 when end=1 is correct
    });

    check_relation<merkle_check>(trace, merkle_check::SR_SELECTOR_ON_END);

    // Negative test - now modify to an incorrect value
    trace.set(C::merkle_check_sel, 0, 0); // This should fail - sel cannot be 0 when end=1

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_SELECTOR_ON_END), "SELECTOR_ON_END");
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
          { C::merkle_check_remaining_path_len_inv, FF(1).invert() },
          { C::merkle_check_end, 0 } },
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_path_len, 1 },
          { C::merkle_check_remaining_path_len_inv, 0 },
          { C::merkle_check_end, 1 } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_END_WHEN_PATH_EMPTY);

    // Negative test - now modify to an incorrect value and verify it fails
    trace.set(C::merkle_check_end, 1, 0); // Should be 1, change to 0

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_END_WHEN_PATH_EMPTY),
                              "END_WHEN_PATH_EMPTY");
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

TEST(MerkleCheckConstrainingTest, AssignCurrentReadNodeLeftOrRight)
{
    // Test even index (current_node goes to left_node)
    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_index_is_even, 1 },
          { C::merkle_check_read_node, 123 },
          { C::merkle_check_sibling, 456 },
          { C::merkle_check_read_left_node, 123 },
          { C::merkle_check_read_right_node, 456 } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_ASSIGN_NODE_LEFT_OR_RIGHT_READ);

    // Test odd index (current_node goes to right_node)
    TestTraceContainer trace2({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_index_is_even, 0 },
          { C::merkle_check_read_node, 123 },
          { C::merkle_check_sibling, 456 },
          { C::merkle_check_read_left_node, 456 },
          { C::merkle_check_read_right_node, 123 } },
    });

    check_relation<merkle_check>(trace2, merkle_check::SR_ASSIGN_NODE_LEFT_OR_RIGHT_READ);

    // Negative test - now modify to an incorrect value and verify it fails
    trace2.set(C::merkle_check_read_left_node, 0, 123);  // Should be 456
    trace2.set(C::merkle_check_read_right_node, 0, 456); // Should be 123

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace2, merkle_check::SR_ASSIGN_NODE_LEFT_OR_RIGHT_READ),
                              "ASSIGN_NODE_LEFT_OR_RIGHT_READ");
}

TEST(MerkleCheckConstrainingTest, AssignCurrentWriteNodeLeftOrRight)
{
    // Test even index (current_node goes to left_node)
    TestTraceContainer trace({
        { { C::merkle_check_write, 1 },
          { C::merkle_check_index_is_even, 1 },
          { C::merkle_check_write_node, 123 },
          { C::merkle_check_sibling, 456 },
          { C::merkle_check_write_left_node, 123 },
          { C::merkle_check_write_right_node, 456 } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_ASSIGN_NODE_LEFT_OR_RIGHT_WRITE);

    // Test odd index (current_node goes to right_node)
    TestTraceContainer trace2({
        { { C::merkle_check_write, 1 },
          { C::merkle_check_index_is_even, 0 },
          { C::merkle_check_write_node, 123 },
          { C::merkle_check_sibling, 456 },
          { C::merkle_check_write_left_node, 456 },
          { C::merkle_check_write_right_node, 123 } },
    });

    check_relation<merkle_check>(trace2, merkle_check::SR_ASSIGN_NODE_LEFT_OR_RIGHT_WRITE);

    // Negative test - now modify to an incorrect value and verify it fails
    trace2.set(C::merkle_check_write_left_node, 0, 123);  // Should be 456
    trace2.set(C::merkle_check_write_right_node, 0, 456); // Should be 123

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace2, merkle_check::SR_ASSIGN_NODE_LEFT_OR_RIGHT_WRITE),
                              "ASSIGN_NODE_LEFT_OR_RIGHT_WRITE");
}

TEST(MerkleCheckConstrainingTest, AssignSiblingLeftOrRightRead)
{
    // Test even index (sibling goes to right_node)
    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_index_is_even, 1 },
          { C::merkle_check_read_node, 123 },
          { C::merkle_check_sibling, 456 },
          { C::merkle_check_read_left_node, 123 },
          { C::merkle_check_read_right_node, 456 } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_ASSIGN_SIBLING_LEFT_OR_RIGHT_READ);

    // Test odd index (sibling goes to left_node)
    TestTraceContainer trace2({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_index_is_even, 0 },
          { C::merkle_check_read_node, 123 },
          { C::merkle_check_sibling, 456 },
          { C::merkle_check_read_left_node, 456 },
          { C::merkle_check_read_right_node, 123 } },
    });

    check_relation<merkle_check>(trace2, merkle_check::SR_ASSIGN_SIBLING_LEFT_OR_RIGHT_READ);

    // Negative test - now modify to an incorrect value and verify it fails
    trace2.set(C::merkle_check_read_left_node, 0, 123);  // Should be 456
    trace2.set(C::merkle_check_read_right_node, 0, 456); // Should be 123

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace2, merkle_check::SR_ASSIGN_SIBLING_LEFT_OR_RIGHT_READ),
                              "ASSIGN_SIBLING_LEFT_OR_RIGHT_READ");
}

TEST(MerkleCheckConstrainingTest, AssignSiblingLeftOrRightWrite)
{
    // Test even index (sibling goes to right_node)
    TestTraceContainer trace({
        { { C::merkle_check_write, 1 },
          { C::merkle_check_index_is_even, 1 },
          { C::merkle_check_write_node, 123 },
          { C::merkle_check_sibling, 456 },
          { C::merkle_check_write_left_node, 123 },
          { C::merkle_check_write_right_node, 456 } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_ASSIGN_SIBLING_LEFT_OR_RIGHT_WRITE);

    // Test odd index (sibling goes to left_node)
    TestTraceContainer trace2({
        { { C::merkle_check_write, 1 },
          { C::merkle_check_index_is_even, 0 },
          { C::merkle_check_write_node, 123 },
          { C::merkle_check_sibling, 456 },
          { C::merkle_check_write_left_node, 456 },
          { C::merkle_check_write_right_node, 123 } },
    });

    check_relation<merkle_check>(trace2, merkle_check::SR_ASSIGN_SIBLING_LEFT_OR_RIGHT_WRITE);

    // Negative test - now modify to an incorrect value and verify it fails
    trace2.set(C::merkle_check_write_left_node, 0, 123);  // Should be 456
    trace2.set(C::merkle_check_write_right_node, 0, 456); // Should be 123

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace2, merkle_check::SR_ASSIGN_SIBLING_LEFT_OR_RIGHT_WRITE),
                              "ASSIGN_SIBLING_LEFT_OR_RIGHT_WRITE");
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
    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });
    MerkleCheckTraceBuilder builder;

    // Create a Merkle tree path with 3 levels
    FF leaf_value = FF(123);
    uint64_t leaf_index = 5;

    // Create a sibling path of length 3
    std::vector<FF> sibling_path = { FF(456), FF(789), FF(3333) };

    // Compute expected root
    FF root = root_from_path(leaf_value, leaf_index, sibling_path);

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
    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });
    MerkleCheckTraceBuilder builder;

    // Create a Merkle tree path with 3 levels
    FF leaf_value = FF(123);
    FF new_leaf_value = FF(456);
    uint64_t leaf_index = 5;

    // Create a sibling path of length 3
    std::vector<FF> sibling_path = { FF(456), FF(789), FF(3333) };

    // Compute read root
    FF root = root_from_path(leaf_value, leaf_index, sibling_path);
    // Compute new root
    FF new_root = root_from_path(new_leaf_value, leaf_index, sibling_path);

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

TEST(MerkleCheckConstrainingTest, ReadWithInteractions)
{
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check_sim(poseidon2, merkle_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;

    FF leaf_value = 333;
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path = { 10, 2, 30, 4, 50, 6 };
    FF root = root_from_path(leaf_value, leaf_index, sibling_path);
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

TEST(MerkleCheckConstrainingTest, WriteWithInteractions)
{
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check_sim(poseidon2, merkle_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    Poseidon2TraceBuilder poseidon2_builder;
    MerkleCheckTraceBuilder merkle_check_builder;

    FF leaf_value = 333;
    FF new_leaf_value = 444;
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path = { 10, 2, 30, 4, 50, 6 };
    FF root = root_from_path(leaf_value, leaf_index, sibling_path);
    FF expected_new_root = root_from_path(new_leaf_value, leaf_index, sibling_path);

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

TEST(MerkleCheckConstrainingTest, MultipleWithTracegen)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
    });
    MerkleCheckTraceBuilder builder;

    FF leaf_value = 333;
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path = { 10, 2, 30, 4, 50, 6 };
    FF root = root_from_path(leaf_value, leaf_index, sibling_path);
    MerkleCheckEvent event = {
        .leaf_value = leaf_value, .leaf_index = leaf_index, .sibling_path = sibling_path, .root = root
    };

    FF leaf_value2 = 444;
    FF new_leaf_value2 = 555;
    uint64_t leaf_index2 = 40;
    std::vector<FF> sibling_path2 = { 11, 22, 33, 44, 55, 66 };
    FF root2 = root_from_path(leaf_value2, leaf_index2, sibling_path2);
    FF new_root2 = root_from_path(new_leaf_value2, leaf_index2, sibling_path2);
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
    trace.set(Column::merkle_check_remaining_path_len_inv, after_last_row_index, 0);
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
    trace.set(Column::merkle_check_constant_2, after_last_row_index, 0);
    trace.set(Column::merkle_check_read_output_hash, after_last_row_index, 0);
    trace.set(Column::merkle_check_write_output_hash, after_last_row_index, 0);

    check_relation<merkle_check>(trace);
}

TEST(MerkleCheckConstrainingTest, MultipleWithInteractions)
{
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);

    EventEmitter<MerkleCheckEvent> merkle_event_emitter;
    MerkleCheck merkle_check_sim(poseidon2, merkle_event_emitter);

    TestTraceContainer trace({ { { C::precomputed_first_row, 1 } } });
    MerkleCheckTraceBuilder merkle_check_builder;
    Poseidon2TraceBuilder poseidon2_builder;

    FF leaf_value = 333;
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path = { 10, 2, 30, 4, 50, 6 };
    FF root = root_from_path(leaf_value, leaf_index, sibling_path);

    merkle_check_sim.assert_membership(leaf_value, leaf_index, sibling_path, root);

    FF leaf_value2 = 444;
    FF new_leaf_value2 = 555;
    uint64_t leaf_index2 = 40;
    std::vector<FF> sibling_path2 = { 11, 22, 33, 44, 55, 66 };
    FF root2 = root_from_path(leaf_value2, leaf_index2, sibling_path2);
    FF expected_new_root2 = root_from_path(new_leaf_value2, leaf_index2, sibling_path2);

    FF new_root2 = merkle_check_sim.write(leaf_value2, new_leaf_value2, leaf_index2, sibling_path2, root2);
    EXPECT_EQ(new_root2, expected_new_root2);

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    merkle_check_builder.process(merkle_event_emitter.dump_events(), trace);

    check_interaction<MerkleCheckTraceBuilder,
                      lookup_merkle_check_merkle_poseidon2_read_settings,
                      lookup_merkle_check_merkle_poseidon2_write_settings>(trace);

    check_relation<merkle_check>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
