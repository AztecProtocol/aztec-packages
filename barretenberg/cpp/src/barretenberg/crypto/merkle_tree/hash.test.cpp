#include "hash.hpp"
#include "memory_tree.hpp"
#include <gtest/gtest.h>

#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

using namespace bb;
using namespace bb::crypto;

using Builder = UltraCircuitBuilder;

using field_ct = bb::stdlib::field_t<Builder>;
using witness_ct = bb::stdlib::witness_t<Builder>;

TEST(crypto_merkle_tree_hash, hash_native_vs_circuit)
{
    fr x = uint256_t(0x5ec473eb273a8011, 0x50160109385471ca, 0x2f3095267e02607d, 0x02586f4a39e69b86);
    Builder builder = Builder();
    witness_ct y = witness_ct(&builder, x);
    field_ct z = bb::stdlib::pedersen_hash<Builder>::hash({ y, y });
    auto zz = merkle_tree::hash_pair_native(x, x);

    EXPECT_EQ(z.get_value(), zz);
}

TEST(crypto_merkle_tree_hash, compute_tree_native)
{
    constexpr size_t depth = 2;
    merkle_tree::MemoryTree<merkle_tree::PedersenHashPolicy> mem_tree(depth);

    std::vector<fr> leaves;
    for (size_t i = 0; i < (size_t(1) << depth); i++) {
        auto input = fr::random_element();
        leaves.push_back(input);
        mem_tree.update_element(i, input);
    }

    std::vector<fr> tree_vector = merkle_tree::compute_tree_native(leaves);

    // Check if the tree vector matches the memory tree hashes
    for (size_t i = 0; i < tree_vector.size() - 1; i++) {
        EXPECT_EQ(tree_vector[i], mem_tree.hashes_[i]);
    }
    EXPECT_EQ(tree_vector.back(), mem_tree.root());
}
