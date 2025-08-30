// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/slab_allocator.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "unistd.h"
#include <atomic>
#include <cstring>
#include <fcntl.h>
#include <filesystem>
#include <memory>
#ifndef __wasm__
#include <sys/mman.h>
#ifdef __linux__
#include <linux/falloc.h>
#endif
#endif

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern bool slow_low_memory;

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern bool enable_memory_fallback;

template <typename T> class AlignedMemory;

#ifndef __wasm__
template <typename T> class FileBackedMemory;
#endif

template <typename Fr> class BackingMemory {
  public:
    BackingMemory() = default;

    BackingMemory(const BackingMemory&) = delete;            // delete copy constructor
    BackingMemory& operator=(const BackingMemory&) = delete; // delete copy assignment

    BackingMemory(BackingMemory&& other) = delete;            // delete move constructor
    BackingMemory& operator=(const BackingMemory&&) = delete; // delete move assignment

    virtual Fr* raw_data() = 0;

    static std::shared_ptr<BackingMemory<Fr>> allocate(size_t size)
    {
#ifndef __wasm__
        if (slow_low_memory) {
            if (enable_memory_fallback) {
                // With fallback enabled, catch exceptions and fall back to AlignedMemory
                try {
                    return std::shared_ptr<BackingMemory<Fr>>(new FileBackedMemory<Fr>(size));
                } catch (const std::exception& e) {
                    // Fall back to AlignedMemory if FileBackedMemory allocation fails
                    return std::shared_ptr<BackingMemory<Fr>>(new AlignedMemory<Fr>(size));
                }
            } else {
                // Without fallback, let exceptions propagate (will abort on failure)
                return std::shared_ptr<BackingMemory<Fr>>(new FileBackedMemory<Fr>(size));
            }
        }
#endif
        return std::shared_ptr<BackingMemory<Fr>>(new AlignedMemory<Fr>(size));
    }

    virtual ~BackingMemory() = default;
};

template <typename T> class AlignedMemory : public BackingMemory<T> {
  public:
    T* raw_data() { return data.get(); }

  private:
    AlignedMemory(size_t size)
        : BackingMemory<T>()
        // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
        , data(std::static_pointer_cast<T[]>(std::move(bb::get_mem_slab(sizeof(T) * size))))
    {}

    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    std::shared_ptr<T[]> data;

    friend BackingMemory<T>;
};

#ifndef __wasm__
template <typename T> class FileBackedMemory : public BackingMemory<T> {
  public:
    FileBackedMemory(const FileBackedMemory&) = delete;            // delete copy constructor
    FileBackedMemory& operator=(const FileBackedMemory&) = delete; // delete copy assignment

    FileBackedMemory(FileBackedMemory&& other) = delete;            // delete move constructor
    FileBackedMemory& operator=(const FileBackedMemory&&) = delete; // delete move assignment

    T* raw_data() { return memory; }

    ~FileBackedMemory()
    {
        if (file_size == 0) {
            return;
        }
        if (memory != nullptr && file_size > 0) {
            munmap(memory, file_size);
        }
        if (fd >= 0) {
            close(fd);
        }
        if (!filename.empty()) {
            std::filesystem::remove(filename);
        }
    }

  private:
    // Create a new file-backed memory region
    FileBackedMemory(size_t size)
        : BackingMemory<T>()
        , file_size(size * sizeof(T))
        , fd(-1)
        , memory(nullptr)
    {
        if (file_size == 0) {
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

        filename = temp_dir / ("poly-mmap-" + std::to_string(getpid()) + "-" + std::to_string(id));

        fd = open(filename.c_str(), O_CREAT | O_RDWR | O_TRUNC, 0644);
        // Create file
        if (fd < 0) {
            throw_or_abort("Failed to create backing file: " + filename);
        }

        // Set file size
        if (ftruncate(fd, static_cast<off_t>(file_size)) != 0) {
            close(fd);
            std::filesystem::remove(filename);
            throw_or_abort("Failed to set file size");
        }

        // If fallback is enabled, ensure space is actually allocated on disk/tmpfs, so we can catch exceptions early
        if (enable_memory_fallback) {
#ifdef __linux__
            // On Linux, use fallocate for efficient space allocation check
            if (fallocate(fd, 0, 0, static_cast<off_t>(file_size)) != 0) {
                close(fd);
                std::filesystem::remove(filename);
                throw_or_abort("Failed to allocate file space: " + std::string(std::strerror(errno)));
            }
#else
            // On other platforms, only verify space by writing to specific positions
            // This avoids the overhead of writing the entire file
            char zero = 0;

            // Write at the beginning
            if (write(fd, &zero, 1) != 1) {
                close(fd);
                std::filesystem::remove(filename);
                throw_or_abort("Failed to write to file: " + std::string(std::strerror(errno)));
            }

            // Write at the end to ensure the file can grow to full size
            if (file_size > 1) {
                if (lseek(fd, static_cast<off_t>(file_size - 1), SEEK_SET) < 0) {
                    close(fd);
                    std::filesystem::remove(filename);
                    throw_or_abort("Failed to seek in file: " + std::string(std::strerror(errno)));
                }
                if (write(fd, &zero, 1) != 1) {
                    close(fd);
                    std::filesystem::remove(filename);
                    throw_or_abort("Failed to allocate file space: " + std::string(std::strerror(errno)));
                }
                // Seek back to beginning for mmap
                if (lseek(fd, 0, SEEK_SET) < 0) {
                    close(fd);
                    std::filesystem::remove(filename);
                    throw_or_abort("Failed to seek to beginning of file");
                }
            }
#endif
        }

        // Memory map the file
        void* addr = mmap(nullptr, file_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
        if (addr == MAP_FAILED) {
            close(fd);
            std::filesystem::remove(filename);
            throw_or_abort("Failed to mmap file: " + std::string(std::strerror(errno)));
        }

        memory = static_cast<T*>(addr);
    }

    size_t file_size;
    std::string filename;
    int fd;
    T* memory;

    friend BackingMemory<T>;
};
#endif // __EMSCRIPTEN___
