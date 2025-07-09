#include "barretenberg/vm2/simulation/lib/written_slots_tree.hpp"

#include <gtest/gtest.h>

namespace bb::avm2::simulation {

namespace {

TEST(AvmWrittenSlotsTree, CorrectRoot)
{
    auto snapshot = build_public_data_slots_tree().get_snapshot();
    EXPECT_EQ(snapshot.root, FF(AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_INITIAL_ROOT));
    EXPECT_EQ(snapshot.nextAvailableLeafIndex, AVM_WRITTEN_PUBLIC_DATA_SLOTS_TREE_INITIAL_SIZE);
}

} // namespace

} // namespace bb::avm2::simulation
