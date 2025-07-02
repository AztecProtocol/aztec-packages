#include <gmock/gmock.h>
#include <gtest/gtest.h>
#include <optional>

#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/merkle_check_event.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/merkle_check.hpp"
#include "barretenberg/vm2/testing/macros.hpp"

namespace bb::avm2::simulation {
namespace {

using testing::ElementsAre;

TEST(MerkleCheckSimulationTest, AssertMembership)
{
    EventEmitter<Poseidon2HashEvent> hash_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_emitter;
    Poseidon2 poseidon2(hash_emitter, perm_emitter);

    EventEmitter<MerkleCheckEvent> emitter;
    MerkleCheck merkle_check(poseidon2, emitter);

    FF leaf_value = 333;
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path = { 10, 2, 30, 4, 50, 6 };
    FF root = unconstrained_root_from_path(leaf_value, leaf_index, sibling_path);

    merkle_check.assert_membership(leaf_value, leaf_index, sibling_path, root);
    MerkleCheckEvent expect_event = {
        .leaf_value = leaf_value,
        .leaf_index = leaf_index,
        .sibling_path = sibling_path,
        .root = root,
    };

    FF leaf_value2 = 334;
    uint64_t leaf_index2 = 31;
    std::vector<FF> sibling_path2 = { 10, 2, 30, 4, 50, 7 };
    FF root2 = unconstrained_root_from_path(leaf_value2, leaf_index2, sibling_path2);
    merkle_check.assert_membership(leaf_value2, leaf_index2, sibling_path2, root2);
    MerkleCheckEvent expect_event2 = {
        .leaf_value = leaf_value2,
        .leaf_index = leaf_index2,
        .sibling_path = sibling_path2,
        .root = root2,
    };

    const size_t expected_merkle_rows = sibling_path.size() + sibling_path2.size();

    EXPECT_THAT(emitter.dump_events(), ElementsAre(expect_event, expect_event2));

    EXPECT_EQ(hash_emitter.dump_events().size(), expected_merkle_rows);
}

TEST(MerkleCheckSimulationTest, Write)
{
    EventEmitter<Poseidon2HashEvent> hash_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_emitter;
    Poseidon2 poseidon2(hash_emitter, perm_emitter);

    EventEmitter<MerkleCheckEvent> emitter;
    MerkleCheck merkle_check(poseidon2, emitter);

    FF current_value = 333;
    FF new_value = 334;
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path = { 10, 2, 30, 4, 50, 6 };
    FF current_root = unconstrained_root_from_path(current_value, leaf_index, sibling_path);
    FF expected_new_root = unconstrained_root_from_path(new_value, leaf_index, sibling_path);

    MerkleCheckEvent expect_event = {
        .leaf_value = current_value,
        .new_leaf_value = new_value,
        .leaf_index = leaf_index,
        .sibling_path = sibling_path,
        .root = current_root,
        .new_root = expected_new_root,
    };

    FF new_root = merkle_check.write(current_value, new_value, leaf_index, sibling_path, current_root);

    EXPECT_EQ(new_root, expected_new_root);
    EXPECT_THAT(emitter.dump_events(), ElementsAre(expect_event));
    EXPECT_EQ(hash_emitter.dump_events().size(), sibling_path.size() * 2);
}

TEST(MerkleCheckSimulationTest, NegativeBadFinalIndex)
{
    NoopEventEmitter<Poseidon2HashEvent> hash_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_emitter;
    Poseidon2 poseidon2(hash_emitter, perm_emitter);

    EventEmitter<MerkleCheckEvent> emitter;
    MerkleCheck merkle_check(poseidon2, emitter);

    FF leaf_value = 333;
    uint64_t leaf_index = 64; // too large! halving it 5 times results in 2!
    std::vector<FF> sibling_path = { 10, 2, 30, 4, 50, 6 };
    FF root = unconstrained_root_from_path(leaf_value, leaf_index, sibling_path);

    EXPECT_THROW_WITH_MESSAGE(merkle_check.assert_membership(leaf_value, leaf_index, sibling_path, root),
                              "Merkle check's final node index must be 0 or 1");
    EXPECT_THROW_WITH_MESSAGE(merkle_check.write(leaf_value, 334, leaf_index, sibling_path, root),
                              "Merkle check's final node index must be 0 or 1");
}

TEST(MerkleCheckSimulationTest, NegativeWrongRoot)
{
    NoopEventEmitter<Poseidon2HashEvent> hash_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_emitter;
    Poseidon2 poseidon2(hash_emitter, perm_emitter);

    EventEmitter<MerkleCheckEvent> emitter;
    MerkleCheck merkle_check(poseidon2, emitter);

    FF leaf_value = 333;
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path = { 10, 2, 30, 4, 50, 6 };
    FF incorrect_root = 66;

    EXPECT_THROW_WITH_MESSAGE(merkle_check.assert_membership(leaf_value, leaf_index, sibling_path, incorrect_root),
                              "Merkle read check failed");
    EXPECT_THROW_WITH_MESSAGE(merkle_check.write(leaf_value, 334, leaf_index, sibling_path, incorrect_root),
                              "Merkle read check failed");
}

TEST(MerkleCheckSimulationTest, NegativeWrongLeafIndex)
{
    NoopEventEmitter<Poseidon2HashEvent> hash_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_emitter;
    Poseidon2 poseidon2(hash_emitter, perm_emitter);

    EventEmitter<MerkleCheckEvent> emitter;
    MerkleCheck merkle_check(poseidon2, emitter);

    FF leaf_value = 333;
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path = { 10, 2, 30, 4, 50, 6 };
    FF root = unconstrained_root_from_path(leaf_value, leaf_index, sibling_path);
    uint64_t incorrect_leaf_index = 31;
    EXPECT_THROW_WITH_MESSAGE(merkle_check.assert_membership(leaf_value, incorrect_leaf_index, sibling_path, root),
                              "Merkle read check failed");
    EXPECT_THROW_WITH_MESSAGE(merkle_check.write(leaf_value, 334, incorrect_leaf_index, sibling_path, root),
                              "Merkle read check failed");
}

TEST(MerkleCheckSimulationTest, NegativeWrongSiblingPath)
{
    NoopEventEmitter<Poseidon2HashEvent> hash_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_emitter;
    Poseidon2 poseidon2(hash_emitter, perm_emitter);

    EventEmitter<MerkleCheckEvent> emitter;
    MerkleCheck merkle_check(poseidon2, emitter);

    FF leaf_value = 333;
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path = { 10, 2, 30, 4, 50, 6 };
    FF root = unconstrained_root_from_path(leaf_value, leaf_index, sibling_path);
    // corrupt the sibling path
    sibling_path[2] = 11;

    EXPECT_THROW_WITH_MESSAGE(merkle_check.assert_membership(leaf_value, leaf_index, sibling_path, root),
                              "Merkle read check failed");
    EXPECT_THROW_WITH_MESSAGE(merkle_check.write(leaf_value, 334, leaf_index, sibling_path, root),
                              "Merkle read check failed");
}

TEST(MerkleCheckSimulationTest, NegativeWrongLeafValue)
{
    NoopEventEmitter<Poseidon2HashEvent> hash_emitter;
    NoopEventEmitter<Poseidon2PermutationEvent> perm_emitter;
    Poseidon2 poseidon2(hash_emitter, perm_emitter);

    EventEmitter<MerkleCheckEvent> emitter;
    MerkleCheck merkle_check(poseidon2, emitter);

    FF leaf_value = 333;
    uint64_t leaf_index = 30;
    std::vector<FF> sibling_path = { 10, 2, 30, 4, 50, 6 };
    FF root = unconstrained_root_from_path(leaf_value, leaf_index, sibling_path);
    FF incorrect_leaf_value = 334;

    EXPECT_THROW_WITH_MESSAGE(merkle_check.assert_membership(incorrect_leaf_value, leaf_index, sibling_path, root),
                              "Merkle read check failed");
    EXPECT_THROW_WITH_MESSAGE(merkle_check.write(incorrect_leaf_value, 334, leaf_index, sibling_path, root),
                              "Merkle read check failed");
}

} // namespace
} // namespace bb::avm2::simulation
