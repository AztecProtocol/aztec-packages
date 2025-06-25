#include <gtest/gtest.h>
#include <chrono>
#include <iostream>
#include <iomanip>
#include <sys/resource.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/mman.h>
#include "heap_polynomial.hpp"
#include "mmap_polynomial.hpp"

namespace bb {

// Use uint128_t to simulate field arithmetic operations
using uint128_t = __uint128_t;

// Simple mmap wrapper for existing files
template <typename T>
class ExistingFileMmap {
  public:
    ExistingFileMmap(const char* filename, size_t size, size_t window_bytes = 0, bool use_madv_free = false) 
        : size_(size), window_bytes_(window_bytes), use_madv_free_(use_madv_free) {
        fd_ = open(filename, O_RDWR);
        if (fd_ < 0) {
            throw std::runtime_error("Failed to open file");
        }
        
        size_t file_size = size * sizeof(T);
        data_ = static_cast<T*>(mmap(nullptr, file_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd_, 0));
        if (data_ == MAP_FAILED) {
            close(fd_);
            throw std::runtime_error("Failed to mmap file");
        }
        
        if (window_bytes_ > 0) {
            page_size_ = static_cast<size_t>(getpagesize());
            window_pages_ = (window_bytes_ + page_size_ - 1) / page_size_;
            total_pages_ = (file_size + page_size_ - 1) / page_size_;
        }
    }
    
    ~ExistingFileMmap() {
        if (data_) {
            munmap(data_, size_ * sizeof(T));
        }
        if (fd_ >= 0) {
            close(fd_);
        }
    }
    
    T& operator[](size_t index) {
        if (window_bytes_ > 0) {
            size_t page = (index * sizeof(T)) / page_size_;
            
            if (page > current_page_) {
                current_page_ = page;
                
                // Drop pages outside window
                if (page >= window_pages_) {
                    size_t first_page_to_keep = page - window_pages_ + 1;
                    
                    for (size_t p = last_dropped_page_; p < first_page_to_keep; ++p) {
                        void* page_addr = static_cast<char*>(static_cast<void*>(data_)) + (p * page_size_);
                        madvise(page_addr, page_size_, use_madv_free_ ? MADV_FREE : MADV_DONTNEED);
                    }
                    last_dropped_page_ = first_page_to_keep;
                }
            }
        }
        return data_[index];
    }
    
    size_t size() const { return size_; }
    
  private:
    T* data_ = nullptr;
    int fd_ = -1;
    size_t size_;
    size_t window_bytes_;
    size_t page_size_ = 4096;
    size_t window_pages_ = 0;
    size_t total_pages_ = 0;
    size_t current_page_ = 0;
    size_t last_dropped_page_ = 0;
    bool use_madv_free_ = false;
};

// Simulate field element with similar computational cost
struct SimulatedField {
    uint128_t value;
    
    SimulatedField() : value(0) {}
    explicit SimulatedField(uint64_t v) : value(v) {}
    
    // Simulate field multiplication (similar cost to Montgomery multiplication)
    SimulatedField operator*(const SimulatedField& other) const {
        uint128_t a = value;
        uint128_t b = other.value;
        
        // Simulate Montgomery multiplication steps
        uint128_t result = a * b;
        uint128_t q = result * 0x9E3779B97F4A7C15ULL;  // Simulate reduction
        result = (result + q * 0xFFFFFFFFFFFFFFFFULL) >> 64;
        
        return SimulatedField(static_cast<uint64_t>(result));
    }
    
    SimulatedField operator+(const SimulatedField& other) const {
        // Simulate modular addition
        uint128_t result = value + other.value;
        if (result >= 0xFFFFFFFFFFFFFFFFULL) {
            result -= 0xFFFFFFFFFFFFFFFFULL;
        }
        return SimulatedField(static_cast<uint64_t>(result));
    }
};

// Get peak RSS using getrusage
static size_t get_peak_rss_mb() {
    struct rusage usage;
    if (getrusage(RUSAGE_SELF, &usage) == 0) {
        // On macOS, ru_maxrss is in bytes
        return static_cast<size_t>(usage.ru_maxrss / (1024 * 1024));
    }
    return 0;
}

// Simplified MSM for benchmarking with more operations
template <typename PolyType>
static SimulatedField fast_msm(PolyType& scalars, PolyType& bases, size_t size) {
    SimulatedField accumulator(0);
    
    // Process in chunks to simulate bucket method
    const size_t chunk_size = 256;
    for (size_t start = 0; start < size; start += chunk_size) {
        size_t end = std::min(start + chunk_size, size);
        
        SimulatedField chunk_result(0);
        for (size_t i = start; i < end; ++i) {
            // Simulate more intensive scalar multiplication
            SimulatedField temp = scalars[i];
            SimulatedField base = bases[i];
            
            // Simulate multiple operations like in real MSM
            for (int j = 0; j < 4; ++j) {
                temp = temp * base;
                base = base + SimulatedField(1);
            }
            
            chunk_result = chunk_result + temp;
        }
        
        accumulator = accumulator + chunk_result;
    }
    
    return accumulator;
}

// Heavy MSM workload for better benchmarking
template <typename PolyType>
static SimulatedField heavy_msm(PolyType& scalars, PolyType& bases, size_t size) {
    SimulatedField accumulator(0);
    
    // Multiple passes to create heavier workload
    const int num_passes = 3;
    
    for (int pass = 0; pass < num_passes; ++pass) {
        // Process in smaller chunks for more memory access
        const size_t chunk_size = 64;
        
        for (size_t start = 0; start < size; start += chunk_size) {
            size_t end = std::min(start + chunk_size, size);
            
            SimulatedField chunk_result(0);
            for (size_t i = start; i < end; ++i) {
                // More intensive computation
                SimulatedField temp = scalars[i];
                SimulatedField base = bases[i];
                
                // Simulate double-and-add like in real MSM
                for (int bit = 0; bit < 16; ++bit) {
                    temp = temp + temp;  // Double
                    if ((scalars[i].value >> bit) & 1) {
                        temp = temp + base;  // Add
                    }
                    base = base * SimulatedField(2);
                }
                
                chunk_result = chunk_result + temp;
            }
            
            accumulator = accumulator + chunk_result;
        }
    }
    
    return accumulator;
}

class MSMMemoryBenchmark : public ::testing::Test {
  protected:
    // Simulate multi-scalar multiplication
    // In real MSM: result = sum(scalar[i] * point[i]) for all i
    // We simulate: result = sum(scalar[i] * base[i]) with similar arithmetic
    template <typename PolyType>
    SimulatedField simulate_msm(PolyType& scalars, PolyType& bases, size_t size) {
        SimulatedField accumulator(0);
        
        // Simulate the double-and-add algorithm used in MSM
        for (size_t bit = 0; bit < 64; ++bit) {
            // Double
            accumulator = accumulator + accumulator;
            
            // Add points where bit is set
            for (size_t i = 0; i < size; ++i) {
                if ((scalars[i].value >> bit) & 1) {
                    accumulator = accumulator + bases[i];
                }
            }
        }
        
        return accumulator;
    }
};

// Test to create persistent files for mmap benchmarks
TEST_F(MSMMemoryBenchmark, CreatePersistentFiles) {
    const size_t msm_size = 1 << 20;  // 1M points
    const char* scalars_file = "/tmp/msm_scalars.dat";
    const char* bases_file = "/tmp/msm_bases.dat";
    
    std::cout << "\n=== Creating Persistent Files for MSM Benchmarks ===\n";
    std::cout << "Creating files with " << msm_size << " elements each\n";
    
    // Create scalars file
    {
        int fd = open(scalars_file, O_CREAT | O_RDWR | O_TRUNC, 0644);
        if (fd < 0) {
            throw std::runtime_error("Failed to create scalars file");
        }
        
        size_t file_size = msm_size * sizeof(SimulatedField);
        if (ftruncate(fd, static_cast<off_t>(file_size)) != 0) {
            close(fd);
            throw std::runtime_error("Failed to resize scalars file");
        }
        
        void* addr = mmap(nullptr, file_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
        if (addr == MAP_FAILED) {
            close(fd);
            throw std::runtime_error("Failed to mmap scalars file");
        }
        
        SimulatedField* data = static_cast<SimulatedField*>(addr);
        for (size_t i = 0; i < msm_size; ++i) {
            data[i] = SimulatedField(i * 0x9E3779B97F4A7C15ULL);
        }
        
        msync(addr, file_size, MS_SYNC);
        munmap(addr, file_size);
        close(fd);
        
        std::cout << "Created scalars file: " << scalars_file << " (" << file_size / (1024*1024) << " MB)\n";
    }
    
    // Create bases file
    {
        int fd = open(bases_file, O_CREAT | O_RDWR | O_TRUNC, 0644);
        if (fd < 0) {
            throw std::runtime_error("Failed to create bases file");
        }
        
        size_t file_size = msm_size * sizeof(SimulatedField);
        if (ftruncate(fd, static_cast<off_t>(file_size)) != 0) {
            close(fd);
            throw std::runtime_error("Failed to resize bases file");
        }
        
        void* addr = mmap(nullptr, file_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
        if (addr == MAP_FAILED) {
            close(fd);
            throw std::runtime_error("Failed to mmap bases file");
        }
        
        SimulatedField* data = static_cast<SimulatedField*>(addr);
        for (size_t i = 0; i < msm_size; ++i) {
            data[i] = SimulatedField(i * 0x6A09E667F3BCC908ULL);
        }
        
        msync(addr, file_size, MS_SYNC);
        munmap(addr, file_size);
        close(fd);
        
        std::cout << "Created bases file: " << bases_file << " (" << file_size / (1024*1024) << " MB)\n";
    }
    
    std::cout << "\nFiles created successfully. Run other MSM benchmarks to use these files.\n";
}

// Base function for MSM benchmarking
void RunMSMBenchmark(const char* name, size_t window_mb = 0, bool use_mmap = true, bool use_madv_free = false) {
    const size_t msm_size = 1 << 20;  // 1M points
    const size_t element_size = sizeof(SimulatedField);
    const size_t total_size_mb = (msm_size * element_size * 2) / (1024 * 1024);
    
    std::cout << "\n=== MSM Benchmark: " << name << " ===\n";
    std::cout << "MSM size: " << msm_size << " points\n";
    std::cout << "Element size: " << element_size << " bytes\n";
    std::cout << "Total data size: ~" << total_size_mb << " MB (scalars + bases)\n\n";
    
    size_t rss_start = get_peak_rss_mb();
    std::cout << "Initial peak RSS: " << rss_start << " MB\n";
    
    auto start = std::chrono::high_resolution_clock::now();
    SimulatedField result(0);
    
    if (!use_mmap) {
        // HeapPolynomial test
        HeapPolynomial<SimulatedField> scalars(msm_size);
        HeapPolynomial<SimulatedField> bases(msm_size);
        
        // Initialize with random-like data
        for (size_t i = 0; i < msm_size; ++i) {
            scalars[i] = SimulatedField(i * 0x9E3779B97F4A7C15ULL);
            bases[i] = SimulatedField(i * 0x6A09E667F3BCC908ULL);
        }
        
        result = heavy_msm(scalars, bases, msm_size);
    } else if (window_mb == 0) {
        // Use existing files with no page dropping
        ExistingFileMmap<SimulatedField> scalars("/tmp/msm_scalars.dat", msm_size, 0, use_madv_free);
        ExistingFileMmap<SimulatedField> bases("/tmp/msm_bases.dat", msm_size, 0, use_madv_free);
        
        result = heavy_msm(scalars, bases, msm_size);
    } else {
        // Use existing files with page dropping
        size_t window_bytes = window_mb * 1024 * 1024;
        ExistingFileMmap<SimulatedField> scalars("/tmp/msm_scalars.dat", msm_size, window_bytes / 2, use_madv_free);
        ExistingFileMmap<SimulatedField> bases("/tmp/msm_bases.dat", msm_size, window_bytes / 2, use_madv_free);
        
        result = heavy_msm(scalars, bases, msm_size);
    }
    
    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
    
    size_t rss_end = get_peak_rss_mb();
    
    std::cout << "\nResults:\n";
    std::cout << "Time: " << duration << " ms\n";
    std::cout << "Peak RSS: " << rss_end << " MB\n";
    std::cout << "RSS increase: " << (rss_end - rss_start) << " MB\n";
    std::cout << "Memory efficiency: " << std::fixed << std::setprecision(1) 
              << (static_cast<double>(rss_end - rss_start) / static_cast<double>(total_size_mb)) * 100 << "% of data size\n";
    std::cout << "Result: " << static_cast<uint64_t>(result.value) << "\n";
    
    if (use_mmap) {
        double ops_per_sec = (static_cast<double>(msm_size) / 1000000.0) / (static_cast<double>(duration) / 1000.0);
        std::cout << "Throughput: " << std::fixed << std::setprecision(2) << ops_per_sec << " M ops/sec\n";
    }
}

TEST_F(MSMMemoryBenchmark, HeapPolynomial) {
    RunMSMBenchmark("HeapPolynomial", 0, false);
}

TEST_F(MSMMemoryBenchmark, MmapNoPageDropping) {
    RunMSMBenchmark("MmapPolynomial (no page dropping)", 0, true);
}

TEST_F(MSMMemoryBenchmark, Mmap4MB) {
    RunMSMBenchmark("MmapPolynomial (4 MB window)", 4, true);
}

TEST_F(MSMMemoryBenchmark, Mmap8MB) {
    RunMSMBenchmark("MmapPolynomial (8 MB window)", 8, true);
}

TEST_F(MSMMemoryBenchmark, Mmap16MB) {
    RunMSMBenchmark("MmapPolynomial (16 MB window)", 16, true);
}

TEST_F(MSMMemoryBenchmark, Mmap32MB) {
    RunMSMBenchmark("MmapPolynomial (32 MB window)", 32, true);
}

// Tests with MADV_FREE
TEST_F(MSMMemoryBenchmark, Mmap4MB_MadvFree) {
    RunMSMBenchmark("MmapPolynomial (4 MB window, MADV_FREE)", 4, true, true);
}

TEST_F(MSMMemoryBenchmark, Mmap8MB_MadvFree) {
    RunMSMBenchmark("MmapPolynomial (8 MB window, MADV_FREE)", 8, true, true);
}

TEST_F(MSMMemoryBenchmark, Mmap16MB_MadvFree) {
    RunMSMBenchmark("MmapPolynomial (16 MB window, MADV_FREE)", 16, true, true);
}

// Comprehensive comparison test
TEST_F(MSMMemoryBenchmark, CompareAllVariants) {
    std::cout << "\n=== COMPREHENSIVE MSM BENCHMARK COMPARISON ===\n";
    std::cout << "Running heavy MSM workload (3 passes, 16-bit operations per element)\n";
    std::cout << "Data size: 1M points (32 MB total)\n\n";
    
    // Run all variants and collect results
    std::cout << "1. Baseline - Heap allocation:\n";
    RunMSMBenchmark("HeapPolynomial", 0, false);
    
    std::cout << "\n2. Mmap without page dropping:\n";
    RunMSMBenchmark("MmapPolynomial (no page dropping)", 0, true);
    
    std::cout << "\n3. Mmap with 4MB window (MADV_DONTNEED):\n";
    RunMSMBenchmark("MmapPolynomial (4MB, DONTNEED)", 4, true, false);
    
    std::cout << "\n4. Mmap with 4MB window (MADV_FREE):\n";
    RunMSMBenchmark("MmapPolynomial (4MB, FREE)", 4, true, true);
    
    std::cout << "\n5. Mmap with 8MB window (MADV_DONTNEED):\n";
    RunMSMBenchmark("MmapPolynomial (8MB, DONTNEED)", 8, true, false);
    
    std::cout << "\n6. Mmap with 8MB window (MADV_FREE):\n";
    RunMSMBenchmark("MmapPolynomial (8MB, FREE)", 8, true, true);
    
    std::cout << "\n=== SUMMARY ===\n";
    std::cout << "MADV_DONTNEED: Immediately frees physical pages\n";
    std::cout << "MADV_FREE: Marks pages as freeable (freed under memory pressure)\n";
    std::cout << "Peak RSS shows maximum memory used (doesn't decrease with page drops)\n";
}


TEST_F(MSMMemoryBenchmark, DemonstratePageDropping) {
    const size_t msm_size = 1 << 21;  // 2M points
    const size_t chunk_size = msm_size / 8;  // Process in 8 chunks
    
    std::cout << "\n=== Demonstrating Page Dropping with MADV_DONTNEED ===\n";
    std::cout << "Processing " << msm_size << " elements in " << 8 << " chunks\n";
    std::cout << "Using 4MB memory window (should keep ~2 chunks in memory)\n\n";
    
    // Use existing files with small window
    size_t window_bytes = 4 * 1024 * 1024;  // 4MB total
    ExistingFileMmap<SimulatedField> scalars("/tmp/msm_scalars.dat", msm_size, window_bytes / 2);
    ExistingFileMmap<SimulatedField> bases("/tmp/msm_bases.dat", msm_size, window_bytes / 2);
    
    std::cout << "Processing chunks sequentially:\n";
    
    for (size_t chunk = 0; chunk < 8; ++chunk) {
        size_t start = chunk * chunk_size;
        size_t end = std::min(start + chunk_size, msm_size);
        
        // Process chunk
        SimulatedField chunk_result(0);
        for (size_t i = start; i < end; ++i) {
            SimulatedField temp = scalars[i] * bases[i];
            chunk_result = chunk_result + temp;
        }
        
        // Get current RSS (not peak)
        struct rusage usage;
        getrusage(RUSAGE_SELF, &usage);
        size_t current_rss_mb = static_cast<size_t>(usage.ru_maxrss / (1024 * 1024));
        
        std::cout << "Chunk " << chunk << ": ";
        std::cout << "Processed elements " << start << "-" << end << ", ";
        std::cout << "Peak RSS so far: " << current_rss_mb << " MB\n";
    }
    
    std::cout << "\nNote: Peak RSS accumulates and doesn't decrease even when pages are freed.\n";
    std::cout << "MADV_DONTNEED frees pages, but peak RSS still shows the maximum ever used.\n";
}

TEST_F(MSMMemoryBenchmark, DetailedPerformanceAnalysis) {
    const size_t msm_size = 1 << 17;  // 128K points
    const size_t window_mb = 16;  // 16 MB window
    
    std::cout << "\n=== Detailed MSM Performance Analysis ===\n";
    std::cout << "MSM size: " << msm_size << " points\n";
    std::cout << "Memory window: " << window_mb << " MB\n\n";
    
    size_t window_bytes = window_mb * 1024 * 1024;
    
    MmapPolynomial<SimulatedField> scalars(msm_size, window_bytes / 2);
    MmapPolynomial<SimulatedField> bases(msm_size, window_bytes / 2);
    
    // Disable page dropping during initialization
    scalars.enable_page_dropping(false);
    bases.enable_page_dropping(false);
    
    // Initialize
    std::cout << "Initializing data...\n";
    for (size_t i = 0; i < msm_size; ++i) {
        scalars[i] = SimulatedField(i * 0x9E3779B97F4A7C15ULL);
        bases[i] = SimulatedField(i * 0x6A09E667F3BCC908ULL);
    }
    
    // Reset and enable page dropping
    scalars.reset_page_tracking();
    bases.reset_page_tracking();
    scalars.enable_page_dropping(true);
    bases.enable_page_dropping(true);
    
    // Warm-up run
    std::cout << "Warm-up run...\n";
    fast_msm(scalars, bases, msm_size);
    
    // Timed runs
    const int num_runs = 5;
    std::cout << "\nPerforming " << num_runs << " timed runs:\n";
    
    double total_time = 0;
    for (int run = 0; run < num_runs; ++run) {
        auto start = std::chrono::high_resolution_clock::now();
        [[maybe_unused]] SimulatedField result = fast_msm(scalars, bases, msm_size);
        auto end = std::chrono::high_resolution_clock::now();
        
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
        std::cout << "Run " << (run + 1) << ": " << duration << " ms\n";
        total_time += static_cast<double>(duration);
    }
    
    double avg_time = total_time / num_runs;
    double ops_per_sec = (static_cast<double>(msm_size) / 1000000.0) / (avg_time / 1000.0);
    
    std::cout << "\nAverage time: " << std::fixed << std::setprecision(1) << avg_time << " ms\n";
    std::cout << "Average throughput: " << std::fixed << std::setprecision(2) << ops_per_sec << " M ops/sec\n";
}

} // namespace bb