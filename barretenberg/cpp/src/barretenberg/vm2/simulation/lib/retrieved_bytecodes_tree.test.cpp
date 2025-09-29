#include "barretenberg/vm2/simulation/lib/retrieved_bytecodes_tree.hpp"

#include <gtest/gtest.h>

namespace bb::avm2::simulation {

namespace {

TEST(AvmRetrievedBytecodesTree, CorrectRoot)
{
    auto snapshot = build_retrieved_bytecodes_tree().get_snapshot();
    EXPECT_EQ(snapshot.root, FF(AVM_RETRIEVED_BYTECODES_TREE_INITIAL_ROOT));
    EXPECT_EQ(snapshot.nextAvailableLeafIndex, AVM_RETRIEVED_BYTECODES_TREE_INITIAL_SIZE);
}

} // namespace

} // namespace bb::avm2::simulation
