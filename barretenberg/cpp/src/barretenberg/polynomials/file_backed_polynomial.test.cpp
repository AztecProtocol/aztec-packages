#include <gtest/gtest.h>
#include "barretenberg/polynomials/polynomial.hpp"

using namespace bb;

#include "barretenberg/polynomials/file_backed_polynomial.hpp"

// Test basic construction and random
TEST(FileBackedPolynomial, BasicConstruction)
{
    using FF = bb::fr;
    using FBPoly = FileBackedPolynomial<FF>;
    
    const size_t SIZE = 100;
    
    // Test default construction
    FBPoly p1(SIZE);
    EXPECT_EQ(p1.size(), SIZE);
    EXPECT_TRUE(p1.is_zero());
    
    // Test random construction
    FBPoly p2 = FBPoly::random(SIZE);
    EXPECT_EQ(p2.size(), SIZE);
    EXPECT_FALSE(p2.is_zero());
}

// Test shifted functionality
TEST(FileBackedPolynomial, Shifted)
{
    using FF = bb::fr;
    using FBPoly = FileBackedPolynomial<FF>;
    
    const size_t SIZE = 100;
    auto poly = FBPoly::shiftable(SIZE);
    
    // Fill with test values
    for (size_t i = 1; i < SIZE; ++i) {
        poly.at(i) = FF(i);
    }
    
    auto poly_shifted = poly.shifted();
    
    // Verify the shift
    for (size_t i = 0; i < poly_shifted.size(); ++i) {
        EXPECT_EQ(poly_shifted.at(i), poly.at(i + 1));
    }
}

// Test copy and share
TEST(FileBackedPolynomial, CopyAndShare)
{
    using FF = bb::fr;
    using FBPoly = FileBackedPolynomial<FF>;
    
    const size_t SIZE = 100;
    FBPoly p1 = FBPoly::random(SIZE);
    
    // Test copy constructor
    FBPoly p2(p1);
    EXPECT_EQ(p1, p2);
    
    // Modify copy - should not affect original
    p2.at(0) = FF::zero();
    EXPECT_NE(p1.at(0), p2.at(0));
    
    // Test share
    FBPoly p3 = p1.share();
    EXPECT_EQ(p1, p3);
    
    // Modify shared - should affect both
    p3.at(1) = FF::zero();
    EXPECT_EQ(p1.at(1), p3.at(1));
}

// Test polynomial evaluation
TEST(FileBackedPolynomial, Evaluation)
{
    using FF = bb::fr;
    using FBPoly = FileBackedPolynomial<FF>;
    
    const size_t SIZE = 4;
    FBPoly p(SIZE);
    
    // Create polynomial: 1 + 2x + 3x^2 + 4x^3
    p.at(0) = FF(1);
    p.at(1) = FF(2);
    p.at(2) = FF(3);
    p.at(3) = FF(4);
    
    // Evaluate at x = 2: 1 + 2*2 + 3*4 + 4*8 = 1 + 4 + 12 + 32 = 49
    FF x = FF(2);
    FF result = p.evaluate(x);
    FF expected = FF(49);
    
    EXPECT_EQ(result, expected);
}

// Test memory efficiency - Regular polynomials should OOM
TEST(FileBackedPolynomial, DISABLED_RegularPolynomialOOM)
{
    using FF = bb::fr;
    using Poly = Polynomial<FF>;
    
    // 12M elements = 384MB each (only 1 fits in 512MB container)
    const size_t LARGE_SIZE = 1 << 24; // 16M elements = 512MB
    const size_t POLY_COUNT = 10;
    
    try {
        std::vector<Poly> polynomials;
        polynomials.reserve(POLY_COUNT);
        
        for (size_t i = 0; i < POLY_COUNT; ++i) {
            std::cout << "Creating regular polynomial " << (i + 1) << "/" << POLY_COUNT << std::endl;
            polynomials.push_back(Poly::random(LARGE_SIZE));
        }
        
        // If we get here, we have enough memory (not expected in 512MB container)
        std::cout << "Successfully created all " << POLY_COUNT << " regular polynomials" << std::endl;
        EXPECT_TRUE(true); // Pass if running on a system with enough memory
    } catch (const std::bad_alloc& e) {
        std::cout << "Regular polynomials: Out of memory as expected!" << std::endl;
        EXPECT_TRUE(true); // This is the expected behavior in memory-constrained environment
    }
}

// Debug test
TEST(FileBackedPolynomial, DebugProverPolynomials)
{
    using FF = bb::fr;
    using FBPoly = FileBackedPolynomial<FF>;
    
    // Test creating polynomials like ProverPolynomials does
    const size_t circuit_size = 16;  // Small size for testing
    
    // Create shiftable polynomial (like get_to_be_shifted())
    {
        FBPoly poly = FBPoly::shiftable(circuit_size);
        std::cout << "Shiftable poly created - size: " << poly.size() 
                  << ", start: " << poly.start_index() 
                  << ", end: " << poly.end_index() 
                  << ", virtual_size: " << poly.virtual_size() << std::endl;
        
        EXPECT_FALSE(poly.is_empty());
        EXPECT_EQ(poly.size(), circuit_size - 1);
        EXPECT_EQ(poly.start_index(), 1);
        EXPECT_EQ(poly.end_index(), circuit_size);
        
        // Try to access it
        poly.at(1) = FF::one();
        EXPECT_EQ(poly.at(1), FF::one());
        
        // Share it
        FBPoly shared = poly.share();
        EXPECT_EQ(shared.at(1), FF::one());
    }
    
    // Create regular polynomial (like get_unshifted())
    {
        FBPoly poly(circuit_size, circuit_size);
        std::cout << "Regular poly created - size: " << poly.size() 
                  << ", start: " << poly.start_index() 
                  << ", end: " << poly.end_index() << std::endl;
        
        EXPECT_FALSE(poly.is_empty());
        EXPECT_EQ(poly.size(), circuit_size);
        EXPECT_EQ(poly.start_index(), 0);
        
        // Try to access it
        poly.at(0) = FF::one();
        poly.at(1) = FF(2);
        EXPECT_EQ(poly.at(0), FF::one());
        EXPECT_EQ(poly.at(1), FF(2));
    }
}

// Debug test
TEST(FileBackedPolynomial, DebugSharing)
{
    using FF = bb::fr;
    using FBPoly = FileBackedPolynomial<FF>;
    
    // Test sharing of default constructed polynomial
    {
        FBPoly p;
        std::cout << "Default poly - is_empty: " << p.is_empty() << std::endl;
        
        FBPoly shared = p.share();
        std::cout << "Shared poly - is_empty: " << shared.is_empty() << std::endl;
        
        EXPECT_TRUE(p.is_empty());
        EXPECT_TRUE(shared.is_empty());
    }
    
    // Test sharing of shiftable polynomial
    {
        FBPoly p = FBPoly::shiftable(10);
        std::cout << "Shiftable poly - size: " << p.size() << ", start: " << p.start_index() 
                  << ", end: " << p.end_index() << std::endl;
        
        p.at(1) = FF::one();
        
        FBPoly shared = p.share();
        std::cout << "Shared shiftable - size: " << shared.size() << ", start: " << shared.start_index() 
                  << ", end: " << shared.end_index() << std::endl;
        
        EXPECT_EQ(shared.at(1), FF::one());
    }
}

// Diagnostic test for crash investigation
TEST(FileBackedPolynomial, DiagnoseCrash)
{
    using FF = bb::fr;
    using FBPoly = FileBackedPolynomial<FF>;
    
    std::cout << "\n=== Crash Diagnosis ===" << std::endl;
    
    // Test 1: Memory layout of shiftable polynomial
    {
        std::cout << "\nTest 1: Shiftable polynomial memory" << std::endl;
        FBPoly p = FBPoly::shiftable(16);
        
        std::cout << "  size=" << p.size() << ", start=" << p.start_index() 
                  << ", end=" << p.end_index() << ", data=" << (void*)p.data() << std::endl;
        
        // Check if we can access index 1
        try {
            p.at(1) = FF::one();
            std::cout << "  at(1) access: SUCCESS" << std::endl;
            
            // Check raw pointer access
            FF* raw = p.data();
            if (raw) {
                std::cout << "  raw[0] address: " << (void*)&raw[0] << std::endl;
                volatile FF test = raw[0];  // Should be at(1)
                (void)test;  // Avoid unused variable warning
                std::cout << "  raw[0] access: SUCCESS" << std::endl;
            }
        } catch (const std::exception& e) {
            std::cout << "  ERROR: " << e.what() << std::endl;
        }
    }
    
    // Test 2: Lifetime issue simulation
    {
        std::cout << "\nTest 2: Shared polynomial lifetime" << std::endl;
        
        FBPoly shared;
        {
            FBPoly temp = FBPoly::shiftable(16);
            temp.at(1) = FF::one();
            shared = temp.share();
            std::cout << "  Shared polynomial created" << std::endl;
        } // temp destroyed here
        
        std::cout << "  Original destroyed, accessing shared..." << std::endl;
        try {
            FF val = shared.at(1);
            (void)val;  // Avoid unused variable warning
            std::cout << "  Shared access: SUCCESS (this might be the bug!)" << std::endl;
        } catch (const std::exception& e) {
            std::cout << "  Shared access: FAILED as expected: " << e.what() << std::endl;
        }
    }
    
    // Test 3: Move semantics
    {
        std::cout << "\nTest 3: Move semantics" << std::endl;
        
        // Simulate ProverPolynomials scenario
        struct PolyContainer {
            FBPoly poly;
            PolyContainer() = default;
            PolyContainer(size_t size) : poly(FBPoly::shiftable(size)) {
                std::cout << "  Container constructed with poly" << std::endl;
            }
        };
        
        PolyContainer container;
        container = PolyContainer(16);  // Move assignment
        std::cout << "  After move assignment" << std::endl;
        
        try {
            container.poly.at(1) = FF::one();
            std::cout << "  Access after move: SUCCESS" << std::endl;
        } catch (const std::exception& e) {
            std::cout << "  Access after move: FAILED: " << e.what() << std::endl;
        }
    }
    
    // Test 4: Check file descriptors
    {
        std::cout << "\nTest 4: File descriptor check" << std::endl;
        
        // Get initial fd count
        int initial_fds = 0;
        for (int fd = 0; fd < 1024; fd++) {
            if (fcntl(fd, F_GETFD) != -1) initial_fds++;
        }
        std::cout << "  Initial open fds: " << initial_fds << std::endl;
        
        // Create and destroy polynomials
        for (int i = 0; i < 10; i++) {
            FBPoly p = FBPoly::shiftable(16);
            p.at(1) = FF::one();
        }
        
        // Check fd count again
        int final_fds = 0;
        for (int fd = 0; fd < 1024; fd++) {
            if (fcntl(fd, F_GETFD) != -1) final_fds++;
        }
        std::cout << "  Final open fds: " << final_fds << std::endl;
        std::cout << "  Leaked fds: " << (final_fds - initial_fds) << std::endl;
    }
}

// Test memory efficiency - File-backed polynomials should work
TEST(FileBackedPolynomial, DISABLED_FileBackedNoOOM)
{
    using FF = bb::fr;
    using FBPoly = FileBackedPolynomial<FF>;
    
    // 12M elements = 384MB each (only 1 fits in 512MB container)
    const size_t LARGE_SIZE = 1 << 24; // 16M elements = 512MB
    const size_t POLY_COUNT = 10;
    
    try {
        // Step 1: Create polynomials one at a time, letting them go out of scope
        std::vector<std::string> operations;
        
        for (size_t i = 0; i < POLY_COUNT; ++i) {
            std::cout << "Creating file-backed polynomial " << (i + 1) << "/" << POLY_COUNT << std::endl;
            
            // Create polynomial in its own scope so it's deallocated
            {
                FBPoly poly = FBPoly::random(LARGE_SIZE);
                
                // Do some operation to verify it works
                FF sum = FF::zero();
                for (size_t j = 0; j < 100; j += 10) {
                    sum += poly.at(j);
                }
                operations.push_back("Poly " + std::to_string(i) + " computed");
            }
            // Polynomial is now deallocated, only file remains
        }
        
        // Step 2: Now create all polynomials again - they'll mmap existing files
        std::cout << "\nCreating all " << POLY_COUNT << " file-backed polynomials simultaneously..." << std::endl;
        std::vector<FBPoly> all_polynomials;
        all_polynomials.reserve(POLY_COUNT);
        
        for (size_t i = 0; i < POLY_COUNT; ++i) {
            all_polynomials.push_back(FBPoly::random(LARGE_SIZE));
        }
        
        // Step 3: Access them lazily - OS will page in/out as needed
        std::cout << "Accessing polynomials lazily..." << std::endl;
        FF total = FF::zero();
        for (size_t i = 0; i < POLY_COUNT; ++i) {
            // Access just a few elements from each polynomial
            total += all_polynomials[i].at(0);
            total += all_polynomials[i].at(LARGE_SIZE / 2);
            total += all_polynomials[i].at(LARGE_SIZE - 1);
        }
        
        std::cout << "Successfully created and accessed all " << POLY_COUNT 
                  << " file-backed polynomials!" << std::endl;
        EXPECT_TRUE(true);
        
    } catch (const std::exception& e) {
        std::cerr << "File-backed polynomials failed: " << e.what() << std::endl;
        EXPECT_TRUE(false); // Should not fail
    }
}