#pragma once
#include <cstddef>
#include <cstdint>
#include <stdexcept>
#include <sys/mman.h>
#include <unistd.h>
#include <fcntl.h>
#include <vector>

namespace bb {

// Memory-mapped polynomial with page dropping for memory efficiency
template <typename Fr>
class MmapPolynomial {
  public:
    // Constructor with configurable memory window (in bytes)
    MmapPolynomial(size_t size, size_t max_memory_bytes = 0) 
        : size_(size), page_size_(static_cast<size_t>(getpagesize())) {
        
        // Calculate window size in pages
        if (max_memory_bytes > 0) {
            window_pages_ = (max_memory_bytes + page_size_ - 1) / page_size_;
            if (window_pages_ == 0) {
                window_pages_ = 1;  // At least one page
            }
        } else {
            // Default: no limit (disable page dropping)
            window_pages_ = SIZE_MAX;
        }
        // Calculate total size in bytes
        size_t total_bytes = size * sizeof(Fr);
        
        // Create a temporary file
        char temp_name[] = "/tmp/mmap_poly_XXXXXX";
        fd_ = mkstemp(temp_name);
        if (fd_ < 0) {
            throw std::runtime_error("Failed to create temp file");
        }
        
        // Immediately unlink the file so it's deleted when we're done
        unlink(temp_name);
        
        // Resize the file to the required size
        if (ftruncate(fd_, static_cast<off_t>(total_bytes)) != 0) {
            close(fd_);
            throw std::runtime_error("Failed to resize file");
        }
        
        // Memory map the file
        void* addr = mmap(nullptr, total_bytes, PROT_READ | PROT_WRITE, 
                         MAP_SHARED, fd_, 0);
        
        if (addr == MAP_FAILED) {
            close(fd_);
            throw std::runtime_error("mmap failed");
        }
        
        data_ = static_cast<Fr*>(addr);
        total_pages_ = (total_bytes + page_size_ - 1) / page_size_;
        page_freed_ = std::vector<bool>(total_pages_, false);
        
        // Initialize to zero
        for (size_t i = 0; i < size; ++i) {
            data_[i] = Fr();
        }
    }
    
    ~MmapPolynomial() {
        if (data_) {
            munmap(data_, size_ * sizeof(Fr));
        }
        if (fd_ >= 0) {
            close(fd_);
        }
    }
    
    // Disable copy, enable move
    MmapPolynomial(const MmapPolynomial&) = delete;
    MmapPolynomial& operator=(const MmapPolynomial&) = delete;
    
    MmapPolynomial(MmapPolynomial&& other) noexcept 
        : data_(other.data_), size_(other.size_), fd_(other.fd_),
          page_size_(other.page_size_), current_page_(other.current_page_),
          total_pages_(other.total_pages_), page_freed_(std::move(other.page_freed_)) {
        other.data_ = nullptr;
        other.size_ = 0;
        other.fd_ = -1;
    }
    
    MmapPolynomial& operator=(MmapPolynomial&& other) noexcept {
        if (this != &other) {
            this->~MmapPolynomial();
            data_ = other.data_;
            size_ = other.size_;
            fd_ = other.fd_;
            page_size_ = other.page_size_;
            current_page_ = other.current_page_;
            total_pages_ = other.total_pages_;
            page_freed_ = std::move(other.page_freed_);
            other.data_ = nullptr;
            other.size_ = 0;
            other.fd_ = -1;
        }
        return *this;
    }
    
    Fr& operator[](size_t index) {
        if (index >= size_) {
            throw std::out_of_range("Index out of bounds");
        }
        
        size_t page = (index * sizeof(Fr)) / page_size_;
        
        // Check if we're accessing a freed page
        if (page_freed_[page]) {
            throw std::logic_error("Attempted to access freed page");
        }
        
        // Update current page and free old pages if moving forward
        if (page > current_page_ && window_pages_ != SIZE_MAX && page_dropping_enabled_) {
            current_page_ = page;
            
            // Free pages outside the window
            if (page >= window_pages_) {
                size_t first_page_to_keep = page - window_pages_ + 1;
                
                // Free all pages before the window
                for (size_t p = 0; p < first_page_to_keep; ++p) {
                    if (!page_freed_[p]) {
                        void* page_addr = static_cast<char*>(static_cast<void*>(data_)) + 
                                         (p * page_size_);
                        
                        // Sync and drop the page
                        madvise(page_addr, page_size_, MADV_DONTNEED);
                        
                        page_freed_[p] = true;
                    }
                }
            }
        }
        
        return data_[index];
    }
    
    const Fr& operator[](size_t index) const {
        if (index >= size_) {
            throw std::out_of_range("Index out of bounds");
        }
        return data_[index];
    }
    
    size_t size() const { return size_; }
    Fr* data() { return data_; }
    const Fr* data() const { return data_; }
    
    // Enable page dropping for memory efficiency
    void enable_page_dropping(bool enable = true) {
        page_dropping_enabled_ = enable;
    }
    
    // Reset page tracking (useful after initialization)
    void reset_page_tracking() {
        current_page_ = 0;
        std::fill(page_freed_.begin(), page_freed_.end(), false);
    }
    
  private:
    Fr* data_ = nullptr;
    size_t size_ = 0;
    int fd_ = -1;
    size_t page_size_;
    size_t current_page_ = 0;
    size_t total_pages_ = 0;
    size_t window_pages_ = SIZE_MAX;  // Number of pages to keep in memory
    std::vector<bool> page_freed_;
    bool page_dropping_enabled_ = true;
};

} // namespace bb
