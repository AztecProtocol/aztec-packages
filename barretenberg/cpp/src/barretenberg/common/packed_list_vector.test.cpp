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

// -----------------------------------------------------------------------------
// Construction and trivial invariants
// -----------------------------------------------------------------------------
TEST(PackedListVector, ZeroCapacityConstruction)
{
    bb::PackedListVector<int> plv(0, 3);
    EXPECT_EQ(plv.capacity(), 0);
    EXPECT_EQ(plv.list_count(), 3);
    for (std::size_t i = 0; i < plv.list_count(); ++i) {
        EXPECT_EQ(plv.get_list(i), nullptr);
    }
}

TEST(PackedListVector, PositiveCapacityConstruction)
{
    const std::size_t N = 16;
    const std::size_t M = 5;
    bb::PackedListVector<int> plv(N, M);
    EXPECT_EQ(plv.capacity(), N);
    EXPECT_EQ(plv.size(), 0);
    EXPECT_EQ(plv.list_count(), M);
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
    EXPECT_EQ(plv.size(), 3);
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
    EXPECT_EQ(plv.size(), 11);
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
