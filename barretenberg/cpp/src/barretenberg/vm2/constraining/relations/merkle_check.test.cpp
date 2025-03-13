#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cmath>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/flavor_settings.hpp"
#include "barretenberg/vm2/generated/relations/merkle_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

// TODO(dbanks12): is this okay? Should this merkle lib be moved to common?
#include "barretenberg/vm2/simulation/lib/merkle.hpp"

namespace bb::avm2::constraining {
namespace {

using simulation::root_from_path;
using tracegen::MerkleCheckTraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using merkle_check = bb::avm2::merkle_check<FF>;
using Poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

TEST(MerkleCheckConstrainingTest, EmptyRow)
{
    check_relation<merkle_check>(testing::empty_trace());
}

TEST(MerkleCheckConstrainingTest, SelIsBool)
{
    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 } },
        { { C::merkle_check_sel, 0 } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_MERKLE_SEL_IS_BOOL);
}

TEST(MerkleCheckConstrainingTest, NegativeSelIsBool)
{
    TestTraceContainer trace({
        { { C::merkle_check_sel, 2 } },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_MERKLE_SEL_IS_BOOL),
                              "MERKLE_SEL_IS_BOOL");
}

TEST(MerkleCheckConstrainingTest, PathLenDecrements)
{
    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 }, { C::merkle_check_latch, 0 }, { C::merkle_check_path_len, 3 } },
        { { C::merkle_check_sel, 1 }, { C::merkle_check_latch, 0 }, { C::merkle_check_path_len, 2 } },
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_latch, 1 },
          { C::merkle_check_path_len, 1 } }, // Final row with latch=1
    });

    check_relation<merkle_check>(trace, merkle_check::SR_PATH_LEN_DECREMENTS);
}

TEST(MerkleCheckConstrainingTest, NegativePathLenDecrements)
{
    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 }, { C::merkle_check_latch, 0 }, { C::merkle_check_path_len, 3 } },
        {
            { C::merkle_check_sel, 1 },
            { C::merkle_check_latch, 0 },
            { C::merkle_check_path_len, 1 } // Should be 2, not 1
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_PATH_LEN_DECREMENTS),
                              "PATH_LEN_DECREMENTS");
}

TEST(MerkleCheckConstrainingTest, LatchHighWhenPathEmpty)
{
    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_path_len, 1 },
          { C::merkle_check_path_len_inv, FF(1).invert() },
          { C::merkle_check_latch, 0 } },
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_path_len, 0 },
          { C::merkle_check_path_len_inv, 0 },
          { C::merkle_check_latch, 1 } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_LATCH_HIGH_WHEN_PATH_EMPTY);
}

TEST(MerkleCheckConstrainingTest, NegativeLatchHighWhenPathEmpty)
{
    // TODO(dbanks12): does inv need to be properly initialized here?
    TestTraceContainer trace({
        {
            { C::merkle_check_sel, 1 },
            { C::merkle_check_path_len, 0 },
            { C::merkle_check_path_len_inv, 0 }, // TODO(dbanks12): can't invert 0?
            { C::merkle_check_latch, 0 }         // Should be 1 when path_len is 0
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_LATCH_HIGH_WHEN_PATH_EMPTY),
                              "LATCH_HIGH_WHEN_PATH_EMPTY");
}

TEST(MerkleCheckConstrainingTest, LeafIndexIsBool)
{
    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 }, { C::merkle_check_leaf_index_is_even, 1 } },
        { { C::merkle_check_sel, 1 }, { C::merkle_check_leaf_index_is_even, 0 } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_LEAF_INDEX_IS_BOOL);
}

TEST(MerkleCheckConstrainingTest, NegativeLeafIndexIsBool)
{
    TestTraceContainer trace({
        {
            { C::merkle_check_sel, 1 }, { C::merkle_check_leaf_index_is_even, 2 } // Should be 0 or 1
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_LEAF_INDEX_IS_BOOL),
                              "LEAF_INDEX_IS_BOOL");
}

TEST(MerkleCheckConstrainingTest, NextLeafIndexIsHalved)
{
    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_latch, 0 },
          { C::merkle_check_leaf_index, 6 },
          { C::merkle_check_leaf_index_is_even, 1 } },
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_latch, 0 },
          { C::merkle_check_leaf_index, 3 }, // 6/2 = 3
          { C::merkle_check_leaf_index_is_even, 0 } },
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_latch, 1 },      // Set latch=1 for final row
          { C::merkle_check_leaf_index, 1 }, // 3/2 = 1
          { C::merkle_check_leaf_index_is_even, 0 } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_NEXT_LEAF_INDEX_IS_HALVED);

    // Test with odd index
    TestTraceContainer trace2({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_latch, 0 },
          { C::merkle_check_leaf_index, 7 },
          { C::merkle_check_leaf_index_is_even, 0 } },
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_latch, 0 },
          { C::merkle_check_leaf_index, 3 }, // (7-1)/2 = 3
          { C::merkle_check_leaf_index_is_even, 0 } },
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_latch, 1 },      // Set latch=1 for final row
          { C::merkle_check_leaf_index, 1 }, // 6/2 = 3
          { C::merkle_check_leaf_index_is_even, 0 } },
    });

    check_relation<merkle_check>(trace2, merkle_check::SR_NEXT_LEAF_INDEX_IS_HALVED);
}

TEST(MerkleCheckConstrainingTest, NegativeNextLeafIndexIsHalved)
{
    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_latch, 0 },
          { C::merkle_check_leaf_index, 6 },
          { C::merkle_check_leaf_index_is_even, 1 } },
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_leaf_index, 4 }, // Should be 3, not 4
          { C::merkle_check_leaf_index_is_even, 1 } },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_NEXT_LEAF_INDEX_IS_HALVED),
                              "NEXT_LEAF_INDEX_IS_HALVED");
}

TEST(MerkleCheckConstrainingTest, AssignLeafValueLeftOrRight)
{
    // Test even index (leaf_value goes to left_hash)
    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_leaf_index_is_even, 1 },
          { C::merkle_check_leaf_value, 123 },
          { C::merkle_check_sibling_value, 456 },
          { C::merkle_check_left_hash, 123 },
          { C::merkle_check_right_hash, 456 } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_ASSIGN_LEAF_VALUE_LEFT_OR_RIGHT);

    // Test odd index (leaf_value goes to right_hash)
    TestTraceContainer trace2({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_leaf_index_is_even, 0 },
          { C::merkle_check_leaf_value, 123 },
          { C::merkle_check_sibling_value, 456 },
          { C::merkle_check_left_hash, 456 },
          { C::merkle_check_right_hash, 123 } },
    });

    check_relation<merkle_check>(trace2, merkle_check::SR_ASSIGN_LEAF_VALUE_LEFT_OR_RIGHT);
}

TEST(MerkleCheckConstrainingTest, NegativeAssignLeafValueLeftOrRight)
{
    TestTraceContainer trace({
        {
            { C::merkle_check_sel, 1 },
            { C::merkle_check_leaf_index_is_even, 1 },
            { C::merkle_check_leaf_value, 123 },
            { C::merkle_check_sibling_value, 456 },
            { C::merkle_check_left_hash, 456 }, // Should be 123
            { C::merkle_check_right_hash, 123 } // Should be 456
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_ASSIGN_LEAF_VALUE_LEFT_OR_RIGHT),
                              "ASSIGN_LEAF_VALUE_LEFT_OR_RIGHT");
}

TEST(MerkleCheckConstrainingTest, AssignSiblingValueLeftOrRight)
{
    // Test even index (sibling_value goes to right_hash)
    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_leaf_index_is_even, 1 },
          { C::merkle_check_leaf_value, 123 },
          { C::merkle_check_sibling_value, 456 },
          { C::merkle_check_left_hash, 123 },
          { C::merkle_check_right_hash, 456 } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_ASSIGN_SIBLING_VALUE_LEFT_OR_RIGHT);

    // Test odd index (sibling_value goes to left_hash)
    TestTraceContainer trace2({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_leaf_index_is_even, 0 },
          { C::merkle_check_leaf_value, 123 },
          { C::merkle_check_sibling_value, 456 },
          { C::merkle_check_left_hash, 456 },
          { C::merkle_check_right_hash, 123 } },
    });

    check_relation<merkle_check>(trace2, merkle_check::SR_ASSIGN_SIBLING_VALUE_LEFT_OR_RIGHT);
}

TEST(MerkleCheckConstrainingTest, NegativeAssignSiblingValueLeftOrRight)
{
    TestTraceContainer trace({
        {
            { C::merkle_check_sel, 1 },
            { C::merkle_check_leaf_index_is_even, 0 },
            { C::merkle_check_leaf_value, 123 },
            { C::merkle_check_sibling_value, 456 },
            { C::merkle_check_left_hash, 123 }, // Should be 456
            { C::merkle_check_right_hash, 456 } // Should be 123
        },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_ASSIGN_SIBLING_VALUE_LEFT_OR_RIGHT),
                              "ASSIGN_SIBLING_VALUE_LEFT_OR_RIGHT");
}

TEST(MerkleCheckConstrainingTest, OutputHashIsNextRowsLeafValue)
{
    FF left_hash = FF(123);
    FF right_hash = FF(456);
    FF output_hash = Poseidon2::hash({ left_hash, right_hash });

    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_latch, 0 },
          { C::merkle_check_left_hash, left_hash },
          { C::merkle_check_right_hash, right_hash },
          { C::merkle_check_output_hash, output_hash } },
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_latch, 1 }, // Set latch=1 for final row
          { C::merkle_check_leaf_value, output_hash } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_OUTPUT_HASH_IS_NEXT_ROWS_LEAF_VALUE);
}

TEST(MerkleCheckConstrainingTest, NegativeOutputHashIsNextRowsLeafValue)
{
    FF left_hash = FF(123);
    FF right_hash = FF(456);
    FF output_hash = Poseidon2::hash({ left_hash, right_hash });
    FF wrong_next_leaf_value = output_hash + 1; // Incorrect value

    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 },
          { C::merkle_check_latch, 0 },
          { C::merkle_check_left_hash, left_hash },
          { C::merkle_check_right_hash, right_hash },
          { C::merkle_check_output_hash, output_hash } },
        { { C::merkle_check_sel, 1 }, { C::merkle_check_leaf_value, wrong_next_leaf_value } },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace, merkle_check::SR_OUTPUT_HASH_IS_NEXT_ROWS_LEAF_VALUE),
                              "OUTPUT_HASH_IS_NEXT_ROWS_LEAF_VALUE");
}

TEST(MerkleCheckConstrainingTest, OutputHashIsNotNextRowsLeafValueForLastRow)
{
    FF output_hash = FF(456);
    FF next_leaf_value = FF(789);

    TestTraceContainer trace({
        { { C::merkle_check_sel, 1 }, { C::merkle_check_latch, 1 }, { C::merkle_check_output_hash, output_hash } },
        { { C::merkle_check_sel, 1 }, { C::merkle_check_leaf_value, next_leaf_value } },
    });

    check_relation<merkle_check>(trace, merkle_check::SR_OUTPUT_HASH_IS_NEXT_ROWS_LEAF_VALUE);
}

TEST(MerkleCheckConstrainingTest, WithTracegen)
{
    TestTraceContainer trace;
    MerkleCheckTraceBuilder builder;

    // Create a Merkle tree path with 3 levels
    FF leaf_value = FF(123);
    uint64_t leaf_index = 5;

    // Create a sibling path of length 3
    std::vector<FF> sibling_path = { FF(456), FF(789), FF(3333) };

    // Compute expected root
    FF root = root_from_path(leaf_value, leaf_index, sibling_path);

    simulation::MerkleCheckEvent event = {
        .leaf_value = leaf_value, .leaf_index = leaf_index, .sibling_path = sibling_path, .root = root
    };

    builder.process({ event }, trace);

    // Check the relation for all rows
    check_relation<merkle_check>(trace);
}

TEST(MerkleCheckConstrainingTest, NegativeWithTracegen)
{
    TestTraceContainer trace;
    MerkleCheckTraceBuilder builder;

    // Create a Merkle tree path with correct data
    FF leaf_value = FF(123);
    uint64_t leaf_index = 5;

    // Sibling path
    std::vector<FF> sibling_path = { FF(456), FF(789), FF(3333) };

    // Compute expected root
    FF root = root_from_path(leaf_value, leaf_index, sibling_path);

    // Use an incorrect root
    FF incorrect_root = root + 1;

    simulation::MerkleCheckEvent event = {
        .leaf_value = leaf_value,
        .leaf_index = leaf_index,
        .sibling_path = sibling_path,
        .root = incorrect_root // Use incorrect root
    };

    builder.process({ event }, trace);

    // Use a trace manipulation to break the output hash value in the last row
    auto rows = trace.as_rows();
    // Corrupt the last row's output hash
    trace.set(C::merkle_check_output_hash, static_cast<uint32_t>(rows.size() - 1), incorrect_root);

    // The relation should fail
    // TODO(dbanks12): should fail due to PERM_MERKLE_POSEIDON2
    // EXPECT_THROW_WITH_MESSAGE(check_relation<merkle_check>(trace), "Relation merkle_check");
}

} // namespace
} // namespace bb::avm2::constraining
