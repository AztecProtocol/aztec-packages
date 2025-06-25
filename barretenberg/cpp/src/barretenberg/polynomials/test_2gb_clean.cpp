#include <iostream>
#include <sys/resource.h>
#include <sys/mman.h>
#include <fcntl.h>
#include <unistd.h>
#include <cstring>

size_t get_peak_rss_mb() {
    struct rusage usage;
    getrusage(RUSAGE_SELF, &usage);
    return usage.ru_maxrss / (1024 * 1024);
}

int main(int argc, char* argv[]) {
    if (argc != 2) {
        std::cerr << "Usage: " << argv[0] << " <naive|mmap>\n";
        return 1;
    }
    
    const size_t file_size = 2ULL * 1024 * 1024 * 1024; // 2GB
    const char* filename = "/tmp/test_2gb.dat";
    
    if (strcmp(argv[1], "naive") == 0) {
        std::cout << "=== NAIVE: Load entire 2GB file ===\n";
        size_t rss_start = get_peak_rss_mb();
        
        // Read entire file into memory
        int fd = open(filename, O_RDONLY);
        if (fd < 0) return 1;
        
        char* buffer = new char[file_size];
        size_t total_read = 0;
        while (total_read < file_size) {
            ssize_t bytes = read(fd, buffer + total_read, file_size - total_read);
            if (bytes <= 0) break;
            total_read += bytes;
        }
        close(fd);
        
        // Process
        uint64_t sum = 0;
        for (size_t i = 0; i < file_size; i += 4096) {
            sum += buffer[i];
        }
        
        delete[] buffer;
        
        size_t rss_end = get_peak_rss_mb();
        std::cout << "Peak RSS: " << rss_end << " MB (increase: " << (rss_end - rss_start) << " MB)\n";
        std::cout << "Sum: " << sum << "\n";
        
    } else if (strcmp(argv[1], "mmap") == 0) {
        std::cout << "=== MMAP: Process 2GB with 16MB window ===\n";
        size_t rss_start = get_peak_rss_mb();
        
        int fd = open(filename, O_RDONLY);
        if (fd < 0) return 1;
        
        // Memory map the file - but don't touch it yet!
        void* addr = mmap(nullptr, file_size, PROT_READ, MAP_PRIVATE, fd, 0);
        if (addr == MAP_FAILED) {
            close(fd);
            return 1;
        }
        char* data = (char*)addr;
        
        // Process in chunks with aggressive page dropping
        const size_t window_size = 16 * 1024 * 1024; // 16MB
        const size_t chunk_size = 1024 * 1024; // 1MB chunks
        const size_t page_size = getpagesize();
        
        uint64_t sum = 0;
        
        for (size_t chunk_start = 0; chunk_start < file_size; chunk_start += chunk_size) {
            // Process this chunk
            size_t chunk_end = std::min(chunk_start + chunk_size, file_size);
            for (size_t i = chunk_start; i < chunk_end; i += 4096) {
                sum += data[i];
            }
            
            // Drop pages that are now outside the window
            if (chunk_start >= window_size) {
                size_t drop_start = chunk_start - window_size;
                size_t drop_end = drop_start + chunk_size;
                
                // Align to page boundaries
                drop_start = (drop_start / page_size) * page_size;
                drop_end = ((drop_end + page_size - 1) / page_size) * page_size;
                
                if (drop_end > drop_start) {
                    // On macOS, MADV_FREE actually frees pages, MADV_DONTNEED doesn't
                    madvise(data + drop_start, drop_end - drop_start, MADV_FREE);
                }
            }
            
            // Report progress
            if (chunk_start > 0 && chunk_start % (256 * 1024 * 1024) == 0) {
                std::cout << "Processed " << (chunk_start / (1024 * 1024)) << " MB, ";
                std::cout << "Peak RSS: " << get_peak_rss_mb() << " MB\n";
            }
        }
        
        munmap(addr, file_size);
        close(fd);
        
        size_t rss_end = get_peak_rss_mb();
        std::cout << "\nFinal Peak RSS: " << rss_end << " MB (increase: " << (rss_end - rss_start) << " MB)\n";
        std::cout << "Expected: ~16-32 MB\n";
        std::cout << "Sum: " << sum << "\n";
    }
    
    return 0;
}