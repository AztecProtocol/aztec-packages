#include <iostream>
#include <vector>
#include <sys/resource.h>
#include <sys/mman.h>
#include <fcntl.h>
#include <unistd.h>
#include <cstring>
#include <cstdint>
#include <filesystem>
#include <random>
#include <atomic>

// Simple Fr type for testing
struct Fr {
    uint64_t data[4]; // 256-bit field element
    
    Fr() { memset(data, 0, sizeof(data)); }
    
    static Fr zero() { return Fr(); }
    
    static Fr random_element() {
        static std::random_device rd;
        static std::mt19937_64 gen(rd());
        static std::uniform_int_distribution<uint64_t> dis;
        
        Fr result;
        for (int i = 0; i < 4; ++i) {
            result.data[i] = dis(gen);
        }
        return result;
    }
    
    Fr& operator+=(const Fr& other) {
        // Simplified addition (not proper field arithmetic)
        uint64_t carry = 0;
        for (int i = 0; i < 4; ++i) {
            uint64_t sum = data[i] + other.data[i] + carry;
            carry = (sum < data[i]) ? 1 : 0;
            data[i] = sum;
        }
        return *this;
    }
    
    Fr& operator*=(const Fr& other) {
        // Simplified multiplication (just for testing)
        uint64_t temp[4] = {0};
        for (int i = 0; i < 4; ++i) {
            temp[i] = data[i] * other.data[0];
        }
        memcpy(data, temp, sizeof(data));
        return *this;
    }
    
    bool operator!=(const Fr& other) const {
        return memcmp(data, other.data, sizeof(data)) != 0;
    }
};

// Get peak RSS in MB
static size_t get_peak_rss_mb() {
    struct rusage usage;
    if (getrusage(RUSAGE_SELF, &usage) == 0) {
        #ifdef __linux__
        return usage.ru_maxrss / 1024;
        #else
        return usage.ru_maxrss / (1024 * 1024);
        #endif
    }
    return 0;
}

// Simple heap-based polynomial
class HeapPolynomial {
  public:
    std::vector<Fr> coefficients;
    
    HeapPolynomial(size_t size) : coefficients(size) {}
    
    static HeapPolynomial random(size_t size) {
        HeapPolynomial p(size);
        for (size_t i = 0; i < size; ++i) {
            p.coefficients[i] = Fr::random_element();
        }
        return p;
    }
    
    HeapPolynomial& operator+=(const HeapPolynomial& other) {
        size_t min_size = std::min(coefficients.size(), other.coefficients.size());
        for (size_t i = 0; i < min_size; ++i) {
            coefficients[i] += other.coefficients[i];
        }
        return *this;
    }
    
    size_t size() const { return coefficients.size(); }
    Fr& operator[](size_t i) { return coefficients[i]; }
    const Fr& operator[](size_t i) const { return coefficients[i]; }
};

// File-backed polynomial
class FileBackedPolynomial {
  private:
    static std::atomic<size_t> file_counter_;
    size_t size_ = 0;
    Fr* data_ = nullptr;
    int fd_ = -1;
    std::string filename_;
    
  public:
    FileBackedPolynomial(size_t size) : size_(size) {
        if (size == 0) return;
        
        // Generate unique filename
        size_t id = file_counter_.fetch_add(1);
        filename_ = "./fbpoly_" + std::to_string(getpid()) + "_" + std::to_string(id) + ".dat";
        
        // Create file
        fd_ = open(filename_.c_str(), O_CREAT | O_RDWR | O_TRUNC, 0644);
        if (fd_ < 0) {
            throw std::runtime_error("Failed to create file");
        }
        
        // Set file size
        size_t file_size = size * sizeof(Fr);
        if (ftruncate(fd_, file_size) != 0) {
            close(fd_);
            throw std::runtime_error("Failed to set file size");
        }
        
        // Memory map the file
        void* addr = mmap(nullptr, file_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd_, 0);
        if (addr == MAP_FAILED) {
            close(fd_);
            throw std::runtime_error("Failed to mmap file");
        }
        
        data_ = static_cast<Fr*>(addr);
        
        // Initialize to zero
        memset(data_, 0, file_size);
    }
    
    ~FileBackedPolynomial() {
        if (data_ != nullptr && size_ > 0) {
            munmap(data_, size_ * sizeof(Fr));
        }
        if (fd_ >= 0) {
            close(fd_);
        }
        if (!filename_.empty()) {
            std::filesystem::remove(filename_);
        }
    }
    
    // Delete copy constructor/assignment
    FileBackedPolynomial(const FileBackedPolynomial&) = delete;
    FileBackedPolynomial& operator=(const FileBackedPolynomial&) = delete;
    
    // Move constructor
    FileBackedPolynomial(FileBackedPolynomial&& other) noexcept
        : size_(other.size_), data_(other.data_), fd_(other.fd_), filename_(std::move(other.filename_))
    {
        other.size_ = 0;
        other.data_ = nullptr;
        other.fd_ = -1;
    }
    
    static FileBackedPolynomial random(size_t size) {
        FileBackedPolynomial p(size);
        for (size_t i = 0; i < size; ++i) {
            p.data_[i] = Fr::random_element();
        }
        return p;
    }
    
    FileBackedPolynomial& operator+=(const FileBackedPolynomial& other) {
        size_t min_size = std::min(size_, other.size_);
        for (size_t i = 0; i < min_size; ++i) {
            data_[i] += other.data_[i];
        }
        return *this;
    }
    
    HeapPolynomial to_buffer() const {
        HeapPolynomial result(size_);
        if (size_ > 0) {
            memcpy(result.coefficients.data(), data_, size_ * sizeof(Fr));
        }
        return result;
    }
    
    size_t size() const { return size_; }
    Fr& operator[](size_t i) { return data_[i]; }
    const Fr& operator[](size_t i) const { return data_[i]; }
};

std::atomic<size_t> FileBackedPolynomial::file_counter_{0};

// Test functions
void test_heap_polynomial() {
    const size_t poly_size = 1 << 23;  // 8M elements * 32 bytes = 256MB
    
    std::cout << "=== Testing Heap-Based Polynomial ===\n";
    size_t rss_start = get_peak_rss_mb();
    std::cout << "Initial RSS: " << rss_start << " MB\n";
    
    try {
        // Create 3 large polynomials one by one
        std::cout << "Creating 3 polynomials of size " << poly_size << " (" << (poly_size * sizeof(Fr) / (1024*1024)) << " MB each)\n";
        
        HeapPolynomial result(poly_size);
        
        {
            std::cout << "Creating polynomial 1...\n";
            HeapPolynomial p1 = HeapPolynomial::random(poly_size);
            std::cout << "RSS after creation: " << get_peak_rss_mb() << " MB\n";
            result += p1;
            std::cout << "RSS after addition: " << get_peak_rss_mb() << " MB\n";
        }
        
        {
            std::cout << "Creating polynomial 2...\n";
            HeapPolynomial p2 = HeapPolynomial::random(poly_size);
            std::cout << "RSS after creation: " << get_peak_rss_mb() << " MB\n";
            result += p2;
            std::cout << "RSS after addition: " << get_peak_rss_mb() << " MB\n";
        }
        
        {
            std::cout << "Creating polynomial 3...\n";
            HeapPolynomial p3 = HeapPolynomial::random(poly_size);
            std::cout << "RSS after creation: " << get_peak_rss_mb() << " MB\n";
            result += p3;
            std::cout << "RSS after addition: " << get_peak_rss_mb() << " MB\n";
        }
        
        // Touch result to ensure it's materialized
        Fr sum;
        for (size_t i = 0; i < result.size(); i += 1000) {
            sum += result[i];
        }
        std::cout << "Computation complete\n";
        
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
        // Create 3 large polynomials one by one
        std::cout << "Creating 3 polynomials of size " << poly_size << " (" << (poly_size * sizeof(Fr) / (1024*1024)) << " MB each)\n";
        
        HeapPolynomial result(poly_size);
        
        {
            std::cout << "Creating polynomial 1 (file-backed)...\n";
            FileBackedPolynomial p1(poly_size);
            // Initialize sparsely to avoid loading all pages
            for (size_t i = 0; i < poly_size; i += 1000) {
                p1[i] = Fr::random_element();
            }
            std::cout << "RSS after creation: " << get_peak_rss_mb() << " MB\n";
            
            // Add to result in chunks to control memory usage
            std::cout << "Adding to result...\n";
            const size_t chunk_size = 1 << 20; // 1M elements at a time
            for (size_t offset = 0; offset < poly_size; offset += chunk_size) {
                size_t end = std::min(offset + chunk_size, poly_size);
                for (size_t i = offset; i < end; ++i) {
                    result[i] += p1[i];
                }
                // Drop pages from file-backed polynomial after use
                if (offset > 0) {
                    size_t drop_size = chunk_size * sizeof(Fr);
                    madvise(&p1[offset - chunk_size], drop_size, MADV_DONTNEED);
                }
            }
            std::cout << "RSS after addition: " << get_peak_rss_mb() << " MB\n";
        }
        
        {
            std::cout << "Creating polynomial 2 (file-backed)...\n";
            FileBackedPolynomial p2(poly_size);
            for (size_t i = 0; i < poly_size; i += 1000) {
                p2[i] = Fr::random_element();
            }
            std::cout << "RSS after creation: " << get_peak_rss_mb() << " MB\n";
            
            const size_t chunk_size = 1 << 20;
            for (size_t offset = 0; offset < poly_size; offset += chunk_size) {
                size_t end = std::min(offset + chunk_size, poly_size);
                for (size_t i = offset; i < end; ++i) {
                    result[i] += p2[i];
                }
                if (offset > 0) {
                    size_t drop_size = chunk_size * sizeof(Fr);
                    madvise(&p2[offset - chunk_size], drop_size, MADV_DONTNEED);
                }
            }
            std::cout << "RSS after addition: " << get_peak_rss_mb() << " MB\n";
        }
        
        {
            std::cout << "Creating polynomial 3 (file-backed)...\n";
            FileBackedPolynomial p3(poly_size);
            for (size_t i = 0; i < poly_size; i += 1000) {
                p3[i] = Fr::random_element();
            }
            std::cout << "RSS after creation: " << get_peak_rss_mb() << " MB\n";
            
            const size_t chunk_size = 1 << 20;
            for (size_t offset = 0; offset < poly_size; offset += chunk_size) {
                size_t end = std::min(offset + chunk_size, poly_size);
                for (size_t i = offset; i < end; ++i) {
                    result[i] += p3[i];
                }
                if (offset > 0) {
                    size_t drop_size = chunk_size * sizeof(Fr);
                    madvise(&p3[offset - chunk_size], drop_size, MADV_DONTNEED);
                }
            }
            std::cout << "RSS after addition: " << get_peak_rss_mb() << " MB\n";
        }
        
        // Touch result to ensure it's materialized
        Fr sum;
        for (size_t i = 0; i < result.size(); i += 1000) {
            sum += result[i];
        }
        std::cout << "Computation complete\n";
        
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
        std::cerr << "Usage: " << argv[0] << " <heap|filebacked>\n";
        return 1;
    }
    
    std::string mode = argv[1];
    
    if (mode == "heap") {
        test_heap_polynomial();
    } else if (mode == "filebacked") {
        test_file_backed_polynomial();
    } else {
        std::cerr << "Unknown mode: " << mode << "\n";
        return 1;
    }
    
    return 0;
}