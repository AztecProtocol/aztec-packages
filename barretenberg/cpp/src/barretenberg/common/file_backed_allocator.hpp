// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/throw_or_abort.hpp"
#include <atomic>
#include <cstring>
#include <fcntl.h>
#include <filesystem>
#include <sys/mman.h>
#include <unordered_map>

namespace bb {

struct FileBackedAllocation {
    void* ptr;
    int fd;
    std::size_t size_bytes;
    std::string filename;

    FileBackedAllocation() = default;

    FileBackedAllocation(std::size_t size_bytes, const std::string& filename_prefix)
        : size_bytes(size_bytes)
    {
        if (size_bytes == 0) {
            return;
        }

        static std::atomic<size_t> file_counter{ 0 };
        size_t id = file_counter.fetch_add(1);
        std::filesystem::path temp_dir;
        try {
            temp_dir = std::filesystem::temp_directory_path();
        } catch (const std::exception&) {
            // Fallback to current directory if temp_directory_path() fails
            temp_dir = std::filesystem::current_path();
        }

        filename = temp_dir / (filename_prefix + std::to_string(getpid()) + "-" + std::to_string(id));

        fd = open(filename.c_str(), O_CREAT | O_RDWR | O_TRUNC, 0644);
        // Create file
        if (fd < 0) {
            throw_or_abort("Failed to create backing file: " + filename);
        }

        // Set file size
        if (ftruncate(fd, static_cast<off_t>(size_bytes)) != 0) {
            throw_or_abort("Failed to set file size");
        }

        // Memory map the file
        ptr = mmap(nullptr, size_bytes, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
        if (ptr == MAP_FAILED) {
            throw_or_abort("Failed to mmap file: " + std::string(std::strerror(errno)));
        }
    }
    FileBackedAllocation(const FileBackedAllocation&) = delete;            // delete copy constructor
    FileBackedAllocation& operator=(const FileBackedAllocation&) = delete; // delete copy assignment

    FileBackedAllocation& operator=(FileBackedAllocation&& other) noexcept
    {
        std::swap(ptr, other.ptr);
        std::swap(fd, other.fd);
        filename = std::move(other.filename);
        std::swap(size_bytes, other.size_bytes);
        return *this;
    }

    ~FileBackedAllocation() noexcept
    {
        if (size_bytes == 0) {
            return;
        }
        munmap(ptr, size_bytes);
        close(fd);
        std::filesystem::remove(filename);
    }
};

template <typename T> class FileBackedAllocator {
  public:
    using value_type = T;
    using pointer = T*;
    using const_pointer = const T*;
    using size_type = std::size_t;

    template <class U> struct rebind {
        using other = FileBackedAllocator<U>;
    };

    FileBackedAllocator() = default;

    T* allocate(std::size_t n)
    {
        size_t size_bytes = n * sizeof(T);
        FileBackedAllocation allocation(size_bytes, "allocator-mmap-");

        // Cleanup: store file info for deallocation
        void* ptr = allocation.ptr;
        allocations[ptr] = std::move(allocation);
        return static_cast<T*>(ptr);
    }

    void deallocate(T* p, std::size_t /*unused*/) noexcept { allocations.erase(p); }

  private:
    static inline std::unordered_map<void*, FileBackedAllocation> allocations;
};

template <typename T, typename U>
bool operator==(const FileBackedAllocator<T>& /*unused*/, const FileBackedAllocator<U>& /*unused*/) noexcept
{
    return true;
}

template <typename T, typename U>
bool operator!=(const FileBackedAllocator<T>& /*unused*/, const FileBackedAllocator<U>& /*unused*/) noexcept
{
    return false;
}

/**
 * @brief A vector that uses the file backed allocator.
 */
template <typename T> using FileBackedVector = std::vector<T, bb::FileBackedAllocator<T>>;

} // namespace bb
