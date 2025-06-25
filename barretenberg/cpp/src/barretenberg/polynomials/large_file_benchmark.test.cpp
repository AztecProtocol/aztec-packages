#include <gtest/gtest.h>
#include <chrono>
#include <iostream>
#include <fstream>
#include <vector>
#include <sys/resource.h>
#include <sys/mman.h>
#include <fcntl.h>
#include <unistd.h>

namespace bb {

// Get peak RSS in MB
static size_t get_peak_rss_mb() {
    struct rusage usage;
    if (getrusage(RUSAGE_SELF, &usage) == 0) {
        return static_cast<size_t>(usage.ru_maxrss / (1024 * 1024));
    }
    return 0;
}

class LargeFileBenchmark : public ::testing::Test {};

// Test to create a 2GB file
TEST_F(LargeFileBenchmark, CreateLargeFile) {
    const size_t file_size = 2ULL * 1024 * 1024 * 1024; // 2GB
    const char* filename = "/tmp/large_test_file.dat";
    
    std::cout << "\n=== Creating 2GB test file ===\n";
    
    // Create file
    int fd = open(filename, O_CREAT | O_RDWR | O_TRUNC, 0644);
    if (fd < 0) {
        throw std::runtime_error("Failed to create file");
    }
    
    // Resize to 2GB
    if (ftruncate(fd, file_size) != 0) {
        close(fd);
        throw std::runtime_error("Failed to resize file");
    }
    
    // Write some pattern to ensure pages are allocated
    uint64_t* data = (uint64_t*)mmap(nullptr, file_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    if (data == MAP_FAILED) {
        close(fd);
        throw std::runtime_error("Failed to mmap file");
    }
    
    std::cout << "Writing pattern to file...\n";
    size_t num_elements = file_size / sizeof(uint64_t);
    for (size_t i = 0; i < num_elements; i += 4096 / sizeof(uint64_t)) {
        data[i] = i;
    }
    
    msync(data, file_size, MS_SYNC);
    munmap(data, file_size);
    close(fd);
    
    std::cout << "Created " << filename << " (2GB)\n";
}

// Naive approach: load entire file into memory
TEST_F(LargeFileBenchmark, NaiveLoadEntireFile) {
    const size_t file_size = 2ULL * 1024 * 1024 * 1024; // 2GB
    const char* filename = "/tmp/large_test_file.dat";
    
    std::cout << "\n=== NAIVE: Loading entire 2GB file into memory ===\n";
    
    size_t rss_start = get_peak_rss_mb();
    std::cout << "Initial peak RSS: " << rss_start << " MB\n";
    
    // Open and read entire file into memory
    std::ifstream file(filename, std::ios::binary);
    if (!file) {
        throw std::runtime_error("Failed to open file");
    }
    
    std::cout << "Allocating 2GB buffer...\n";
    std::vector<uint64_t> buffer(file_size / sizeof(uint64_t));
    
    std::cout << "Reading entire file...\n";
    file.read(reinterpret_cast<char*>(buffer.data()), file_size);
    file.close();
    
    size_t rss_after_load = get_peak_rss_mb();
    std::cout << "Peak RSS after loading: " << rss_after_load << " MB\n";
    std::cout << "RSS increase: " << (rss_after_load - rss_start) << " MB\n";
    
    // Process data
    std::cout << "\nProcessing data...\n";
    auto start = std::chrono::high_resolution_clock::now();
    
    uint64_t sum = 0;
    for (size_t i = 0; i < buffer.size(); ++i) {
        sum += buffer[i];
    }
    
    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
    
    size_t rss_final = get_peak_rss_mb();
    
    std::cout << "\nResults:\n";
    std::cout << "Processing time: " << duration << " ms\n";
    std::cout << "Final peak RSS: " << rss_final << " MB\n";
    std::cout << "Total RSS increase: " << (rss_final - rss_start) << " MB\n";
    std::cout << "Checksum: " << sum << "\n";
}

// Optimized approach: mmap with 16MB sliding window
TEST_F(LargeFileBenchmark, OptimizedMmapWithPageDropping) {
    const size_t file_size = 2ULL * 1024 * 1024 * 1024; // 2GB
    const char* filename = "/tmp/large_test_file.dat";
    const size_t window_size = 16 * 1024 * 1024; // 16MB window
    
    std::cout << "\n=== OPTIMIZED: MMap with 16MB sliding window ===\n";
    
    size_t rss_start = get_peak_rss_mb();
    std::cout << "Initial peak RSS: " << rss_start << " MB\n";
    
    // Open file
    int fd = open(filename, O_RDONLY);
    if (fd < 0) {
        throw std::runtime_error("Failed to open file");
    }
    
    // Memory map the file
    std::cout << "Memory mapping 2GB file...\n";
    uint64_t* data = (uint64_t*)mmap(nullptr, file_size, PROT_READ, MAP_PRIVATE, fd, 0);
    if (data == MAP_FAILED) {
        close(fd);
        throw std::runtime_error("Failed to mmap file");
    }
    
    size_t rss_after_mmap = get_peak_rss_mb();
    std::cout << "Peak RSS after mmap: " << rss_after_mmap << " MB (should be minimal)\n";
    
    // Process data with sliding window
    std::cout << "\nProcessing data with 16MB window...\n";
    auto start = std::chrono::high_resolution_clock::now();
    
    uint64_t sum = 0;
    size_t num_elements = file_size / sizeof(uint64_t);
    size_t page_size = getpagesize();
    size_t elements_per_page = page_size / sizeof(uint64_t);
    size_t window_pages = window_size / page_size;
    size_t last_dropped_page = 0;
    
    for (size_t i = 0; i < num_elements; ++i) {
        sum += data[i];
        
        // Check if we need to drop pages
        size_t current_page = i / elements_per_page;
        if (current_page > window_pages && current_page > last_dropped_page + window_pages) {
            // Drop pages that are outside our window
            size_t pages_to_drop = current_page - window_pages - last_dropped_page;
            void* drop_addr = (char*)data + (last_dropped_page * page_size);
            size_t drop_size = pages_to_drop * page_size;
            
            madvise(drop_addr, drop_size, MADV_DONTNEED);
            last_dropped_page += pages_to_drop;
            
            // Print progress every 512MB
            if ((i * sizeof(uint64_t)) % (512 * 1024 * 1024) == 0) {
                size_t rss_current = get_peak_rss_mb();
                std::cout << "Progress: " << (i * sizeof(uint64_t)) / (1024 * 1024) << " MB, "
                          << "Peak RSS: " << rss_current << " MB\n";
            }
        }
    }
    
    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
    
    size_t rss_final = get_peak_rss_mb();
    
    munmap(data, file_size);
    close(fd);
    
    std::cout << "\nResults:\n";
    std::cout << "Processing time: " << duration << " ms\n";
    std::cout << "Final peak RSS: " << rss_final << " MB\n";
    std::cout << "Total RSS increase: " << (rss_final - rss_start) << " MB\n";
    std::cout << "Checksum: " << sum << "\n";
    
    std::cout << "\nExpected behavior:\n";
    std::cout << "- Naive approach should show ~2048 MB RSS increase\n";
    std::cout << "- Optimized approach should show ~16-32 MB RSS increase\n";
}

} // namespace bb