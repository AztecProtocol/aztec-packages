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

    // Allocate memory, preferring file-backed if in low memory mode
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
        allocate_aligned(memory, size);
        return memory;
    }

    ~BackingMemory() = default;

  private:
    static void allocate_aligned(BackingMemory& memory, size_t size)
    {
        // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
        memory.aligned_memory = std::static_pointer_cast<Fr[]>(std::move(bb::get_mem_slab(sizeof(Fr) * size)));
        memory.raw_data = memory.aligned_memory.get();
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
