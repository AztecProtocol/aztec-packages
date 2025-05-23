#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <vector>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using testing::ElementsAre;
using testing::Field;

using R = TestTraceContainer::Row;
using Poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
using simulation::MerkleCheckEvent;

TEST(MerkleCheckTraceGenTest, MerkleRead)
{
    TestTraceContainer trace;
    MerkleCheckTraceBuilder builder;

    FF leaf_value = FF(123);
    uint64_t leaf_index = 1; // Odd index

    // Level 1 sibling
    FF sibling_value_1 = FF(456);

    // Compute hash for level 1
    FF left_node_1 = sibling_value_1; // For odd index, sibling is left
    FF right_node_1 = leaf_value;     // For odd index, leaf is right
    FF output_hash_1 = Poseidon2::hash({ left_node_1, right_node_1 });

    // Level 2 sibling
    FF sibling_value_2 = FF(789);

    // Compute hash for level 2
    FF left_node_2 = output_hash_1; // For odd index 1 in level 1, parent is at index 0 (even) in level 2
    FF right_node_2 = sibling_value_2;
    FF output_hash_2 = Poseidon2::hash({ left_node_2, right_node_2 });

    std::vector<FF> sibling_path = { sibling_value_1, sibling_value_2 };
    FF root = output_hash_2; // Root is the final output hash

    MerkleCheckEvent event = {
        .leaf_value = leaf_value, .leaf_index = leaf_index, .sibling_path = sibling_path, .root = root
    };

    builder.process({ event }, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // First row is empty
                    AllOf(Field(&R::merkle_check_sel, 0)),
                    // First real row
                    AllOf(Field(&R::merkle_check_sel, 1),
                          Field(&R::merkle_check_write, 0),
                          Field(&R::merkle_check_read_node, leaf_value),
                          Field(&R::merkle_check_index, leaf_index),
                          Field(&R::merkle_check_path_len, 2), // path length starts at 2
                          Field(&R::merkle_check_remaining_path_len_inv, FF(2 - 1).invert()),
                          Field(&R::merkle_check_read_root, root),
                          Field(&R::merkle_check_sibling, sibling_value_1),
                          Field(&R::merkle_check_start, 1),
                          Field(&R::merkle_check_end, 0),           // Not done yet
                          Field(&R::merkle_check_index_is_even, 0), // Odd index
                          Field(&R::merkle_check_read_left_node, left_node_1),
                          Field(&R::merkle_check_read_right_node, right_node_1),
                          Field(&R::merkle_check_constant_2, 2),
                          Field(&R::merkle_check_read_output_hash, output_hash_1)),
                    // Second real row
                    AllOf(Field(&R::merkle_check_sel, 1),
                          Field(&R::merkle_check_write, 0),
                          Field(&R::merkle_check_read_node, output_hash_1), // Previous output becomes new leaf
                          Field(&R::merkle_check_index, 0),                 // Index should be 0 at level 2
                          Field(&R::merkle_check_path_len, 1),              // Remaining path length is 0
                          Field(&R::merkle_check_remaining_path_len_inv, 0),
                          Field(&R::merkle_check_read_root, root),
                          Field(&R::merkle_check_sibling, sibling_value_2),
                          Field(&R::merkle_check_start, 0),
                          Field(&R::merkle_check_end, 1), // Done after two layers
                          Field(&R::merkle_check_index_is_even, 1),
                          Field(&R::merkle_check_read_left_node, left_node_2),
                          Field(&R::merkle_check_read_right_node, right_node_2),
                          Field(&R::merkle_check_constant_2, 2),
                          Field(&R::merkle_check_read_output_hash, output_hash_2))));
}

TEST(MerkleCheckTraceGenTest, MerkleWrite)
{
    TestTraceContainer trace;
    MerkleCheckTraceBuilder builder;

    FF leaf_value = FF(123);
    FF new_leaf_value = FF(456);
    uint64_t leaf_index = 1; // Odd index

    // Level 1 sibling
    FF sibling_value_1 = FF(456);

    // Compute hash for level 1
    // For odd index, sibling is left, leaf is right
    FF read_output_hash_1 = Poseidon2::hash({ sibling_value_1, leaf_value });
    FF write_output_hash_1 = Poseidon2::hash({ sibling_value_1, new_leaf_value });

    // Level 2 sibling
    FF sibling_value_2 = FF(789);

    // Compute hash for level 2
    // For odd index 1 in level 1, parent is at index 0 (even) in level 2
    FF read_output_hash_2 = Poseidon2::hash({ read_output_hash_1, sibling_value_2 });
    FF write_output_hash_2 = Poseidon2::hash({ write_output_hash_1, sibling_value_2 });

    std::vector<FF> sibling_path = { sibling_value_1, sibling_value_2 };
    FF read_root = read_output_hash_2;
    FF write_root = write_output_hash_2;

    MerkleCheckEvent event = { .leaf_value = leaf_value,
                               .new_leaf_value = new_leaf_value,
                               .leaf_index = leaf_index,
                               .sibling_path = sibling_path,
                               .root = read_root,
                               .new_root = write_root };

    builder.process({ event }, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // First row is empty
                    AllOf(Field(&R::merkle_check_sel, 0)),
                    // First real row
                    AllOf(Field(&R::merkle_check_sel, 1),
                          Field(&R::merkle_check_write, 1),
                          Field(&R::merkle_check_read_node, leaf_value),
                          Field(&R::merkle_check_write_node, new_leaf_value),
                          Field(&R::merkle_check_index, leaf_index),
                          Field(&R::merkle_check_path_len, 2), // path length starts at 2
                          Field(&R::merkle_check_remaining_path_len_inv, FF(2 - 1).invert()),
                          Field(&R::merkle_check_read_root, read_root),
                          Field(&R::merkle_check_write_root, write_root),
                          Field(&R::merkle_check_sibling, sibling_value_1),
                          Field(&R::merkle_check_start, 1),
                          Field(&R::merkle_check_end, 0),           // Not done yet
                          Field(&R::merkle_check_index_is_even, 0), // Odd index
                          Field(&R::merkle_check_read_left_node, sibling_value_1),
                          Field(&R::merkle_check_read_right_node, leaf_value),
                          Field(&R::merkle_check_write_left_node, sibling_value_1),
                          Field(&R::merkle_check_write_right_node, new_leaf_value),
                          Field(&R::merkle_check_constant_2, 2),
                          Field(&R::merkle_check_read_output_hash, read_output_hash_1),
                          Field(&R::merkle_check_write_output_hash, write_output_hash_1)),
                    // Second real row
                    AllOf(Field(&R::merkle_check_sel, 1),
                          Field(&R::merkle_check_write, 1),
                          Field(&R::merkle_check_read_node, read_output_hash_1), // Previous output becomes new leaf
                          Field(&R::merkle_check_write_node, write_output_hash_1),
                          Field(&R::merkle_check_index, 0),    // Index should be 0 at level 2
                          Field(&R::merkle_check_path_len, 1), // Remaining path length is 0
                          Field(&R::merkle_check_remaining_path_len_inv, 0),
                          Field(&R::merkle_check_read_root, read_root),
                          Field(&R::merkle_check_write_root, write_root),
                          Field(&R::merkle_check_sibling, sibling_value_2),
                          Field(&R::merkle_check_start, 0),
                          Field(&R::merkle_check_end, 1), // Done after two layers
                          Field(&R::merkle_check_index_is_even, 1),
                          Field(&R::merkle_check_read_left_node, read_output_hash_1),
                          Field(&R::merkle_check_read_right_node, sibling_value_2),
                          Field(&R::merkle_check_write_left_node, write_output_hash_1),
                          Field(&R::merkle_check_write_right_node, sibling_value_2),
                          Field(&R::merkle_check_constant_2, 2),
                          Field(&R::merkle_check_read_output_hash, read_output_hash_2),
                          Field(&R::merkle_check_write_output_hash, write_output_hash_2))));
}

TEST(MerkleCheckTraceGenTest, MixedEvents)
{
    TestTraceContainer trace;
    MerkleCheckTraceBuilder builder;

    // First event
    FF leaf_value_1 = FF(111);
    uint64_t leaf_index_1 = 6;
    FF sibling_value_1 = FF(222);
    FF output_hash_1 = Poseidon2::hash({ leaf_value_1, sibling_value_1 });

    MerkleCheckEvent event1 = { .leaf_value = leaf_value_1,
                                .leaf_index = leaf_index_1,
                                .sibling_path = { sibling_value_1 },
                                .root = output_hash_1 };

    // Second event
    FF leaf_value_2 = FF(333);
    FF new_leaf_value_2 = FF(444);
    uint64_t leaf_index_2 = 11;
    FF sibling_value_2 = FF(444);
    FF read_output_hash_2 = Poseidon2::hash({ sibling_value_2, leaf_value_2 });
    FF write_output_hash_2 = Poseidon2::hash({ sibling_value_2, new_leaf_value_2 });

    MerkleCheckEvent event2 = { .leaf_value = leaf_value_2,
                                .new_leaf_value = new_leaf_value_2,
                                .leaf_index = leaf_index_2,
                                .sibling_path = { sibling_value_2 },
                                .root = read_output_hash_2,
                                .new_root = write_output_hash_2 };

    builder.process({ event1, event2 }, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // First row is empty
                    AllOf(Field(&R::merkle_check_sel, 0)),
                    // First real row (read)
                    AllOf(Field(&R::merkle_check_sel, 1),
                          Field(&R::merkle_check_write, 0),
                          Field(&R::merkle_check_read_node, leaf_value_1),
                          Field(&R::merkle_check_index, leaf_index_1),
                          Field(&R::merkle_check_path_len, 1),
                          Field(&R::merkle_check_remaining_path_len_inv, 0),
                          Field(&R::merkle_check_read_root, output_hash_1),
                          Field(&R::merkle_check_sibling, sibling_value_1),
                          Field(&R::merkle_check_start, 1),
                          Field(&R::merkle_check_end, 1),
                          Field(&R::merkle_check_index_is_even, 1),
                          Field(&R::merkle_check_read_left_node, leaf_value_1),
                          Field(&R::merkle_check_read_right_node, sibling_value_1),
                          Field(&R::merkle_check_constant_2, 2),
                          Field(&R::merkle_check_read_output_hash, output_hash_1)),
                    // Second real row (write)
                    AllOf(Field(&R::merkle_check_sel, 1),
                          Field(&R::merkle_check_write, 1),
                          Field(&R::merkle_check_read_node, leaf_value_2),
                          Field(&R::merkle_check_write_node, new_leaf_value_2),
                          Field(&R::merkle_check_index, leaf_index_2),
                          Field(&R::merkle_check_path_len, 1),
                          Field(&R::merkle_check_remaining_path_len_inv, 0),
                          Field(&R::merkle_check_read_root, read_output_hash_2),
                          Field(&R::merkle_check_write_root, write_output_hash_2),
                          Field(&R::merkle_check_sibling, sibling_value_2),
                          Field(&R::merkle_check_start, 1),
                          Field(&R::merkle_check_end, 1),
                          Field(&R::merkle_check_index_is_even, 0),
                          Field(&R::merkle_check_read_left_node, sibling_value_2),
                          Field(&R::merkle_check_read_right_node, leaf_value_2),
                          Field(&R::merkle_check_write_left_node, sibling_value_2),
                          Field(&R::merkle_check_write_right_node, new_leaf_value_2),
                          Field(&R::merkle_check_constant_2, 2),
                          Field(&R::merkle_check_read_output_hash, read_output_hash_2),
                          Field(&R::merkle_check_write_output_hash, write_output_hash_2))));
}

} // namespace
} // namespace bb::avm2::tracegen
