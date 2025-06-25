#include <gtest/gtest.h>
#include "heap_polynomial.hpp"
#include "mmap_polynomial.hpp"

namespace bb {

// Simple test field element
struct TestFr {
    uint64_t value;
    TestFr() : value(0) {}
    explicit TestFr(uint64_t v) : value(v) {}
    bool operator==(const TestFr& other) const { return value == other.value; }
};

class MmapPolynomialTest : public ::testing::Test {};

TEST_F(MmapPolynomialTest, BasicOperations) {
    const size_t size = 1000;
    
    // Test both implementations
    HeapPolynomial<TestFr> heap_poly(size);
    MmapPolynomial<TestFr> mmap_poly(size);
    
    // Write test
    for (size_t i = 0; i < size; ++i) {
        heap_poly[i] = TestFr(i);
        mmap_poly[i] = TestFr(i);
    }
    
    // Read test
    for (size_t i = 0; i < size; ++i) {
        EXPECT_EQ(heap_poly[i].value, i);
        EXPECT_EQ(mmap_poly[i].value, i);
    }
    
    // Verify both give same results
    for (size_t i = 0; i < size; ++i) {
        EXPECT_EQ(heap_poly[i].value, mmap_poly[i].value);
    }
}

TEST_F(MmapPolynomialTest, PageFreedAccessThrows) {
    const size_t page_size = static_cast<size_t>(getpagesize());
    const size_t elements_per_page = page_size / sizeof(TestFr);
    const size_t size = elements_per_page * 10;
    
    // Create polynomial with 2-page window
    MmapPolynomial<TestFr> poly(size, page_size * 2);
    
    // Access page 0
    poly[0] = TestFr(100);
    
    // Jump to page 3 (should free page 0 since window is only 2 pages)
    poly[3 * elements_per_page] = TestFr(300);
    
    // Try to access page 0 again - should throw
    EXPECT_THROW(poly[0], std::logic_error);
}

TEST_F(MmapPolynomialTest, MemoryWindowSizes) {
    const size_t page_size = static_cast<size_t>(getpagesize());
    const size_t elements_per_page = page_size / sizeof(TestFr);
    const size_t size = elements_per_page * 20;
    
    // Test with different window sizes
    {
        // 1 page window
        MmapPolynomial<TestFr> poly(size, page_size);
        
        poly[0] = TestFr(1);
        poly[elements_per_page] = TestFr(2);  // Page 1
        
        // Page 0 should be freed
        EXPECT_THROW(poly[0], std::logic_error);
    }
    
    {
        // 5 page window
        MmapPolynomial<TestFr> poly(size, page_size * 5);
        
        // Access pages 0-4
        for (size_t i = 0; i < 5; ++i) {
            poly[i * elements_per_page] = TestFr(i);
        }
        
        // Access page 5 (should keep pages 1-5)
        poly[5 * elements_per_page] = TestFr(5);
        
        // Page 0 should be freed
        EXPECT_THROW(poly[0], std::logic_error);
        
        // Pages 1-5 should still be accessible
        for (size_t i = 1; i <= 5; ++i) {
            EXPECT_EQ(poly[i * elements_per_page].value, i);
        }
    }
}

TEST_F(MmapPolynomialTest, SequentialAccess) {
    const size_t size = 10000;
    
    HeapPolynomial<TestFr> heap_poly(size);
    MmapPolynomial<TestFr> mmap_poly(size);
    
    // Initialize
    for (size_t i = 0; i < size; ++i) {
        heap_poly[i] = TestFr(i);
        mmap_poly[i] = TestFr(i);
    }
    
    // Sequential operation
    for (size_t i = 1; i < size; ++i) {
        heap_poly[i] = TestFr(heap_poly[i].value + heap_poly[i-1].value);
        mmap_poly[i] = TestFr(mmap_poly[i].value + mmap_poly[i-1].value);
    }
    
    // Verify results match
    for (size_t i = 0; i < size; ++i) {
        EXPECT_EQ(heap_poly[i].value, mmap_poly[i].value);
    }
}

} // namespace bb
