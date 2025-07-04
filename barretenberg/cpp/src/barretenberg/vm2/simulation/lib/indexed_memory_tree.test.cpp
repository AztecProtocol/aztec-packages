#include "barretenberg/vm2/simulation/lib/indexed_memory_tree.hpp"

#include "gmock/gmock.h"
#include <gtest/gtest.h>

#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/testing/macros.hpp"

namespace bb::avm2::simulation {

namespace {

using Poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

struct LeafValue {
    FF key;

    LeafValue(const FF& key)
        : key(key)
    {}

    static bool is_updateable() { return false; }

    bool operator==(LeafValue const& other) const { return key == other.key; }

    fr get_key() const { return key; }

    bool is_empty() const { return key.is_zero(); }

    std::vector<fr> get_hash_inputs(fr nextKey, fr nextIndex) const
    {
        return std::vector<fr>({ key, nextKey, nextIndex });
    }

    static LeafValue empty() { return { fr::zero() }; }

    static LeafValue padding(index_t i) { return { i }; }

    static std::string name() { return "LeafValue"; }

    [[maybe_unused]] friend std::ostream& operator<<(std::ostream& os, const LeafValue& v)
    {
        os << "key = " << v.key;
        return os;
    }
};

struct UpdatableLeafValue {
    FF key;
    FF value;

    UpdatableLeafValue(const FF& key, const FF& value)
        : key(key)
        , value(value)
    {}

    static bool is_updateable() { return true; }

    bool operator==(UpdatableLeafValue const& other) const { return key == other.key && value == other.value; }

    fr get_key() const { return key; }

    bool is_empty() const { return key.is_zero() && value.is_zero(); }

    std::vector<fr> get_hash_inputs(fr nextKey, fr nextIndex) const
    {
        return std::vector<fr>({ key, value, nextKey, nextIndex });
    }

    static UpdatableLeafValue empty() { return { fr::zero(), fr::zero() }; }

    static UpdatableLeafValue padding(index_t i) { return { i, fr::zero() }; }

    static std::string name() { return "UpdatableLeafValue"; }

    [[maybe_unused]] friend std::ostream& operator<<(std::ostream& os, const UpdatableLeafValue& v)
    {
        os << "key = " << v.key << " : value = " << v.value;
        return os;
    }
};

using Tree = IndexedMemoryTree<LeafValue, Poseidon2HashPolicy>;
using UpdatableTree = IndexedMemoryTree<UpdatableLeafValue, Poseidon2HashPolicy>;

TEST(IndexedMemoryTree, Append)
{
    Tree tree(5, 1);
    auto prev_snapshot = tree.get_snapshot();

    LeafValue leaf(42);
    auto result = tree.insert_indexed_leaves({ { leaf } });

    auto snapshot_after = tree.get_snapshot();

    EXPECT_EQ(result.insertion_witness_data.size(), 1);
    EXPECT_EQ(result.low_leaf_witness_data.size(), 1);

    LeafUpdateWitnessData<LeafValue> low_leaf_witness_data = result.low_leaf_witness_data[0];
    LeafUpdateWitnessData<LeafValue> insertion_witness_data = result.insertion_witness_data[0];

    // Low leaf is the prefill
    EXPECT_EQ(low_leaf_witness_data.index, 0);

    // Memberhsip check old padding leaf
    IndexedLeaf<LeafValue> padding_leaf(LeafValue::padding(1), 0, 0);
    EXPECT_EQ(low_leaf_witness_data.leaf, padding_leaf);

    EXPECT_EQ(
        unconstrained_root_from_path(Poseidon2::hash(padding_leaf.get_hash_inputs()), 0, low_leaf_witness_data.path),
        prev_snapshot.root);

    // Reconstruct intermediate root:
    padding_leaf.nextIndex = 1;
    padding_leaf.nextKey = leaf.key;

    auto intermediate_root =
        unconstrained_root_from_path(Poseidon2::hash(padding_leaf.get_hash_inputs()), 0, low_leaf_witness_data.path);

    // Insertion leaf should be the new leaf

    // Membership check a zero at the insertion index
    EXPECT_EQ(unconstrained_root_from_path(0, 1, insertion_witness_data.path), intermediate_root);

    IndexedLeaf<LeafValue> inserted_leaf(leaf, 0, 0);
    EXPECT_EQ(insertion_witness_data.leaf, inserted_leaf);

    auto final_root =
        unconstrained_root_from_path(Poseidon2::hash(inserted_leaf.get_hash_inputs()), 1, insertion_witness_data.path);

    EXPECT_EQ(snapshot_after.root, final_root);
    EXPECT_EQ(snapshot_after.nextAvailableLeafIndex, 2);
}

TEST(IndexedMemoryTree, Update)
{
    UpdatableTree tree(5, 1);
    auto prev_snapshot = tree.get_snapshot();

    UpdatableLeafValue leaf(1, 43);
    auto result = tree.insert_indexed_leaves({ { leaf } });

    auto snapshot_after = tree.get_snapshot();

    EXPECT_EQ(result.insertion_witness_data.size(), 1);
    EXPECT_EQ(result.low_leaf_witness_data.size(), 1);

    LeafUpdateWitnessData<UpdatableLeafValue> low_leaf_witness_data = result.low_leaf_witness_data[0];
    LeafUpdateWitnessData<UpdatableLeafValue> insertion_witness_data = result.insertion_witness_data[0];

    // Low leaf is the prefill
    EXPECT_EQ(low_leaf_witness_data.index, 0);

    // Memberhsip check old padding leaf
    IndexedLeaf<UpdatableLeafValue> padding_leaf(UpdatableLeafValue::padding(1), 0, 0);
    EXPECT_EQ(low_leaf_witness_data.leaf, padding_leaf);

    EXPECT_EQ(
        unconstrained_root_from_path(Poseidon2::hash(padding_leaf.get_hash_inputs()), 0, low_leaf_witness_data.path),
        prev_snapshot.root);

    // Update padding leaf
    padding_leaf.leaf.value = leaf.value;

    auto intermediate_root =
        unconstrained_root_from_path(Poseidon2::hash(padding_leaf.get_hash_inputs()), 0, low_leaf_witness_data.path);

    // No insertion
    EXPECT_EQ(snapshot_after.root, intermediate_root);
    EXPECT_EQ(snapshot_after.nextAvailableLeafIndex, 1);
}

TEST(IndexedMemoryTree, GetLeaves)
{
    Tree tree(5, 1);

    std::vector<LeafValue> leaves;

    // Insert leaves 100, 110, 120...
    for (size_t i = 10; i < 20; i++) {
        leaves.push_back(LeafValue(i * 10));
    }

    tree.insert_indexed_leaves(leaves);

    EXPECT_EQ(tree.get_low_indexed_leaf(FF(100)), GetLowIndexedLeafResponse(true, 1));
    EXPECT_EQ(tree.get_low_indexed_leaf(FF(105)), GetLowIndexedLeafResponse(false, 1));
    EXPECT_EQ(tree.get_low_indexed_leaf(FF(190)), GetLowIndexedLeafResponse(true, 10));
    EXPECT_EQ(tree.get_low_indexed_leaf(FF(195)), GetLowIndexedLeafResponse(false, 10));

    // Pading leaf
    EXPECT_EQ(tree.get_leaf_preimage(0), IndexedLeaf<LeafValue>(LeafValue::padding(1), 1, FF(100)));

    EXPECT_EQ(tree.get_leaf_preimage(1), IndexedLeaf<LeafValue>(LeafValue(100), 2, FF(110)));
    // Last leaf
    EXPECT_EQ(tree.get_leaf_preimage(10), IndexedLeaf<LeafValue>(LeafValue(190), 0, 0));
}

TEST(IndexedMemoryTree, GetSiblingPath)
{
    Tree tree(5, 1);
    LeafValue leaf(100);
    tree.insert_indexed_leaves({ { leaf } });

    auto path = tree.get_sibling_path(1);

    EXPECT_EQ(path.size(), 5);
    EXPECT_EQ(unconstrained_root_from_path(Poseidon2::hash(leaf.get_hash_inputs(0, 0)), 1, path),
              tree.get_snapshot().root);
}

TEST(IndexedMemoryTree, Full)
{
    Tree tree(2, 1);
    tree.insert_indexed_leaves({ { LeafValue(100) } });
    tree.insert_indexed_leaves({ { LeafValue(110) } });
    tree.insert_indexed_leaves({ { LeafValue(120) } });
    EXPECT_THROW_WITH_MESSAGE(tree.insert_indexed_leaves({ { LeafValue(130) } }), "IndexedMemoryTree is full");
}

} // namespace

} // namespace bb::avm2::simulation
