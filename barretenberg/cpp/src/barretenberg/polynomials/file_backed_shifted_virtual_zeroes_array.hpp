#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/log.hpp"
#include "file_backed_shared_memory.hpp"
#include <cstddef>
#include <memory>
#include <atomic>
#include <string>
#include <fcntl.h>
#include <sys/mman.h>
#include <unistd.h>
#include <filesystem>

namespace bb {

/**
 * @brief A file-backed array template that represents a virtual array filled with zeros up to `virtual_size_`,
 * but with actual memory usage proportional to the region between `start_` and `end_`.
 * 
 * This is a file-backed version of SharedShiftedVirtualZeroesArray that uses mmap instead of heap allocation.
 * It maintains the same semantics but stores data in a memory-mapped file.
 *
 * @tparam T The type of the elements in the array.
 */
template <typename T> 
class FileBackedShiftedVirtualZeroesArray {
  public:
    /**
     * @brief Default constructor creates an empty array
     */
    FileBackedShiftedVirtualZeroesArray() = default;

    /**
     * @brief Construct array with given parameters and create backing file
     */
    FileBackedShiftedVirtualZeroesArray(size_t start, size_t end, size_t virtual_size)
        : start_(start)
        , end_(end)
        , virtual_size_(virtual_size)
    {
        if (end > start) {
            allocate_file_backing(end - start);
        }
    }

    /**
     * @brief Destructor - cleanup is handled by shared_ptr
     */
    ~FileBackedShiftedVirtualZeroesArray() = default;

    // Delete copy constructor and assignment
    FileBackedShiftedVirtualZeroesArray(const FileBackedShiftedVirtualZeroesArray&) = delete;
    FileBackedShiftedVirtualZeroesArray& operator=(const FileBackedShiftedVirtualZeroesArray&) = delete;

    // Move constructor
    FileBackedShiftedVirtualZeroesArray(FileBackedShiftedVirtualZeroesArray&& other) noexcept
        : start_(other.start_)
        , end_(other.end_)
        , virtual_size_(other.virtual_size_)
        , memory_(std::move(other.memory_))
    {
        other.start_ = 0;
        other.end_ = 0;
        other.virtual_size_ = 0;
    }

    // Move assignment
    FileBackedShiftedVirtualZeroesArray& operator=(FileBackedShiftedVirtualZeroesArray&& other) noexcept {
        if (this != &other) {
            start_ = other.start_;
            end_ = other.end_;
            virtual_size_ = other.virtual_size_;
            memory_ = std::move(other.memory_);
            
            other.start_ = 0;
            other.end_ = 0;
            other.virtual_size_ = 0;
        }
        return *this;
    }

    /**
     * @brief Sets the value at the specified index.
     */
    void set(size_t index, const T& value) {
        BB_ASSERT_GTE(index, start_);
        BB_ASSERT_LT(index, end_);
        data()[index - start_] = value;
    }

    /**
     * @brief Retrieves the value at the specified index, or 'zero'.
     */
    const T& get(size_t index, size_t virtual_padding = 0) const {
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
        return zero;
    }

    /**
     * @brief Returns a pointer to the underlying memory array.
     */
    T* data() { return memory_ ? memory_->data : nullptr; }
    const T* data() const { return memory_ ? memory_->data : nullptr; }

    size_t size() const { return end_ - start_; }
    size_t virtual_size() const { return virtual_size_; }

    void increase_virtual_size(const size_t new_virtual_size) {
        BB_ASSERT_GTE(new_virtual_size, virtual_size_);
        virtual_size_ = new_virtual_size;
    }

    T& operator[](size_t index) {
        BB_ASSERT_GTE(index, start_);
        BB_ASSERT_LT(index, end_);
        if (!memory_ || memory_->data == nullptr) {
            throw std::runtime_error("Attempting to access unmapped file-backed array at index " + std::to_string(index));
        }
        return data()[index - start_];
    }

    const T& operator[](size_t index) const {
        BB_ASSERT_GTE(index, start_);
        BB_ASSERT_LT(index, end_);
        if (!memory_ || memory_->data == nullptr) {
            throw std::runtime_error("Attempting to access unmapped file-backed array at index " + std::to_string(index));
        }
        return data()[index - start_];
    }

    /**
     * @brief Create a shallow copy that shares the same file backing
     * This is used to implement Polynomial::share()
     */
    FileBackedShiftedVirtualZeroesArray share() const {
        if (!memory_ && size() > 0) {
            throw std::runtime_error("Cannot share unmapped file-backed array");
        }
        FileBackedShiftedVirtualZeroesArray result;
        result.start_ = start_;
        result.end_ = end_;
        result.virtual_size_ = virtual_size_;
        result.memory_ = memory_;  // Share the same memory resource
        return result;
    }

    /**
     * @brief Check if this array has a backing memory resource
     */
    bool has_memory() const { return memory_ != nullptr; }

    // Public members to match SharedShiftedVirtualZeroesArray interface
    size_t start_ = 0;
    size_t end_ = 0;
    size_t virtual_size_ = 0;

  private:
    void allocate_file_backing(size_t size) {
        // Generate unique filename
        static std::atomic<size_t> file_counter{0};
        size_t id = file_counter.fetch_add(1);
        std::string filename = "/tmp/poly-mmap-" + std::to_string(id);
        
        // Create file-backed memory using the shared memory manager
        memory_ = FileBackedSharedMemory<T>::create(size, filename);
    }

    // Shared pointer to memory resource - automatically handles cleanup
    std::shared_ptr<typename FileBackedSharedMemory<T>::MemoryResource> memory_;
};

} // namespace bb