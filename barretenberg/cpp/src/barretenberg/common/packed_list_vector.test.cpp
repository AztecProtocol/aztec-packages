// packed_list_vector_test.cpp
//
// Google-Test suite for bb::PackedListVector<int>
// – version using EXPECT_DEATH for the run-time-assertion paths.

#include <gtest/gtest.h>

#include "packed_list_vector_impl.hpp"
#include <algorithm>
#include <vector>

// -----------------------------------------------------------------------------
// Helper: collect all values from one list into a vector (head→tail order)
// -----------------------------------------------------------------------------
namespace {
template <typename Node> auto collect(Node* head)
{
    std::vector<decltype(head->value)> out;
    for (auto* p = head; p; p = p->next) {
        out.push_back(p->value);
    }
    return out;
}
} // namespace

TEST(PackedListVector, BasicConstruction)
{
    const std::size_t N = 16;
    const std::size_t M = 5;
    bb::PackedListVector<int> plv(N, M);
    EXPECT_EQ(plv.size(), M);
    for (std::size_t i = 0; i < plv.size(); ++i) {
        EXPECT_EQ(plv.get_list(i), nullptr);
    }
}

// -----------------------------------------------------------------------------
// Push / Get / Size
// -----------------------------------------------------------------------------
TEST(PackedListVector, SinglePushPerList)
{
    bb::PackedListVector<int> plv(10, 2);
    auto* n0 = plv.add_to_list(0, 42);
    auto* n1 = plv.add_to_list(1, -3);

    ASSERT_NE(n0, nullptr);
    ASSERT_NE(n1, nullptr);

    EXPECT_EQ(plv.size(), 2);

    EXPECT_EQ(plv.get_list(0)->value, 42);
    EXPECT_EQ(plv.get_list(1)->value, -3);
    EXPECT_EQ(plv.get_list(0)->next, nullptr);
    EXPECT_EQ(plv.get_list(1)->next, nullptr);
}

TEST(PackedListVector, MultiplePushesPreserveLIFO)
{
    bb::PackedListVector<int> plv(8, 1);
    plv.add_to_list(0, 1);
    plv.add_to_list(0, 2);
    plv.add_to_list(0, 3); // list head should now be 3

    std::vector<int> vals = collect(plv.get_list(0));
    EXPECT_EQ(vals, (std::vector<int>{ 3, 2, 1 }));
    EXPECT_EQ(plv.size(), 1);
}

// -----------------------------------------------------------------------------
// Fibonacci test – construct first 11 Fibonacci numbers
// -----------------------------------------------------------------------------
TEST(PackedListVector, FibonacciSequence)
{
    const int fib[11] = { 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55 };
    bb::PackedListVector<int> plv(11, 1);

    for (int f : fib) {
        plv.add_to_list(0, f); // natural order
    }

    std::vector<int> expected(fib, fib + 11);
    std::reverse(expected.begin(), expected.end()); // should come back reversed

    EXPECT_EQ(collect(plv.get_list(0)), expected);
    EXPECT_EQ(plv.size(), 1);
}

// -----------------------------------------------------------------------------
// Error paths
// -----------------------------------------------------------------------------
TEST(PackedListVectorDeathTest, CapacityOverflowCausesDeath)
{
    bb::PackedListVector<int> plv(2, 1);
    plv.add_to_list(0, 0);
    plv.add_to_list(0, 1);

    // Third push exceeds capacity -> BB_ASSERT triggers -> process dies.
    EXPECT_DEATH(plv.add_to_list(0, 2), "Slab is full");
}

TEST(PackedListVectorDeathTest, BadListIndexCausesDeath)
{
    bb::PackedListVector<int> plv(4, 2);

    // list_index == 2 is out of bounds (valid: 0,1)
    EXPECT_DEATH(plv.add_to_list(2, 99), "List index out of bounds");
}

// -----------------------------------------------------------------------------
// Independence of lists
// -----------------------------------------------------------------------------
TEST(PackedListVector, SeparateListsStayIndependent)
{
    bb::PackedListVector<int> plv(6, 3);
    plv.add_to_list(0, 10);
    plv.add_to_list(1, 20);
    plv.add_to_list(2, 30);
    plv.add_to_list(0, 11); // push another to list-0

    EXPECT_EQ(collect(plv.get_list(0)), (std::vector<int>{ 11, 10 }));
    EXPECT_EQ(collect(plv.get_list(1)), (std::vector<int>{ 20 }));
    EXPECT_EQ(collect(plv.get_list(2)), (std::vector<int>{ 30 }));
}

// -----------------------------------------------------------------------------
// Contiguity guarantee
// -----------------------------------------------------------------------------
TEST(PackedListVector, NodesAreStoredContiguously)
{
    constexpr std::size_t N = 5;
    bb::PackedListVector<int> plv(N, 2);

    auto* n0 = plv.add_to_list(0, 0);
    auto* n1 = plv.add_to_list(0, 1);
    auto* n2 = plv.add_to_list(0, 2);
    auto* n3 = plv.add_to_list(0, 3);
    auto* n4 = plv.add_to_list(1, 3);

    EXPECT_EQ(reinterpret_cast<char*>(n1) - reinterpret_cast<char*>(n0), sizeof(bb::PackedListVector<int>::Node));
    EXPECT_EQ(reinterpret_cast<char*>(n2) - reinterpret_cast<char*>(n1), sizeof(bb::PackedListVector<int>::Node));
    EXPECT_EQ(reinterpret_cast<char*>(n3) - reinterpret_cast<char*>(n2), sizeof(bb::PackedListVector<int>::Node));
    EXPECT_EQ(reinterpret_cast<char*>(n4) - reinterpret_cast<char*>(n3), sizeof(bb::PackedListVector<int>::Node));
}

// -----------------------------------------------------------------------------
// Interleaved mutation pattern with base truth comparison
// -----------------------------------------------------------------------------
TEST(PackedListVector, InterleavedMutationWithBaseTruth)
{
    constexpr std::size_t capacity = 1024UL * 512;
    constexpr std::size_t num_lists = 1024;
    bb::PackedListVector<int> plv(capacity, num_lists);

    // Base truth: vector of vectors (each inner vector represents a list)
    std::vector<std::vector<int>> base_truth(num_lists);

    // Generate operations to fill the entire capacity
    std::vector<std::pair<std::size_t, int>> operations;
    operations.reserve(capacity);

    // Fill to capacity with interleaved pattern
    for (std::size_t i = 0; i < capacity; ++i) {
        std::size_t list_idx = i % num_lists;   // Round-robin across all lists
        int value = static_cast<int>(i + 1000); // Distinct values starting from 1000
        operations.emplace_back(list_idx, value);
    }

    // Execute all operations
    for (const auto& [list_idx, value] : operations) {
        // Update PackedListVector
        plv.add_to_list(list_idx, value);

        // Update base truth (LIFO order - new elements go to front)
        base_truth[list_idx].insert(base_truth[list_idx].begin(), value);
        std::vector<int> actual = collect(plv.get_list(list_idx));
        EXPECT_EQ(actual, base_truth[list_idx]) << "Mismatch in list " << list_idx << " while filling";
    }

    // Verify all lists match base truth after all operations
    for (std::size_t i = 0; i < num_lists; ++i) {
        std::vector<int> actual = collect(plv.get_list(i));
        EXPECT_EQ(actual, base_truth[i]) << "Mismatch in list " << i << " after filling to capacity";
    }

    // Final verification of list sizes and total capacity usage
    EXPECT_EQ(plv.size(), num_lists);
    std::size_t total_nodes = 0;
    for (std::size_t i = 0; i < num_lists; ++i) {
        std::vector<int> final_actual = collect(plv.get_list(i));
        EXPECT_EQ(final_actual.size(), base_truth[i].size()) << "Final size mismatch in list " << i;
        EXPECT_EQ(final_actual, base_truth[i]) << "Final content mismatch in list " << i;
        total_nodes += final_actual.size();
    }
    EXPECT_EQ(total_nodes, capacity) << "Total nodes should equal capacity";
}
