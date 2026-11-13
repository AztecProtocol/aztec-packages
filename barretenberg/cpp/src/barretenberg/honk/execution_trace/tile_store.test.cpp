#include "execution_trace_block.hpp"
#include <gtest/gtest.h>

namespace bb {
TEST(TileStore, PreservesValuesAcrossGrowthCopyMoveAndReuse)
{
    TileStore<uint64_t> store;
    for (uint64_t i = 0; i < 257; ++i) {
        store.emplace_back() = i * 17;
    }
    const auto& view = store;
    for (size_t i = 0; i < store.size(); ++i) {
        EXPECT_EQ(view[i], i * 17);
    }
    TileStore<uint64_t> copy(store);
    copy[32] = 99;
    EXPECT_EQ(store[32], 32 * 17);
    TileStore<uint64_t> moved(std::move(copy));
    EXPECT_EQ(moved[32], 99);
    TileStore<uint64_t> assigned;
    assigned = store;
    EXPECT_TRUE(assigned == store);
    assigned = std::move(moved);
    EXPECT_EQ(assigned[32], 99);
    assigned.clear();
    EXPECT_EQ(assigned.size(), 0);
    assigned.reserve(64);
    EXPECT_EQ(assigned.emplace_back(), 0);
    assigned.shrink_to_fit();
    EXPECT_EQ(assigned.size(), 1);
}
} // namespace bb
