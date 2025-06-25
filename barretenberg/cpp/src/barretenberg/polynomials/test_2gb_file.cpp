#include <iostream>
#include <fstream>
#include <vector>
#include <chrono>
#include <sys/resource.h>
#include <sys/mman.h>
#include <fcntl.h>
#include <unistd.h>
#include <cstring>

// Get peak RSS in MB
static size_t get_peak_rss_mb() {
    struct rusage usage;
    if (getrusage(RUSAGE_SELF, &usage) == 0) {
        return static_cast<size_t>(usage.ru_maxrss / (1024 * 1024));
    }
    return 0;
}

void create_2gb_file() {
    const size_t file_size = 2ULL * 1024 * 1024 * 1024; // 2GB
    const char* filename = "/tmp/test_2gb.dat";
    
    std::cout << "Creating 2GB test file..." << std::endl;
    
    int fd = open(filename, O_CREAT | O_RDWR | O_TRUNC, 0644);
    if (fd < 0) {
        std::cerr << "Failed to create file" << std::endl;
        return;
    }
    
    // Make it 2GB
    if (ftruncate(fd, file_size) != 0) {
        close(fd);
        std::cerr << "Failed to resize file" << std::endl;
        return;
    }
    
    // Write pattern
    uint64_t* data = (uint64_t*)mmap(nullptr, file_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    if (data == MAP_FAILED) {
        close(fd);
        std::cerr << "Failed to mmap for writing" << std::endl;
        return;
    }
    
    size_t num_elements = file_size / sizeof(uint64_t);
    for (size_t i = 0; i < num_elements; i += 1024) { // Write every 1024th element
        data[i] = i;
    }
    
    msync(data, file_size, MS_SYNC);
    munmap(data, file_size);
    close(fd);
    
    std::cout << "Created 2GB file at " << filename << std::endl;
}

void test_naive_load() {
    const size_t file_size = 2ULL * 1024 * 1024 * 1024; // 2GB
    const char* filename = "/tmp/test_2gb.dat";
    
    std::cout << "\n=== NAIVE: Load entire 2GB file into memory ===" << std::endl;
    size_t rss_start = get_peak_rss_mb();
    std::cout << "Peak RSS at start: " << rss_start << " MB" << std::endl;
    
    // Allocate 2GB buffer
    std::cout << "Allocating 2GB buffer..." << std::endl;
    std::vector<uint8_t> buffer(file_size);
    
    // Read file
    std::cout << "Reading 2GB file..." << std::endl;
    std::ifstream file(filename, std::ios::binary);
    if (!file) {
        std::cerr << "Failed to open file" << std::endl;
        return;
    }
    file.read(reinterpret_cast<char*>(buffer.data()), file_size);
    file.close();
    
    // Process data
    std::cout << "Processing data..." << std::endl;
    uint64_t sum = 0;
    for (size_t i = 0; i < file_size; i += 1024) {
        sum += buffer[i];
    }
    
    size_t rss_end = get_peak_rss_mb();
    std::cout << "\nFINAL Peak RSS: " << rss_end << " MB" << std::endl;
    std::cout << "RSS increase: " << (rss_end - rss_start) << " MB" << std::endl;
    std::cout << "Checksum: " << sum << std::endl;
}

void test_mmap_with_window() {
    const size_t file_size = 2ULL * 1024 * 1024 * 1024; // 2GB
    const char* filename = "/tmp/test_2gb.dat";
    const size_t window_size = 16 * 1024 * 1024; // 16MB window
    
    std::cout << "\n=== MMAP: Process 2GB file with 16MB window ===" << std::endl;
    size_t rss_start = get_peak_rss_mb();
    std::cout << "Peak RSS at start: " << rss_start << " MB" << std::endl;
    
    // Open and mmap file
    int fd = open(filename, O_RDONLY);
    if (fd < 0) {
        std::cerr << "Failed to open file" << std::endl;
        return;
    }
    
    std::cout << "Memory mapping 2GB file..." << std::endl;
    uint8_t* data = (uint8_t*)mmap(nullptr, file_size, PROT_READ, MAP_SHARED, fd, 0);
    if (data == MAP_FAILED) {
        close(fd);
        std::cerr << "Failed to mmap" << std::endl;
        return;
    }
    
    // IMPORTANT: Tell the kernel we'll access sequentially and don't need the whole file
    madvise(data, file_size, MADV_SEQUENTIAL);
    
    size_t page_size = getpagesize();
    
    // Pre-fault only the first window
    std::cout << "Pre-loading first " << (window_size / (1024*1024)) << " MB..." << std::endl;
    volatile uint8_t touch = 0;
    for (size_t i = 0; i < window_size && i < file_size; i += page_size) {
        touch += data[i];
    }
    
    // Process with sliding window
    std::cout << "Processing with 16MB sliding window (dropping pages as we go)..." << std::endl;
    uint64_t sum = 0;
    size_t bytes_per_iteration = 4096; // Process in 4KB chunks
    
    for (size_t offset = 0; offset < file_size; offset += bytes_per_iteration) {
        // Process current chunk
        for (size_t i = offset; i < offset + bytes_per_iteration && i < file_size; i += 8) {
            sum += *((uint64_t*)(data + i));
        }
        
        // Drop pages that are now outside our window
        if (offset > window_size) {
            size_t drop_offset = offset - window_size;
            // Align to page boundary
            size_t drop_page_start = (drop_offset / page_size) * page_size;
            
            // Only drop if we haven't already
            static size_t last_dropped_offset = 0;
            if (drop_page_start > last_dropped_offset) {
                size_t drop_size = drop_page_start - last_dropped_offset;
                madvise(data + last_dropped_offset, drop_size, MADV_DONTNEED);
                last_dropped_offset = drop_page_start;
            }
        }
        
        // Progress report every 256MB
        if (offset > 0 && offset % (256 * 1024 * 1024) == 0) {
            size_t processed_mb = offset / (1024 * 1024);
            size_t current_rss = get_peak_rss_mb();
            std::cout << "Processed " << processed_mb << " MB, Peak RSS: " << current_rss << " MB" << std::endl;
        }
    }
    
    munmap(data, file_size);
    close(fd);
    
    size_t rss_end = get_peak_rss_mb();
    std::cout << "\nFINAL Peak RSS: " << rss_end << " MB" << std::endl;
    std::cout << "RSS increase: " << (rss_end - rss_start) << " MB" << std::endl;
    std::cout << "Expected: ~16-32 MB (window size + overhead)" << std::endl;
    std::cout << "Checksum: " << sum << std::endl;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << "Usage: " << argv[0] << " <create|naive|mmap>" << std::endl;
        return 1;
    }
    
    std::string cmd = argv[1];
    
    if (cmd == "create") {
        create_2gb_file();
    } else if (cmd == "naive") {
        test_naive_load();
    } else if (cmd == "mmap") {
        test_mmap_with_window();
    } else {
        std::cerr << "Unknown command: " << cmd << std::endl;
        return 1;
    }
    
    return 0;
}