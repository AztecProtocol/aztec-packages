#include <iostream>
#include <sys/mman.h>
#include <fcntl.h>
#include <unistd.h>
#include <mach/mach.h>
#include <sys/resource.h>

// Get current memory usage (not peak) on macOS
size_t get_current_memory_mb() {
    task_vm_info_data_t info;
    mach_msg_type_number_t count = TASK_VM_INFO_COUNT;
    
    if (task_info(mach_task_self(), TASK_VM_INFO, (task_info_t)&info, &count) == KERN_SUCCESS) {
        return info.phys_footprint / (1024 * 1024);
    }
    return 0;
}

int main() {
    const size_t file_size = 2ULL * 1024 * 1024 * 1024; // 2GB
    const char* filename = "/tmp/test_2gb.dat";
    const size_t window_size = 16 * 1024 * 1024; // 16MB
    
    std::cout << "=== Testing mmap sliding window with current memory tracking ===\n";
    
    size_t mem_start = get_current_memory_mb();
    std::cout << "Memory at start: " << mem_start << " MB\n\n";
    
    // Open file
    int fd = open(filename, O_RDONLY);
    if (fd < 0) {
        std::cerr << "Failed to open file\n";
        return 1;
    }
    
    // Memory map - initially no pages are loaded
    void* addr = mmap(nullptr, file_size, PROT_READ, MAP_PRIVATE, fd, 0);
    if (addr == MAP_FAILED) {
        close(fd);
        std::cerr << "Failed to mmap\n";
        return 1;
    }
    char* data = (char*)addr;
    
    size_t mem_after_mmap = get_current_memory_mb();
    std::cout << "Memory after mmap (before accessing): " << mem_after_mmap << " MB\n";
    std::cout << "Increase: " << (mem_after_mmap - mem_start) << " MB (should be minimal)\n\n";
    
    // Process file in chunks
    const size_t chunk_size = 4 * 1024 * 1024; // 4MB chunks
    const size_t page_size = getpagesize();
    uint64_t sum = 0;
    
    std::cout << "Processing 2GB file with " << (window_size/(1024*1024)) << " MB window...\n";
    
    for (size_t offset = 0; offset < file_size; offset += chunk_size) {
        // Read chunk
        size_t chunk_end = std::min(offset + chunk_size, file_size);
        for (size_t i = offset; i < chunk_end; i += 1024) {
            sum += data[i];
        }
        
        // Free old pages if we're past the window
        if (offset > window_size) {
            size_t free_offset = offset - window_size;
            size_t free_start = (free_offset / page_size) * page_size;
            size_t free_size = chunk_size;
            
            // Use madvise with MADV_DONTNEED on macOS  
            madvise(data + free_start, free_size, MADV_DONTNEED);
        }
        
        // Report memory usage periodically
        if (offset > 0 && offset % (256 * 1024 * 1024) == 0) {
            size_t current_mem = get_current_memory_mb();
            std::cout << "Processed " << (offset / (1024 * 1024)) << " MB";
            std::cout << " - Current memory: " << current_mem << " MB";
            std::cout << " (+" << (current_mem - mem_start) << " MB from start)\n";
        }
    }
    
    munmap(addr, file_size);
    close(fd);
    
    size_t mem_final = get_current_memory_mb();
    std::cout << "\nFinal memory: " << mem_final << " MB\n";
    std::cout << "Total increase: " << (mem_final - mem_start) << " MB\n";
    std::cout << "Sum: " << sum << "\n";
    
    // Also show peak RSS for comparison
    struct rusage usage;
    getrusage(RUSAGE_SELF, &usage);
    std::cout << "\nPeak RSS: " << (usage.ru_maxrss / (1024 * 1024)) << " MB\n";
    
    return 0;
}