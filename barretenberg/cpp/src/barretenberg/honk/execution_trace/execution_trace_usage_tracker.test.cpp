#include "barretenberg/honk/execution_trace/execution_trace_usage_tracker.hpp"

#include <gtest/gtest.h>

using namespace bb;

/**
 * @brief Tests for some of the utility methods in ExecutionTraceUsageTrackerTest for equally distributing work across
 * threads for the perturbator/combiner calculations
 *
 */
class ExecutionTraceUsageTrackerTest : public ::testing::Test {};

// Test construction of the sorted disjoint union of active ranges from a more general set of ranges
TEST_F(ExecutionTraceUsageTrackerTest, ConstructUnionRanges)
{
    using Range = ExecutionTraceUsageTracker::Range;

    std::vector<Range> active_ranges = { { 4, 7 }, { 9, 13 }, { 1, 12 }, { 23, 40 }, { 17, 19 } };

    std::vector<Range> expected_union_ranges = { { 1, 13 }, { 17, 19 }, { 23, 40 } };

    std::vector<Range> union_ranges = ExecutionTraceUsageTracker::construct_union_of_ranges(active_ranges);

    EXPECT_EQ(union_ranges, expected_union_ranges);
}

// Test construction of ranges of indices for each thread that evenly distribute work according to the provided ranges
TEST_F(ExecutionTraceUsageTrackerTest, ConstructThreadRanges)
{
    using Range = ExecutionTraceUsageTracker::Range;

    std::vector<Range> union_ranges = { { 2, 8 }, { 13, 34 }, { 36, 45 }, { 50, 60 } };

    std::vector<std::vector<Range>> expected_thread_ranges = { { { 2, 4 }, { 13, 19 }, { 36, 39 }, { 50, 53 } },
                                                               { { 4, 6 }, { 19, 24 }, { 39, 41 }, { 53, 56 } },
                                                               { { 6, 7 }, { 24, 29 }, { 41, 43 }, { 56, 58 } },
                                                               { { 7, 8 }, { 29, 34 }, { 43, 45 }, { 58, 60 } } };

    const size_t num_threads = 4;
    std::vector<std::vector<Range>> thread_ranges =
        ExecutionTraceUsageTracker::construct_ranges_for_equal_content_distribution(union_ranges, num_threads);

    EXPECT_EQ(thread_ranges, expected_thread_ranges);
}

TEST_F(ExecutionTraceUsageTrackerTest, ConstructThreadRangesMoreThreadsThanWork)
{
    using Range = ExecutionTraceUsageTracker::Range;

    std::vector<Range> union_ranges = { { 2, 3 }, { 13, 14 } };

    std::vector<std::vector<Range>> expected_thread_ranges = { { { 2, 3 }, { 13, 14 } }, {}, {}, {} };

    const size_t num_threads = 4;
    std::vector<std::vector<Range>> thread_ranges =
        ExecutionTraceUsageTracker::construct_ranges_for_equal_content_distribution(union_ranges, num_threads);

    EXPECT_EQ(thread_ranges, expected_thread_ranges);
}

// Test that a large range is properly split across multiple threads
TEST_F(ExecutionTraceUsageTrackerTest, ConstructThreadRangesSplitsLargeRange)
{
    using Range = ExecutionTraceUsageTracker::Range;

    // Single range that is too large to fit in a single thread
    std::vector<Range> union_ranges = { { 0, 1 }, { 2, 101 } };

    std::vector<std::vector<Range>> expected_thread_ranges = { { { 0, 1 }, { 2, 35 } },
                                                               { { 35, 68 } },
                                                               { { 68, 101 } } };

    const size_t num_threads = 3;
    std::vector<std::vector<Range>> thread_ranges =
        ExecutionTraceUsageTracker::construct_ranges_for_equal_content_distribution(union_ranges, num_threads);

    EXPECT_EQ(thread_ranges, expected_thread_ranges);
}
