#include "polynomial.hpp"
#include "file_backed_polynomial.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <iostream>
#include <sys/resource.h>
#include <chrono>

using namespace bb;
using Fr = bb::fr;

// Get peak RSS in MB
static size_t get_peak_rss_mb() {
    struct rusage usage;
    if (getrusage(RUSAGE_SELF, &usage) == 0) {
        #ifdef __linux__
        // On Linux, ru_maxrss is in kilobytes
        return usage.ru_maxrss / 1024;
        #else
        // On macOS, ru_maxrss is in bytes
        return usage.ru_maxrss / (1024 * 1024);
        #endif
    }
    return 0;
}

void test_regular_polynomial() {
    const size_t poly_size = 1 << 23;  // 8M elements * 32 bytes = 256MB
    
    std::cout << "=== Testing Regular Polynomial ===\n";
    size_t rss_start = get_peak_rss_mb();
    std::cout << "Initial RSS: " << rss_start << " MB\n";
    
    try {
        // Create 3 large polynomials
        std::cout << "Creating 3 polynomials of size " << poly_size << " (" << (poly_size * sizeof(Fr) / (1024*1024)) << " MB each)\n";
        
        {
            Polynomial<Fr> p1 = Polynomial<Fr>::random(poly_size);
            std::cout << "Created polynomial 1, RSS: " << get_peak_rss_mb() << " MB\n";
        }
        
        {
            Polynomial<Fr> p2 = Polynomial<Fr>::random(poly_size);
            std::cout << "Created polynomial 2, RSS: " << get_peak_rss_mb() << " MB\n";
        }
        
        {
            Polynomial<Fr> p3 = Polynomial<Fr>::random(poly_size);
            std::cout << "Created polynomial 3, RSS: " << get_peak_rss_mb() << " MB\n";
        }
        
        // Now do addition
        std::cout << "\nPerforming polynomial addition...\n";
        Polynomial<Fr> result(poly_size);
        
        {
            Polynomial<Fr> p1 = Polynomial<Fr>::random(poly_size);
            result += p1;
            std::cout << "Added polynomial 1, RSS: " << get_peak_rss_mb() << " MB\n";
        }
        
        {
            Polynomial<Fr> p2 = Polynomial<Fr>::random(poly_size);
            result += p2;
            std::cout << "Added polynomial 2, RSS: " << get_peak_rss_mb() << " MB\n";
        }
        
        {
            Polynomial<Fr> p3 = Polynomial<Fr>::random(poly_size);
            result += p3;
            std::cout << "Added polynomial 3, RSS: " << get_peak_rss_mb() << " MB\n";
        }
        
        // Check result
        std::cout << "Result is zero: " << result.is_zero() << "\n";
        
    } catch (const std::bad_alloc& e) {
        std::cerr << "FAILED: Out of memory (bad_alloc)\n";
    }
    
    size_t rss_end = get_peak_rss_mb();
    std::cout << "Final RSS: " << rss_end << " MB (increase: " << (rss_end - rss_start) << " MB)\n\n";
}

void test_file_backed_polynomial() {
    const size_t poly_size = 1 << 23;  // 8M elements * 32 bytes = 256MB
    
    std::cout << "=== Testing File-Backed Polynomial ===\n";
    size_t rss_start = get_peak_rss_mb();
    std::cout << "Initial RSS: " << rss_start << " MB\n";
    
    try {
        // Create 3 large polynomials
        std::cout << "Creating 3 polynomials of size " << poly_size << " (" << (poly_size * sizeof(Fr) / (1024*1024)) << " MB each)\n";
        
        {
            FileBackedPolynomial<Fr> p1 = FileBackedPolynomial<Fr>::random(poly_size);
            std::cout << "Created polynomial 1, RSS: " << get_peak_rss_mb() << " MB\n";
        }
        
        {
            FileBackedPolynomial<Fr> p2 = FileBackedPolynomial<Fr>::random(poly_size);
            std::cout << "Created polynomial 2, RSS: " << get_peak_rss_mb() << " MB\n";
        }
        
        {
            FileBackedPolynomial<Fr> p3 = FileBackedPolynomial<Fr>::random(poly_size);
            std::cout << "Created polynomial 3, RSS: " << get_peak_rss_mb() << " MB\n";
        }
        
        // Now do addition with conversion to buffer
        std::cout << "\nPerforming polynomial addition (to buffer)...\n";
        Polynomial<Fr> result(poly_size);
        
        {
            FileBackedPolynomial<Fr> p1 = FileBackedPolynomial<Fr>::random(poly_size);
            result += p1.to_buffer();
            std::cout << "Added polynomial 1, RSS: " << get_peak_rss_mb() << " MB\n";
        }
        
        {
            FileBackedPolynomial<Fr> p2 = FileBackedPolynomial<Fr>::random(poly_size);
            result += p2.to_buffer();
            std::cout << "Added polynomial 2, RSS: " << get_peak_rss_mb() << " MB\n";
        }
        
        {
            FileBackedPolynomial<Fr> p3 = FileBackedPolynomial<Fr>::random(poly_size);
            result += p3.to_buffer();
            std::cout << "Added polynomial 3, RSS: " << get_peak_rss_mb() << " MB\n";
        }
        
        // Check result
        std::cout << "Result is zero: " << result.is_zero() << "\n";
        
    } catch (const std::bad_alloc& e) {
        std::cerr << "FAILED: Out of memory (bad_alloc)\n";
    } catch (const std::exception& e) {
        std::cerr << "FAILED: " << e.what() << "\n";
    }
    
    size_t rss_end = get_peak_rss_mb();
    std::cout << "Final RSS: " << rss_end << " MB (increase: " << (rss_end - rss_start) << " MB)\n\n";
}

int main(int argc, char* argv[]) {
    if (argc != 2) {
        std::cerr << "Usage: " << argv[0] << " <regular|filebacked>\n";
        return 1;
    }
    
    std::string mode = argv[1];
    
    if (mode == "regular") {
        test_regular_polynomial();
    } else if (mode == "filebacked") {
        test_file_backed_polynomial();
    } else {
        std::cerr << "Unknown mode: " << mode << "\n";
        return 1;
    }
    
    return 0;
}