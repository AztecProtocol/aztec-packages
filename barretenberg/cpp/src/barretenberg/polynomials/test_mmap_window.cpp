#include <iostream>
#include <sys/mman.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/resource.h>
#include <vector>
#include <cstring>
#include <cstdint>

size_t get_peak_rss_mb() {
    struct rusage usage;
    getrusage(RUSAGE_SELF, &usage);
    #ifdef __linux__
    // On Linux, ru_maxrss is in kilobytes
    return usage.ru_maxrss / 1024;
    #else
    // On macOS, ru_maxrss is in bytes
    return usage.ru_maxrss / (1024 * 1024);
    #endif
}

void test_naive_2gb() {
    const size_t file_size = 2ULL * 1024 * 1024 * 1024; // 2GB
    const char* filename = "/tmp/test_2gb.dat";
    
    std::cout << "=== NAIVE: Load entire 2GB file ===\n";
    size_t rss_start = get_peak_rss_mb();
    
    int fd = open(filename, O_RDONLY);
    if (fd < 0) {
        std::cerr << "Failed to open file\n";
        return;
    }
    
    // Allocate full 2GB buffer
    std::vector<char> buffer(file_size);
    
    // Read entire file
    size_t total_read = 0;
    while (total_read < file_size) {
        ssize_t bytes = read(fd, buffer.data() + total_read, file_size - total_read);
        if (bytes <= 0) break;
        total_read += bytes;
    }
    close(fd);
    
    // Process data
    uint64_t sum = 0;
    for (size_t i = 0; i < file_size; i += 4096) {
        sum += buffer[i];
    }
    
    size_t rss_end = get_peak_rss_mb();
    std::cout << "Peak RSS: " << rss_end << " MB\n";
    std::cout << "RSS increase: " << (rss_end - rss_start) << " MB\n";
    std::cout << "Sum: " << sum << "\n\n";
}

void test_mmap_window() {
    const size_t file_size = 2ULL * 1024 * 1024 * 1024; // 2GB
    const char* filename = "/tmp/test_2gb.dat";
    const size_t window_size = 16 * 1024 * 1024; // 16MB
    const size_t page_size = getpagesize();
    
    std::cout << "=== MMAP: Process 2GB with 16MB window ===\n";
    size_t rss_start = get_peak_rss_mb();
    
    int fd = open(filename, O_RDONLY);
    if (fd < 0) {
        std::cerr << "Failed to open file\n";
        return;
    }
    
    // Memory map the file
    void* addr = mmap(nullptr, file_size, PROT_READ, MAP_PRIVATE, fd, 0);
    if (addr == MAP_FAILED) {
        close(fd);
        std::cerr << "Failed to mmap\n";
        return;
    }
    char* data = (char*)addr;
    
    // Track which pages we've freed
    size_t num_pages = (file_size + page_size - 1) / page_size;
    std::vector<bool> page_freed(num_pages, false);
    
    // Process file in small chunks
    const size_t chunk_size = 1024 * 1024; // 1MB
    uint64_t sum = 0;
    
    for (size_t offset = 0; offset < file_size; offset += chunk_size) {
        // Process chunk
        size_t chunk_end = std::min(offset + chunk_size, file_size);
        for (size_t i = offset; i < chunk_end; i += 4096) {
            sum += data[i];
        }
        
        // Drop pages outside window
        if (offset >= window_size) {
            size_t drop_start = offset - window_size;
            size_t drop_end = drop_start + chunk_size;
            
            // Align to pages
            size_t start_page = drop_start / page_size;
            size_t end_page = (drop_end + page_size - 1) / page_size;
            
            for (size_t page = start_page; page < end_page && page < num_pages; page++) {
                if (!page_freed[page]) {
                    void* page_addr = data + (page * page_size);
                    // Use MADV_DONTNEED on Linux (MADV_FREE on macOS)
                    #ifdef __linux__
                    madvise(page_addr, page_size, MADV_DONTNEED);
                    #else
                    madvise(page_addr, page_size, MADV_FREE);
                    #endif
                    page_freed[page] = true;
                }
            }
        }
        
        // Progress report
        if (offset > 0 && offset % (256 * 1024 * 1024) == 0) {
            std::cout << "Processed " << (offset / (1024 * 1024)) << " MB, ";
            std::cout << "Peak RSS: " << get_peak_rss_mb() << " MB\n";
        }
    }
    
    munmap(addr, file_size);
    close(fd);
    
    size_t rss_end = get_peak_rss_mb();
    std::cout << "\nFinal Peak RSS: " << rss_end << " MB\n";
    std::cout << "RSS increase: " << (rss_end - rss_start) << " MB\n";
    std::cout << "Expected: ~16-32 MB (window size + overhead)\n";
    std::cout << "Sum: " << sum << "\n\n";
}

int main(int argc, char* argv[]) {
    if (argc != 2) {
        std::cout << "Usage: " << argv[0] << " <naive|mmap>\n";
        return 1;
    }
    
    if (strcmp(argv[1], "naive") == 0) {
        test_naive_2gb();
    } else if (strcmp(argv[1], "mmap") == 0) {
        test_mmap_window();
    } else {
        std::cerr << "Unknown command: " << argv[1] << "\n";
        return 1;
    }
    
    return 0;
}