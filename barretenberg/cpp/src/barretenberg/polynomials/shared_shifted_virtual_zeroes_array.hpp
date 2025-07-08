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
#include <bits/types/FILE.h>
#include <cstddef>
#include <fcntl.h>
#include <filesystem>
#include <memory>
#include <string>
#include <sys/mman.h>
#include <unistd.h>

template <typename T> struct FileBackedMemory {

    using Value = FileBackedMemory;

    static std::string generate_unique_filename() {}

    static std::shared_ptr<Value> allocate(size_t size) { return std::shared_ptr<Value>(new FileBackedMemory(size)); }

    FileBackedMemory(const FileBackedMemory&) = delete;            // delete copy constructor
    FileBackedMemory& operator=(const FileBackedMemory&) = delete; // delete copy assignment

    FileBackedMemory(FileBackedMemory&& other) = delete;            // delete move constructor
    FileBackedMemory& operator=(const FileBackedMemory&&) = delete; // delete move assignment

    static T* get_data(const std::shared_ptr<Value> backing_memory) { return backing_memory->memory; }

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
        : file_size(size * sizeof(T))
    {
        if (file_size == 0) {
            return;
        }

        static std::atomic<size_t> file_counter{ 0 };
        size_t id = file_counter.fetch_add(1);
        filename = "/tmp/poly-mmap-" + std::to_string(id);

        fd = open(filename.c_str(), O_CREAT | O_RDWR | O_TRUNC, 0644);
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
    }

    size_t file_size;
    std::string filename;
    int fd;
    T* memory;
};

template <typename T> struct AlignedMemory {

    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    using Value = T[];

    static std::shared_ptr<Value> allocate(size_t size)
    {
        return std::static_pointer_cast<Value>(bb::get_mem_slab(sizeof(T) * size));
    }

    static T* get_data(const std::shared_ptr<Value>& backing_memory) { return backing_memory.get(); }
};

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
template <typename T, typename BackingMemory> struct SharedShiftedVirtualZeroesArray {

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
    T* data() { return BackingMemory::get_data(backing_memory_); }
    const T* data() const { return BackingMemory::get_data(backing_memory_); }
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
    std::shared_ptr<typename BackingMemory::Value> backing_memory_;
};
