#include "barretenberg/common/throw_or_abort.hpp"
#include <atomic>
#include <cstring>
#include <fcntl.h>
#include <filesystem>
#include <sys/mman.h>
#include <unordered_map>

template <typename T> class FileBackedAllocator {
  public:
    using value_type = T;

    FileBackedAllocator() = default;

    T* allocate(std::size_t n)
    {
        size_t size_bytes = n * sizeof(T);
        static std::atomic<size_t> file_counter{ 0 };
        size_t id = file_counter.fetch_add(1);
        std::filesystem::path temp_dir;
        try {
            temp_dir = std::filesystem::temp_directory_path();
        } catch (const std::exception&) {
            // Fallback to current directory if temp_directory_path() fails
            temp_dir = std::filesystem::current_path();
        }

        std::string filename = temp_dir / ("poly-mmap-" + std::to_string(getpid()) + "-" + std::to_string(id));

        int fd = open(filename.c_str(), O_CREAT | O_RDWR | O_TRUNC, 0644);
        // Create file
        if (fd < 0) {
            throw_or_abort("Failed to create backing file: " + filename);
        }

        // Set file size
        if (ftruncate(fd, static_cast<off_t>(size_bytes)) != 0) {
            throw_or_abort("Failed to set file size");
        }

        // Memory map the file
        void* ptr = mmap(nullptr, size_bytes, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
        if (ptr == MAP_FAILED) {
            throw_or_abort("Failed to mmap file: " + std::string(std::strerror(errno)));
        }

        // Cleanup: store file info for deallocation
        allocations[ptr] = { fd, size_bytes, filename };
        return static_cast<T*>(ptr);
    }

    void deallocate(T* p, std::size_t /*unused*/) noexcept
    {
        auto it = allocations.find(p);
        if (it != allocations.end()) {
            munmap(p, it->second.size);
            close(it->second.fd);
            std::remove(it->second.filename.c_str());
            allocations.erase(it);
        }
    }

  private:
    struct AllocationInfo {
        int fd;
        std::size_t size;
        std::string filename;
    };

    static inline std::unordered_map<void*, AllocationInfo> allocations;
};
