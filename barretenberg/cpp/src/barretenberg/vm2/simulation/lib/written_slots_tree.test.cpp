#include "barretenberg/vm2/simulation/lib/written_slots_tree.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"

#include <chrono>
#include <gmock/gmock.h>
#include <gtest/gtest.h>
#include <stack>

namespace bb::avm2::simulation {
using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

TEST(AvmWrittenSlotsTree, Construction)
{

    auto start = std::chrono::high_resolution_clock::now();
    WrittenPublicDataSlotsTree tree(6, 1);
    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
    std::cout << "Construction of tree took " << duration.count() << " microseconds" << std::endl;
}

TEST(AvmWrittenSlotsTree, Benchmark)
{
    WrittenPublicDataSlotsTree tree(6, 1);

    // Time insertion of 63 leaves
    std::vector<WrittenPublicDataSlotLeafValue> leaves;
    for (size_t i = 0; i < 63; ++i) {
        leaves.push_back(WrittenPublicDataSlotLeafValue(FF::random_element()));
    }

    auto start = std::chrono::high_resolution_clock::now();
    tree.insert_indexed_leaves(leaves);
    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
    std::cout << "Insertion of 63 leaves took " << duration.count() << " microseconds" << std::endl;
}

TEST(AvmWrittenSlotsTree, BenchmarkStack)
{
    std::stack<WrittenPublicDataSlotsTree> tree_stack = {};
    WrittenPublicDataSlotsTree tree(6, 1);

    // Time insertion of 63 leaves
    std::vector<WrittenPublicDataSlotLeafValue> leaves;
    for (size_t i = 0; i < 63; ++i) {
        leaves.push_back(WrittenPublicDataSlotLeafValue(FF::random_element()));
    }

    tree.insert_indexed_leaves(leaves);

    tree_stack.push(std::move(tree));

    auto start = std::chrono::high_resolution_clock::now();
    // Grow the stack
    for (size_t i = 0; i < 6000; ++i) {
        tree_stack.push(tree_stack.top());
    }

    // Unwind the stack
    for (size_t i = 0; i < 6000; ++i) {
        WrittenPublicDataSlotsTree current_tree = std::move(tree_stack.top());
        tree_stack.pop();
        tree_stack.top() = std::move(current_tree);
    }
    auto end = std::chrono::high_resolution_clock::now();

    ASSERT_EQ(tree_stack.size(), 1);

    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
    std::cout << "Winding and unwinding the stack took " << duration.count() << " microseconds" << std::endl;
}

TEST(AvmWrittenSlotsTree, BenchmarkHash)
{
    std::vector<FF> values;
    for (size_t i = 0; i < 2000; ++i) {
        values.push_back(FF::random_element());
    }

    auto start = std::chrono::high_resolution_clock::now();
    FF result = RawPoseidon2::hash(values);
    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
    std::cout << "Hashing 2000 values took " << duration.count() << " microseconds, result: " << result << std::endl;
}

} // namespace bb::avm2::simulation
