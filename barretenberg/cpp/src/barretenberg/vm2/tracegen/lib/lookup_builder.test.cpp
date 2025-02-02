#include "lookup_builder.hpp"
#include <gtest/gtest.h>
#include <chrono>
#include <unordered_set>
#include "barretenberg/vm2/common/field.hpp"

using namespace bb::avm2::tracegen;
using namespace std::chrono;
using FF = bb::avm2::Field; // Определяем тип FF

// Test lookup settings
struct TestLookupSettings {
    static constexpr size_t LOOKUP_TUPLE_SIZE = 2;
    static constexpr Column SRC_SELECTOR = Column::execution_sel;
    static constexpr Column DST_SELECTOR = Column::precomputed_sel_bitwise;
    static constexpr Column COUNTS = Column::lookup_dummy_precomputed_counts;
    static constexpr Column INVERSES = Column::lookup_dummy_precomputed_inv;
    static constexpr Column SEL_COUNT_NONZERO = Column::sel_count_nonzero;
    static constexpr std::array<Column, LOOKUP_TUPLE_SIZE> SRC_COLUMNS = {
        Column::execution_sel, Column::execution_clk
    };
    static constexpr std::array<Column, LOOKUP_TUPLE_SIZE> DST_COLUMNS = {
        Column::precomputed_bitwise_op_id, Column::precomputed_bitwise_input_a
    };
};

class MockTrace {
public:
    std::vector<FF> data;
    std::unordered_set<uint32_t> visited_rows;
    size_t size_;

    MockTrace(size_t size) : data(size), size_(size) {}

    FF get(Column col, uint32_t row) const { return data[row]; }
    void set(Column col, uint32_t row, FF value) { data[row] = value; }
    size_t size() const { return size_; }

    template<typename Fn>
    void visit_nonzero_rows(Fn&& fn) {
        visited_rows.clear(); // More efficient than vector
        for (uint32_t row = 0; row < size_; row++) {
            if (data[row] != 0) {
                visited_rows.insert(row);
                fn(row);
            }
        }
    }

    bool was_visited(uint32_t row) const {
        return visited_rows.contains(row);
    }
};

class LookupBuilderTest : public ::testing::Test {
protected:
    std::unique_ptr<MockTrace> trace;
    const size_t TEST_SIZE = 1000;

    void SetUp() override {
        trace = std::make_unique<MockTrace>(TEST_SIZE);
    }

    // Helper to set up test data
    void setupTestData(bool sparse = false) {
        for (uint32_t i = 0; i < TEST_SIZE; i++) {
            if (!sparse || i % 10 == 0) {
                trace->set(TestLookupSettings::SRC_SELECTOR, i, FF(1));
            }
        }
    }
};

TEST_F(LookupBuilderTest, TestSelCountNonzero) {
    // Set up test data
    trace->set(TestLookupSettings::COUNTS, 0, FF(0));
    trace->set(TestLookupSettings::COUNTS, 1, FF(1));
    trace->set(TestLookupSettings::COUNTS, 2, FF(2));

    // Check sel_count_nonzero is set correctly
    EXPECT_EQ(trace->get(TestLookupSettings::SEL_COUNT_NONZERO, 0), FF(0));
    EXPECT_EQ(trace->get(TestLookupSettings::SEL_COUNT_NONZERO, 1), FF(1));
    EXPECT_EQ(trace->get(TestLookupSettings::SEL_COUNT_NONZERO, 2), FF(1));
}

TEST_F(LookupBuilderTest, TestInverseComputation) {
    // Set up test data with some active selectors
    trace->set(TestLookupSettings::SRC_SELECTOR, 1, FF(1));
    trace->set(TestLookupSettings::SEL_COUNT_NONZERO, 2, FF(1));

    // Compute inverses
    compute_inverses<TestLookupSettings>(*trace);

    // Check that inverses were computed only for relevant rows
    EXPECT_NE(trace->get(TestLookupSettings::INVERSES, 1), FF(0xdeadbeef));
    EXPECT_NE(trace->get(TestLookupSettings::INVERSES, 2), FF(0xdeadbeef));
    EXPECT_EQ(trace->get(TestLookupSettings::INVERSES, 0), FF(0xdeadbeef));
}

TEST_F(LookupBuilderTest, TestEfficientTraversal) {
    // Set up sparse data
    setupTestData(true);

    // Reset visited flags
    trace->visited_rows.clear();

    // Compute inverses
    compute_inverses<TestLookupSettings>(*trace);

    // Check that we only visited necessary rows
    for (uint32_t i = 0; i < TEST_SIZE; i++) {
        if (i % 10 == 0) {
            EXPECT_TRUE(trace->was_visited(i)) << "Should have visited row " << i;
        } else {
            EXPECT_FALSE(trace->was_visited(i)) << "Should not have visited row " << i;
        }
    }
}

TEST_F(LookupBuilderTest, TestInverseCorrectnessWithOptimization) {
    // Set up test data
    setupTestData();

    // Create a copy of the trace for original computation
    auto trace_copy = std::make_unique<MockTrace>(TEST_SIZE);
    for (uint32_t i = 0; i < TEST_SIZE; i++) {
        trace_copy->set(TestLookupSettings::SRC_SELECTOR, i,
                       trace->get(TestLookupSettings::SRC_SELECTOR, i));
    }

    // Compute inverses both ways
    compute_inverses_original<TestLookupSettings>(*trace_copy);
    compute_inverses<TestLookupSettings>(*trace);

    // Compare results
    for (uint32_t i = 0; i < TEST_SIZE; i++) {
        EXPECT_EQ(trace->get(TestLookupSettings::INVERSES, i),
                 trace_copy->get(TestLookupSettings::INVERSES, i))
            << "Mismatch at row " << i;
    }
}

TEST_F(LookupBuilderTest, TestPerformance) {
    // Set up test data
    setupTestData(true); // Use sparse data for more realistic test

    // Create a copy of the trace for original computation
    auto trace_copy = std::make_unique<MockTrace>(TEST_SIZE);
    for (uint32_t i = 0; i < TEST_SIZE; i++) {
        trace_copy->set(TestLookupSettings::SRC_SELECTOR, i,
                       trace->get(TestLookupSettings::SRC_SELECTOR, i));
    }

    // Measure original performance
    auto start = high_resolution_clock::now();
    compute_inverses_original<TestLookupSettings>(*trace_copy);
    auto original_duration = duration_cast<microseconds>(high_resolution_clock::now() - start);

    // Measure optimized performance
    start = high_resolution_clock::now();
    compute_inverses<TestLookupSettings>(*trace);
    auto optimized_duration = duration_cast<microseconds>(high_resolution_clock::now() - start);

    // Expect optimized version to be faster
    EXPECT_LT(optimized_duration.count(), original_duration.count())
        << "Optimized: " << optimized_duration.count() << "us vs "
        << "Original: " << original_duration.count() << "us";
}
