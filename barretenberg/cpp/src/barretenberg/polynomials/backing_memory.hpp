#pragma once

#include "barretenberg/common/throw_or_abort.hpp"
#include "unistd.h"
#include <atomic>
#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <filesystem>
#include <memory>
#if !defined(__wasm__) && !defined(_WIN32)
#include <sys/mman.h>
#endif

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern bool slow_low_memory;

/**
 * @brief MSM batch memory budget used in low memory mode (see scalar_multiplication::set_msm_batch_mem_budget).
 * @details Measured on the pinned transfer flows, 16 MiB is the smallest budget whose proof at its memory floor stays
 * within 4x of ordinary mode; below it the floor no longer drops and the capped wall time rises steeply.
 */
inline constexpr size_t LOW_MEMORY_MSM_BATCH_MEM_BUDGET = size_t{ 16 } << 20;

/**
 * @brief Whether BB_SLOW_LOW_MEMORY asks for low memory mode ("1"). When it does, the heap and the MSM budget are
 * configured for it as set_slow_low_memory(true) would. slow_low_memory is initialized from this.
 */
bool slow_low_memory_from_environment();

/**
 * @brief Turn low memory mode on or off. Turning it on also configures the heap to return freed memory promptly
 * (bb::configure_heap_for_low_memory) and sets the MSM batch memory budget to LOW_MEMORY_MSM_BATCH_MEM_BUDGET;
 * turning it off leaves both as they are.
 */
void set_slow_low_memory(bool enabled);

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern size_t storage_budget;

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern std::atomic<size_t> current_storage_usage;

// Parse storage size string (e.g., "500m", "2g", "1024k")
size_t parse_size_string(const std::string& size_str);

/**
 * @brief Storage for polynomial coefficients: an aligned heap allocation, or in low memory mode a file in the temp
 * directory mapped MAP_SHARED.
 *
 * @details In low memory mode the coefficients, witness polynomials included, are written to files under TMPDIR (or
 * the system temp directory). Because the mapping is shared, the kernel writes dirty pages back to those files under
 * memory pressure, so witness data reaches the filesystem rather than only anonymous memory or swap. Each file is
 * created with mode 0600 and unlinked as soon as it is opened, so no name refers to it and it disappears when the
 * mapping goes, but its blocks are not wiped and may stay on the device until they are reused. Where that matters,
 * point TMPDIR at an encrypted or ephemeral filesystem.
 *
 * The file's blocks are reserved with posix_fallocate, so a full disk fails the allocation instead of raising SIGBUS
 * on a later write. On filesystems without native fallocate support glibc emulates it by writing every block, which
 * makes allocating a large polynomial correspondingly slow.
 */
template <typename Fr> struct BackingMemory {
    // Common raw data pointer used by all storage types
    Fr* raw_data = nullptr;

#if !defined(__wasm__) && !defined(_WIN32)
    // File-backed data substruct with cleanup metadata
    struct FileBackedData {
        size_t file_size;
        Fr* raw_data_ptr;

        ~FileBackedData()
        {
            if (raw_data_ptr != nullptr && file_size > 0) {
                munmap(raw_data_ptr, file_size);
                current_storage_usage.fetch_sub(file_size);
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

    // Allocate memory, file-backed in low memory mode (failing rather than falling back to the heap).
    // Memory is NOT zeroed — callers that need zeroed memory must do so themselves.
    static BackingMemory allocate(size_t size)
    {
        BackingMemory memory;
#if !defined(__wasm__) && !defined(_WIN32)
        if (slow_low_memory && size > 0) {
            allocate_file_backed(memory, size);
            return memory;
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
    // A heap fallback would silently break the memory bound slow_low_memory was requested for.
    static void allocate_file_backed(BackingMemory& memory, size_t size)
    {
        if (size > std::numeric_limits<size_t>::max() / sizeof(Fr)) {
            throw_or_abort("slow_low_memory: polynomial of " + std::to_string(size) + " elements overflows size_t");
        }

        size_t required_bytes = size * sizeof(Fr);

        // Check and update storage usage to enforce budget
        size_t current_usage = current_storage_usage.load();
        while (true) {
            if (current_usage + required_bytes > storage_budget) {
                throw_or_abort("slow_low_memory: allocating " + std::to_string(required_bytes) +
                               " bytes would exceed the storage budget (" + std::to_string(current_usage) + " of " +
                               std::to_string(storage_budget) + " bytes in use)");
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

        auto fail = [&](int fd, const std::string& step, int error) {
            if (fd >= 0) {
                close(fd);
            }
            current_storage_usage.fetch_sub(required_bytes);
            throw_or_abort("slow_low_memory: " + step + " failed for " + std::to_string(file_size) + "-byte file " +
                           filename + ": " + std::strerror(error));
        };

        int fd = open(filename.c_str(), O_CREAT | O_RDWR | O_TRUNC | O_EXCL, 0600);
        if (fd < 0) {
            fail(-1, "open", errno);
        }
        // The open fd, and after it the mapping, keep the file alive; unlinking now means a crash cannot
        // leave witness data behind in the temp directory.
        std::filesystem::remove(filename);

        // Reserve the blocks up front: with a shared mapping, a write into a hole on a full disk raises
        // SIGBUS instead of failing here. Apple has no posix_fallocate and keeps that exposure.
#if defined(__APPLE__)
        if (ftruncate(fd, static_cast<off_t>(file_size)) != 0) {
            fail(fd, "ftruncate", errno);
        }
#else
        if (int error = posix_fallocate(fd, 0, static_cast<off_t>(file_size)); error != 0) {
            fail(fd, "posix_fallocate", error);
        }
#endif

        // Shared, so dirty pages are file pages the kernel can write back and reclaim; a private mapping
        // would turn every written page into an anonymous copy-on-write page.
        void* addr = mmap(nullptr, file_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
        if (addr == MAP_FAILED) {
            fail(fd, "mmap", errno);
        }
        // The mapping holds its own reference to the file, so the descriptor is not needed past this point;
        // keeping one per polynomial would hit RLIMIT_NOFILE on large proofs.
        close(fd);

        auto file_backed_data = std::make_shared<FileBackedData>();
        file_backed_data->file_size = file_size;
        file_backed_data->raw_data_ptr = static_cast<Fr*>(addr);

        memory.raw_data = static_cast<Fr*>(addr);
        memory.file_backed = std::move(file_backed_data);
    }
#endif
};
