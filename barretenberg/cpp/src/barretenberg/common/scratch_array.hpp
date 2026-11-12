#pragma once

#include "barretenberg/common/experimental_optimizations.hpp"
#include "barretenberg/common/release_pages.hpp"
#include <cstddef>
#include <memory>
#include <span>
#include <type_traits>
#include <utility>
#include <vector>

namespace bb {

/**
 * @brief Fixed-size heap array with optional uninitialised storage for buffers that are filled in parallel.
 *
 * @details std::vector<T>(n) value-initialises: one thread zero-fills every byte, and so takes every page fault of a
 * fresh mapping, before parallel code overwrites it. With rollup optimizations enabled, no element is written until
 * the caller writes it, so the
 * first touch of each page happens wherever the caller's parallel fill runs. Every element must be written before it
 * is read. The pages are released from several threads when the array is freed (see release_pages_in_parallel).
 */
template <typename T> class ScratchArray {
    static_assert(std::is_trivially_default_constructible_v<T> && std::is_trivially_destructible_v<T>);

  public:
    ScratchArray() = default;
    explicit ScratchArray(size_t size)
        : data_(experimental_ && size != 0 ? new T[size] : nullptr)
        , size_(size)
    {
        if (!experimental_) {
            baseline_.resize(size);
        }
    }
    ScratchArray(const ScratchArray&) = delete;
    ScratchArray& operator=(const ScratchArray&) = delete;
    ScratchArray(ScratchArray&& other) noexcept
        : experimental_(other.experimental_)
        , baseline_(std::move(other.baseline_))
        , data_(std::move(other.data_))
        , size_(std::exchange(other.size_, 0))
    {}
    ScratchArray& operator=(ScratchArray&& other) noexcept
    {
        if (this != &other) {
            release();
            experimental_ = other.experimental_;
            baseline_ = std::move(other.baseline_);
            data_ = std::move(other.data_);
            size_ = std::exchange(other.size_, 0);
        }
        return *this;
    }
    ~ScratchArray() { release(); }

    T* data() noexcept { return experimental_ ? data_.get() : baseline_.data(); }
    const T* data() const noexcept { return experimental_ ? data_.get() : baseline_.data(); }
    size_t size() const noexcept { return size_; }
    T& operator[](size_t i) noexcept { return data()[i]; }
    const T& operator[](size_t i) const noexcept { return data()[i]; }
    std::span<T> span() noexcept { return { data(), size_ }; }
    std::span<const T> span() const noexcept { return { data(), size_ }; }

    /** Replace the buffer with a new fixed-size allocation. */
    void reset(size_t size) { *this = ScratchArray(size); }
    T* begin() noexcept { return data(); }
    const T* begin() const noexcept { return data(); }
    T* end() noexcept { return data() + size_; }
    const T* end() const noexcept { return data() + size_; }

  private:
    void release() noexcept
    {
        if (experimental_) {
            release_pages_in_parallel(data_.get(), size_ * sizeof(T));
        }
        data_.reset();
        size_ = 0;
    }

    bool experimental_ = rollup_experimental_optimizations_enabled();
    std::vector<T> baseline_;
    std::unique_ptr<T[]> data_;
    size_t size_ = 0;
};

} // namespace bb
