#pragma once

#include <atomic>
#include <cstddef>
#include <memory>

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern std::atomic<size_t> current_storage_usage;

#if !defined(__wasm__) && !defined(_WIN32)
namespace bb::detail {
/**
 * @brief When polynomials are file backed (low memory mode), a new file mapping for count elements of element_size
 * bytes; otherwise, or when count is 0, null.
 * @details The mapping reads as zero. The returned pointer owns it: releasing the last reference unmaps it and
 * returns its bytes to the storage budget (low_memory::storage_budget). Fails rather than falling back to the heap; see
 * backing_memory.cpp.
 */
std::shared_ptr<void> allocate_file_backed(size_t count, size_t element_size);
} // namespace bb::detail
#endif

/**
 * @brief Storage for polynomial coefficients: an aligned heap allocation, or a file mapping (bb::detail::
 * allocate_file_backed).
 */
template <typename Fr> struct BackingMemory {
    // Common raw data pointer used by all storage types
    Fr* raw_data = nullptr;

#if !defined(__wasm__) && !defined(_WIN32)
    // Owns the file mapping raw_data points into, if any.
    std::shared_ptr<void> file_backed;
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
    // Memory is NOT zeroed — callers that need zeroed memory must do so themselves (see is_file_backed).
    static BackingMemory allocate(size_t size)
    {
        BackingMemory memory;
#if !defined(__wasm__) && !defined(_WIN32)
        if (auto mapping = bb::detail::allocate_file_backed(size, sizeof(Fr))) {
            memory.raw_data = static_cast<Fr*>(mapping.get());
            memory.file_backed = std::move(mapping);
            return memory;
        }
#endif
        allocate_aligned(memory, size);
        return memory;
    }

    /**
     * @brief Whether raw_data is a file mapping. A newly allocated one reads as zero without being written, so a caller
     * zeroing new memory skips it: writing the zeros would dirty every page, and a dirty file page must be written back
     * before it can be reclaimed.
     */
    bool is_file_backed() const noexcept
    {
#if !defined(__wasm__) && !defined(_WIN32)
        return file_backed != nullptr;
#else
        return false;
#endif
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
};
