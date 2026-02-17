// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/throw_or_abort.hpp"
#include "unistd.h"
#include <atomic>
#include <cstring>
#include <fcntl.h>
#include <filesystem>
#include <memory>
#include <unordered_map>
#ifndef __wasm__
#include <sys/mman.h>
#endif

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern bool slow_low_memory;

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern size_t storage_budget;

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern std::atomic<size_t> current_storage_usage;

// Parse storage size string (e.g., "500m", "2g", "1024k")
size_t parse_size_string(const std::string& size_str);

template <typename Fr> struct BackingMemory {
    // Common raw data pointer used by all storage types
    Fr* raw_data = nullptr;

#ifndef __wasm__
    // File-backed data substruct with cleanup metadata
    struct FileBackedData {
        size_t file_size;
        std::string filename;
        int fd;
        Fr* raw_data_ptr;

        ~FileBackedData()
        {
            if (raw_data_ptr != nullptr && file_size > 0) {
                munmap(raw_data_ptr, file_size);
                current_storage_usage.fetch_sub(file_size);
            }
            if (fd >= 0) {
                close(fd);
            }
            if (!filename.empty()) {
                std::filesystem::remove(filename);
            }
        }
    };
    std::shared_ptr<FileBackedData> file_backed;
#endif
    // Aligned memory data substruct
    std::shared_ptr<Fr[]> aligned_memory;

    BackingMemory() = default;

    BackingMemory(const BackingMemory&) = default;
    BackingMemory& operator=(const BackingMemory&) = default;

    BackingMemory(BackingMemory&& other) noexcept
        : raw_data(other.raw_data)
#ifndef __wasm__
        , file_backed(std::move(other.file_backed))
#endif
        , aligned_memory(std::move(other.aligned_memory))
    {
        other.raw_data = nullptr;
    }

    BackingMemory& operator=(BackingMemory&& other) noexcept
    {
        if (this != &other) {
            raw_data = other.raw_data;
#ifndef __wasm__
            file_backed = std::move(other.file_backed);
#endif
            aligned_memory = std::move(other.aligned_memory);
            other.raw_data = nullptr;
        }
        return *this;
    }

    // Allocate memory, preferring file-backed if in low memory mode.
    // Uses a thread-local pool to reuse buffers and avoid malloc contention.
    // Memory is NOT zeroed — callers that need zeroed memory must do so themselves.
    static BackingMemory allocate(size_t size)
    {
        BackingMemory memory;
#ifndef __wasm__
        if (slow_low_memory) {
            if (try_allocate_file_backed(memory, size)) {
                return memory;
            }
        }
#endif
        allocate_pooled(memory, size);
        return memory;
    }

    // Allocate raw memory without pooling (for one-off large allocations like arenas).
    // Memory is NOT zeroed.
    static BackingMemory allocate_raw(size_t size)
    {
        BackingMemory memory;
        if (size == 0) {
            return memory;
        }
        Fr* ptr = new Fr[size];
        memory.aligned_memory = std::shared_ptr<Fr[]>(ptr, [](Fr* p) { delete[] p; });
        memory.raw_data = ptr;
        return memory;
    }

    // Create a BackingMemory that aliases into a parent shared_ptr at a given offset.
    // Used for arena-style allocation where multiple polynomials share one contiguous buffer.
    static BackingMemory from_aliased(std::shared_ptr<Fr[]> parent_memory, Fr* raw_ptr)
    {
        BackingMemory memory;
        memory.aligned_memory = std::shared_ptr<Fr[]>(parent_memory, raw_ptr);
        memory.raw_data = raw_ptr;
        return memory;
    }

    ~BackingMemory() = default;

  private:
    // Thread-local pool that caches one buffer per size class to eliminate
    // malloc/free overhead for the common alloc-use-free-realloc pattern.
    struct Pool {
        std::unordered_map<size_t, Fr*> cache;

        ~Pool()
        {
            for (auto& [sz, ptr] : cache) {
                delete[] ptr;
            }
        }

        Fr* acquire(size_t size)
        {
            auto it = cache.find(size);
            if (it != cache.end()) {
                Fr* ptr = it->second;
                cache.erase(it);
                return ptr;
            }
            return new Fr[size];
        }

        void release(size_t size, Fr* ptr)
        {
            auto [it, inserted] = cache.try_emplace(size, ptr);
            if (!inserted) {
                delete[] it->second;
                it->second = ptr;
            }
        }
    };

    static Pool& get_pool()
    {
        thread_local Pool pool;
        return pool;
    }

    static void allocate_pooled(BackingMemory& memory, size_t size)
    {
        if (size == 0) {
            memory.aligned_memory = nullptr;
            memory.raw_data = nullptr;
            return;
        }
        Fr* ptr = get_pool().acquire(size);
        memory.aligned_memory = std::shared_ptr<Fr[]>(ptr, [size](Fr* p) { get_pool().release(size, p); });
        memory.raw_data = ptr;
    }

#ifndef __wasm__
    static bool try_allocate_file_backed(BackingMemory& memory, size_t size)
    {
        if (size == 0) {
            return false;
        }

        size_t required_bytes = size * sizeof(Fr);
        size_t current_usage = current_storage_usage.load();

        // Check if we're under the storage budget
        if (current_usage + required_bytes > storage_budget) {
            return false;
        }

        size_t file_size = required_bytes;
        static std::atomic<size_t> file_counter{ 0 };
        size_t id = file_counter.fetch_add(1);

        std::filesystem::path temp_dir;
        try {
            temp_dir = std::filesystem::temp_directory_path();
        } catch (const std::exception&) {
            temp_dir = std::filesystem::current_path();
        }

        std::string filename = temp_dir / ("poly-mmap-" + std::to_string(getpid()) + "-" + std::to_string(id));

        int fd = open(filename.c_str(), O_CREAT | O_RDWR | O_TRUNC, 0644);
        if (fd < 0) {
            return false;
        }

        if (ftruncate(fd, static_cast<off_t>(file_size)) != 0) {
            close(fd);
            std::filesystem::remove(filename);
            return false;
        }

        void* addr = mmap(nullptr, file_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
        if (addr == MAP_FAILED) {
            close(fd);
            std::filesystem::remove(filename);
            return false;
        }

        auto file_backed_data = std::make_shared<FileBackedData>();
        file_backed_data->file_size = file_size;
        file_backed_data->filename = filename;
        file_backed_data->fd = fd;
        file_backed_data->raw_data_ptr = static_cast<Fr*>(addr);

        memory.raw_data = static_cast<Fr*>(addr);
        memory.file_backed = std::move(file_backed_data);

        current_storage_usage.fetch_add(required_bytes);

        return true;
    }
#endif
};
