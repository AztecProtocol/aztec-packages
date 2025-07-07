// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/slab_allocator.hpp"
#include <atomic>
#include <cstddef>
#include <fcntl.h>
#include <filesystem>
#include <memory>
#include <string>
#include <sys/mman.h>
#include <unistd.h>

namespace bb {

/**
 * @brief A shared pointer array template that represents a virtual array filled with zeros up to `virtual_size_`,
 * but with actual memory usage proportional to the region between `start_` and `end_`.
 *
 * This structure is designed to optimize memory usage by only allocating memory for a specific subrange
 * of the array. The `start_` and `end_` members define the range of indices that are backed by actual memory.
 * The rest of the indices, up to `virtual_size_`, are conceptually filled with zero values.
 *
 * The class allows for sharing the underlying array with potential offset adjustments, making it possible
 * to represent shifted arrays where the actual memory-backed range starts from a non-zero index.
 * It is designed to be wrapped by another class, namely `Polynomial`, and is not intended to be used directly.
 *
 * @tparam T The type of the elements in the array.
 */
template <typename T> struct FileBackedSharedShiftedVirtualZeroesArray {

    struct MemoryResource {
        // Create a new file-backed memory region
        MemoryResource(size_t file_size, const std::string& filename)
            : file_size(file_size)
            , filename(filename)
            , fd(open(filename.c_str(), O_CREAT | O_RDWR | O_TRUNC, 0644))
        {
            // Create file
            if (fd < 0) {
                throw std::runtime_error("Failed to create backing file: " + filename);
            }

            // Set file size
            if (ftruncate(fd, static_cast<off_t>(file_size)) != 0) {
                throw std::runtime_error("Failed to set file size");
            }

            // Memory map the file
            void* addr = mmap(nullptr, file_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
            if (addr == MAP_FAILED) {
                throw std::runtime_error("Failed to mmap file");
            }

            memory = static_cast<T*>(addr);
            info("JONATHAN ", this, memory, filename);
        }

        MemoryResource(const MemoryResource&) = delete;            // delete copy constructor
        MemoryResource& operator=(const MemoryResource&) = delete; // delete copy assignment

        MemoryResource(MemoryResource&& other) = delete;
        MemoryResource& operator=(const MemoryResource&&) = delete; // delete move assignment

        ~MemoryResource()
        {
            std::cout << "JONATHAN ~MemoryResource " << this << std::endl;
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

        const T* data() const { return memory; }
        T* data() { return memory; }

      private:
        size_t file_size;
        std::string filename;
        int fd;
        T* memory;
    };

    FileBackedSharedShiftedVirtualZeroesArray() = default;

    FileBackedSharedShiftedVirtualZeroesArray(size_t start,
                                              size_t end,
                                              size_t virtual_size,
                                              // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
                                              std::shared_ptr<MemoryResource> backing_memory)
        : start_(start)
        , end_(end)
        , virtual_size_(virtual_size)
        , backing_memory_(backing_memory)
    {}

    FileBackedSharedShiftedVirtualZeroesArray(size_t size, size_t virtual_size, size_t start_index)
        : start_(start_index)
        , end_(size + start_index)
        , virtual_size_(virtual_size)
        , backing_memory_(allocate_file_backing(size))
    {}

    /**
     * @brief Sets the value at the specified index.
     *
     * @param index The index at which the value should be set.
     * @param value The value to set.
     * @throws Fails in assert mode if the index is not within the memory-backed range [start_, end_).
     */
    void set(size_t index, const T& value)
    {
        BB_ASSERT_GTE(index, start_);
        BB_ASSERT_LT(index, end_);
        data()[index - start_] = value;
    }

    /**
     * @brief Retrieves the value at the specified index, or 'zero'. Optimizes for e.g. 256-bit fields
     * by storing a static 0 value, allowing usage of a const reference.
     *
     * @param index The index from which to retrieve the value.
     * @param virtual_padding For the rare case where we explicitly want the 0-returning behavior beyond our usual
     * virtual_size.
     * @return The value at the specified index, or a default value (e.g. a field zero) of T if the index is outside the
     * memory-backed range.
     * @throws Fails in assert mode if the index is greater than or equal to `virtual_size_`.
     */
    const T& get(size_t index, size_t virtual_padding = 0) const
    {
        static const T zero{};
        if (index >= virtual_size_ + virtual_padding) {
            info("BAD GET(): index = ",
                 index,
                 ", virtual_size_ = ",
                 virtual_size_,
                 ", virtual_padding = ",
                 virtual_padding);
        }
        BB_ASSERT_LT(index, virtual_size_ + virtual_padding);
        if (index >= start_ && index < end_) {
            return data()[index - start_];
        }
        return zero; // Return default element when index is out of the actual filled size
    }

    /**
     * @brief Returns a pointer to the underlying memory array.
     * NOTE: This should be used with care, as index 0 corresponds to virtual index `start_`.
     *
     * @return A pointer to the beginning of the memory-backed range.
     */
    T* data() { return backing_memory_->data(); }
    const T* data() const { return backing_memory_->data(); }
    // Our size is end_ - start_. Note that we need to offset end_ when doing a shift to
    // correctly maintain the size.
    size_t size() const { return end_ - start_; }
    // Getter for consistency with size();
    size_t virtual_size() const { return virtual_size_; }

    void increase_virtual_size(const size_t new_virtual_size)
    {
        BB_ASSERT_GTE(new_virtual_size, virtual_size_); // shrinking is not allowed
        virtual_size_ = new_virtual_size;
    }

    T& operator[](size_t index)
    {
        BB_ASSERT_GTE(index, start_);
        BB_ASSERT_LT(index, end_);
        return data()[index - start_];
    }
    // get() is more useful, but for completeness with the non-const operator[]
    const T& operator[](size_t index) const
    {
        BB_ASSERT_GTE(index, start_);
        BB_ASSERT_LT(index, end_);
        return data()[index - start_];
    }

    FileBackedSharedShiftedVirtualZeroesArray clone(size_t right_expansion = 0, size_t left_expansion = 0) const
    {
        // std::cout << "JONATHAN: clone " << right_expansion << ' ' << left_expansion << std::endl;
        size_t expanded_size = size() + right_expansion + left_expansion;
        // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
        std::shared_ptr<MemoryResource> backing_clone = allocate_file_backing(expanded_size);
        // zero any left extensions to the array
        memset(static_cast<void*>(backing_clone->data()), 0, sizeof(T) * left_expansion);
        // copy our cloned array over
        memcpy(static_cast<void*>(backing_clone->data() + left_expansion),
               static_cast<const void*>(backing_memory_->data()),
               sizeof(T) * size());
        // zero any right extensions to the array
        memset(static_cast<void*>(backing_clone->data() + left_expansion + size()), 0, sizeof(T) * right_expansion);
        return FileBackedSharedShiftedVirtualZeroesArray(
            start_ - left_expansion, end_ + right_expansion, virtual_size_, backing_clone);
    }

    static std::shared_ptr<MemoryResource> allocate_file_backing(size_t size)
    {
        // Generate unique filename
        static std::atomic<size_t> file_counter{ 0 };
        size_t id = file_counter.fetch_add(1);
        std::string filename = "/tmp/poly-mmap-" + std::to_string(id);
        // std::cout << "JONATHAN: allocate_file_backing " << filename << std::endl;

        // Create file-backed memory using the shared memory manager
        return std::make_shared<MemoryResource>(size, filename);
    }

    // MEMBERS:
    /**
     * @brief The starting index of the memory-backed range.
     *
     * Represents the first index in the array that is backed by actual memory.
     * This is used to represent polynomial shifts by representing the unshfited polynomials
     * with index >= 1 and reducing this by one to divide by x / left shift one.
     * Historically, we used memory padding to represent shifts. This is currently implied by start_ (before which we
     * consider all values 0).
     */
    size_t start_ = 0;

    /**
     * @brief The ending index of the memory-backed range.
     *
     * Represents the first index after `start_` that is not backed by actual memory. Note however that
     * the backed memory might extend beyond end_ index but will not be accessed anymore. Namely, any
     * access after after end_ returns zero. (Happens after Polynomial::shrink_end_index() call).
     */
    size_t end_ = 0;

    /**
     * @brief The total logical size of the array.
     *
     * This is the size of the array as it would appear to a user, including both the memory-backed
     * range and the conceptual zero-filled range beyond `end_` and before `start_` (if a positive value).
     */
    size_t virtual_size_ = 0;

    /**
     * @brief Shared pointer to the underlying memory array.
     *
     * The memory is allocated for at least the range [start_, end_). It is shared across instances to allow
     * for efficient memory use when arrays are shifted or otherwise manipulated.
     */
    std::shared_ptr<MemoryResource> backing_memory_;
};
} // namespace bb
