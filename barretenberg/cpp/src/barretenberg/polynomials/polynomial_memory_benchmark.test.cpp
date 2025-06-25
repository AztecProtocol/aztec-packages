#include <gtest/gtest.h>
#include <chrono>
#include <iostream>
#include <iomanip>
#include <mach/mach.h>
#include <mach/task_info.h>
#include "heap_polynomial.hpp"
#include "mmap_polynomial.hpp"

namespace bb {

// Simple field element for testing
struct TestField {
    uint64_t value;
    TestField() : value(0) {}
    explicit TestField(uint64_t v) : value(v) {}
    TestField operator+(const TestField& other) const { return TestField(value + other.value); }
    TestField operator*(const TestField& other) const { return TestField(value * other.value); }
};

// Get current process memory footprint in KB
static void get_memory_info(size_t& footprint_kb, size_t& resident_kb) {
    task_vm_info_data_t info;
    mach_msg_type_number_t info_count = TASK_VM_INFO_COUNT;
    
    if (task_info(mach_task_self(), TASK_VM_INFO, (task_info_t)&info, &info_count) == KERN_SUCCESS) {
        footprint_kb = info.phys_footprint / 1024;
        resident_kb = info.resident_size / 1024;
    } else {
        footprint_kb = 0;
        resident_kb = 0;
    }
}

class PolynomialMemoryBenchmark : public ::testing::Test {
  protected:
    // Simple polynomial evaluation task
    template <typename PolyType>
    TestField evaluate_polynomial(PolyType& poly, TestField x) {
        TestField result(0);
        TestField x_power(1);
        
        for (size_t i = 0; i < poly.size(); ++i) {
            result = result + poly[i] * x_power;
            x_power = x_power * x;
        }
        
        return result;
    }
    
    // Sequential polynomial operation
    template <typename PolyType>
    void sequential_polynomial_operation(PolyType& poly) {
        // Simulate polynomial multiplication by x
        for (size_t i = poly.size() - 1; i > 0; --i) {
            poly[i] = poly[i-1];
        }
        poly[0] = TestField(0);
        
        // Add a constant
        for (size_t i = 0; i < poly.size(); ++i) {
            poly[i] = poly[i] + TestField(1);
        }
    }
};

TEST_F(PolynomialMemoryBenchmark, CompareMemoryUsage) {
    const size_t poly_size = 1 << 24;  // 16M elements = 128MB
    const size_t size_mb = (poly_size * sizeof(TestField)) / (1024 * 1024);
    
    std::cout << "\n=== Polynomial Memory Usage Comparison ===\n";
    std::cout << "Polynomial size: " << poly_size << " elements (" << size_mb << " MB)\n\n";
    
    // Test HeapPolynomial
    {
        std::cout << "--- HeapPolynomial ---\n";
        size_t footprint_start, resident_start;
        get_memory_info(footprint_start, resident_start);
        
        auto start = std::chrono::high_resolution_clock::now();
        
        HeapPolynomial<TestField> poly(poly_size);
        
        // Initialize
        for (size_t i = 0; i < poly_size; ++i) {
            poly[i] = TestField(i % 1000);
        }
        
        size_t footprint_after_init, resident_after_init;
        get_memory_info(footprint_after_init, resident_after_init);
        
        // Perform operation
        sequential_polynomial_operation(poly);
        
        auto end = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
        
        size_t footprint_end, resident_end;
        get_memory_info(footprint_end, resident_end);
        
        std::cout << "Time: " << duration << " ms\n";
        std::cout << "Memory footprint: " << (footprint_end - footprint_start) / 1024 << " MB\n";
        std::cout << "First element: " << poly[0].value << "\n";
        std::cout << "Last element: " << poly[poly_size-1].value << "\n\n";
    }
    
    // Test MmapPolynomial
    {
        std::cout << "--- MmapPolynomial ---\n";
        size_t footprint_start, resident_start;
        get_memory_info(footprint_start, resident_start);
        
        auto start = std::chrono::high_resolution_clock::now();
        
        MmapPolynomial<TestField> poly(poly_size);
        
        // Initialize
        for (size_t i = 0; i < poly_size; ++i) {
            poly[i] = TestField(i % 1000);
        }
        
        size_t footprint_after_init, resident_after_init;
        get_memory_info(footprint_after_init, resident_after_init);
        
        // Perform operation
        sequential_polynomial_operation(poly);
        
        auto end = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
        
        size_t footprint_end, resident_end;
        get_memory_info(footprint_end, resident_end);
        
        std::cout << "Time: " << duration << " ms\n";
        std::cout << "Memory footprint: " << (footprint_end - footprint_start) / 1024 << " MB\n";
        std::cout << "First element: " << poly[0].value << "\n";
        std::cout << "Last element: " << poly[poly_size-1].value << "\n";
    }
}

TEST_F(PolynomialMemoryBenchmark, SequentialAccessPattern) {
    const size_t poly_size = 1 << 22;  // 4M elements = 32MB
    const int num_passes = 5;
    
    std::cout << "\n=== Sequential Access Pattern Test ===\n";
    std::cout << "Polynomial size: " << poly_size << " elements\n";
    std::cout << "Number of passes: " << num_passes << "\n\n";
    
    // Test HeapPolynomial
    {
        std::cout << "--- HeapPolynomial ---\n";
        HeapPolynomial<TestField> poly(poly_size);
        
        // Initialize
        for (size_t i = 0; i < poly_size; ++i) {
            poly[i] = TestField(i);
        }
        
        auto start = std::chrono::high_resolution_clock::now();
        
        for (int pass = 0; pass < num_passes; ++pass) {
            // Forward pass
            for (size_t i = 1; i < poly_size; ++i) {
                poly[i] = poly[i] + poly[i-1];
            }
        }
        
        auto end = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
        
        std::cout << "Time: " << duration << " ms\n";
        std::cout << "Throughput: " << std::fixed << std::setprecision(2) 
                  << (static_cast<double>(poly_size * num_passes) / 1000000.0) / (static_cast<double>(duration) / 1000.0) << " M ops/sec\n\n";
    }
    
    // Test MmapPolynomial
    {
        std::cout << "--- MmapPolynomial ---\n";
        MmapPolynomial<TestField> poly(poly_size);
        
        // Initialize
        for (size_t i = 0; i < poly_size; ++i) {
            poly[i] = TestField(i);
        }
        
        auto start = std::chrono::high_resolution_clock::now();
        
        for (int pass = 0; pass < num_passes; ++pass) {
            // Forward pass
            for (size_t i = 1; i < poly_size; ++i) {
                poly[i] = poly[i] + poly[i-1];
            }
        }
        
        auto end = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
        
        std::cout << "Time: " << duration << " ms\n";
        std::cout << "Throughput: " << std::fixed << std::setprecision(2) 
                  << (static_cast<double>(poly_size * num_passes) / 1000000.0) / (static_cast<double>(duration) / 1000.0) << " M ops/sec\n";
    }
}

} // namespace bb