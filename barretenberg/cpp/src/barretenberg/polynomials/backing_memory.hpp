// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Nishat], commit: 94f596f8b3bbbc216f9ad7dc33253256141156b2 }
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
#if !defined(__wasm__) && !defined(_WIN32)
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

#if !defined(__wasm__) && !defined(_WIN32)
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
#if !defined(__wasm__) && !defined(_WIN32)
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
#if !defined(__wasm__) && !defined(_WIN32)
            file_backed = std::move(other.file_backed);
#endif
            aligned_memory = std::move(other.aligned_memory);
            other.raw_data = nullptr;
        }
        return *this;
    }

    // Allocate memory, preferring file-backed if in low memory mode.
    // Memory is NOT zeroed — callers that need zeroed memory must do so themselves.
    static BackingMemory allocate(size_t size)
    {
        BackingMemory memory;
#if !defined(__wasm__) && !defined(_WIN32)
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
    // Use new Fr[] instead of std::make_shared<Fr[]>(n) to avoid serial
    // value-initialization (zeroing). Polynomial's constructor handles
    // zeroing in parallel where needed.
    static void allocate_aligned(BackingMemory& memory, size_t size)
    {
        if (size == 0) {
            memory.aligned_memory = nullptr;
            memory.raw_data = nullptr;
            return;
        }
        Fr* ptr = new Fr[size];
        memory.aligned_memory = std::shared_ptr<Fr[]>(ptr, [](Fr* p) { delete[] p; });
        memory.raw_data = ptr;
    }

#if !defined(__wasm__) && !defined(_WIN32)
    static bool try_allocate_file_backed(BackingMemory& memory, size_t size)
    {
        if (size == 0) {
            return false;
        }

        if (size > std::numeric_limits<size_t>::max() / sizeof(Fr)) {
            return false;
        }

        size_t required_bytes = size * sizeof(Fr);

        // Check and update storage usage to enforce budget
        size_t current_usage = current_storage_usage.load();
        while (true) {
            if (current_usage + required_bytes > storage_budget) {
                return false;
            }
            if (current_storage_usage.compare_exchange_weak(current_usage, current_usage + required_bytes)) {
                break;
            }
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

        int fd = open(filename.c_str(), O_CREAT | O_RDWR | O_TRUNC | O_EXCL, 0600);
        if (fd < 0) {
            current_storage_usage.fetch_sub(required_bytes);
            return false;
        }

        if (ftruncate(fd, static_cast<off_t>(file_size)) != 0) {
            close(fd);
            std::filesystem::remove(filename);
            current_storage_usage.fetch_sub(required_bytes);
            return false;
        }

        void* addr = mmap(nullptr, file_size, PROT_READ | PROT_WRITE, MAP_PRIVATE, fd, 0);
        if (addr == MAP_FAILED) {
            close(fd);
            std::filesystem::remove(filename);
            current_storage_usage.fetch_sub(required_bytes);
            return false;
        }

        auto file_backed_data = std::make_shared<FileBackedData>();
        file_backed_data->file_size = file_size;
        file_backed_data->filename = filename;
        file_backed_data->fd = fd;
        file_backed_data->raw_data_ptr = static_cast<Fr*>(addr);

        memory.raw_data = static_cast<Fr*>(addr);
        memory.file_backed = std::move(file_backed_data);

        return true;
    }
#endif
};
