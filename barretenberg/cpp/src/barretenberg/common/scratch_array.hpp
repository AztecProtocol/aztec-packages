#pragma once

#include "barretenberg/common/release_pages.hpp"
#include <cstddef>
#include <memory>
#include <span>
#include <type_traits>
#include <utility>

namespace bb {

/**
 * @brief Fixed-size heap array whose elements start uninitialised, for large buffers that are filled in parallel.
 *
 * @details std::vector<T>(n) value-initialises: one thread zero-fills every byte, and so takes every page fault of a
 * fresh mapping, before parallel code overwrites it. Here no element is written until the caller writes it, so the
 * first touch of each page happens wherever the caller's parallel fill runs. Every element must be written before it
 * is read. The pages are released from several threads when the array is freed (see release_pages_in_parallel).
 */
template <typename T> class ScratchArray {
    static_assert(std::is_trivially_default_constructible_v<T> && std::is_trivially_destructible_v<T>);

  public:
    ScratchArray() = default;
    explicit ScratchArray(size_t size)
        : data_(size == 0 ? nullptr : new T[size])
        , size_(size)
    {}
    ScratchArray(const ScratchArray&) = delete;
    ScratchArray& operator=(const ScratchArray&) = delete;
    ScratchArray(ScratchArray&& other) noexcept
        : data_(std::move(other.data_))
        , size_(std::exchange(other.size_, 0))
    {}
    ScratchArray& operator=(ScratchArray&& other) noexcept
    {
        if (this != &other) {
            release();
            data_ = std::move(other.data_);
            size_ = std::exchange(other.size_, 0);
        }
        return *this;
    }
    ~ScratchArray() { release(); }

    T* data() noexcept { return data_.get(); }
    const T* data() const noexcept { return data_.get(); }
    size_t size() const noexcept { return size_; }
    T& operator[](size_t i) noexcept { return data_[i]; }
    const T& operator[](size_t i) const noexcept { return data_[i]; }
    std::span<T> span() noexcept { return { data_.get(), size_ }; }
    std::span<const T> span() const noexcept { return { data_.get(), size_ }; }

  private:
    void release() noexcept
    {
        release_pages_in_parallel(data_.get(), size_ * sizeof(T));
        data_.reset();
        size_ = 0;
    }

    std::unique_ptr<T[]> data_;
    size_t size_ = 0;
};

} // namespace bb
