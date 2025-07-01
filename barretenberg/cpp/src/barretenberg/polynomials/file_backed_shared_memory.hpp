#pragma once
#include <memory>
#include <string>
#include <sys/mman.h>
#include <unistd.h>
#include <fcntl.h>
#include <filesystem>

namespace bb {

/**
 * @brief Shared memory manager for file-backed arrays
 * 
 * This class manages the lifetime of a memory-mapped file, ensuring it stays
 * alive as long as any array is using it. It uses reference counting via
 * shared_ptr to manage the lifetime.
 */
template <typename T>
class FileBackedSharedMemory {
public:
    struct MemoryResource {
        T* data = nullptr;
        int fd = -1;
        size_t file_size = 0;
        std::string filename;
        
        ~MemoryResource() {
            if (data != nullptr && file_size > 0) {
                munmap(data, file_size);
            }
            if (fd >= 0) {
                close(fd);
            }
            if (!filename.empty()) {
                std::filesystem::remove(filename);
            }
        }
    };
    
    // Create a new file-backed memory region
    static std::shared_ptr<MemoryResource> create(size_t size, const std::string& filename) {
        auto resource = std::make_shared<MemoryResource>();
        resource->filename = filename;
        resource->file_size = size * sizeof(T);
        
        // Create file
        resource->fd = open(filename.c_str(), O_CREAT | O_RDWR | O_TRUNC, 0644);
        if (resource->fd < 0) {
            throw std::runtime_error("Failed to create backing file: " + filename);
        }
        
        // Set file size
        if (ftruncate(resource->fd, static_cast<off_t>(resource->file_size)) != 0) {
            throw std::runtime_error("Failed to set file size");
        }
        
        // Memory map the file
        void* addr = mmap(nullptr, resource->file_size, PROT_READ | PROT_WRITE, MAP_SHARED, resource->fd, 0);
        if (addr == MAP_FAILED) {
            throw std::runtime_error("Failed to mmap file");
        }
        
        resource->data = static_cast<T*>(addr);
        return resource;
    }
};

} // namespace bb