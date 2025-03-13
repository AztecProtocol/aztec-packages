#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/merkle_check.hpp"

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
    FF root = root_from_path(leaf_value, leaf_index, sibling_path);
    merkle_check.assert_membership(leaf_value, leaf_index, sibling_path, root);

    MerkleCheckEvent expect_event = {
        .leaf_value = leaf_value,
        .leaf_index = leaf_index,
        .sibling_path = sibling_path,
        .root = root,
    };

    EXPECT_THAT(emitter.dump_events(), ElementsAre(expect_event));
}

} // namespace
} // namespace bb::avm2::simulation
