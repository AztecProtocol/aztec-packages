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
#include "barretenberg/common/file_backed_allocator.hpp"
#include <sys/mman.h>
#endif

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern bool slow_low_memory;

template <typename T> class AlignedMemory;

#ifndef __wasm__
template <typename T> class FileBackedMemory;
#endif

template <typename Fr> class BackingMemory {
  public:
    BackingMemory() = default;

    BackingMemory(const BackingMemory&) = delete;            // delete copy constructor
    BackingMemory& operator=(const BackingMemory&) = delete; // delete copy assignment

    BackingMemory(BackingMemory&& other) = delete;            // delete move constructor
    BackingMemory& operator=(const BackingMemory&&) = delete; // delete move assignment

    virtual Fr* raw_data() = 0;

    static std::shared_ptr<BackingMemory<Fr>> allocate(size_t size)
    {
#ifndef __wasm__
        if (slow_low_memory) {
            return std::shared_ptr<BackingMemory<Fr>>(new FileBackedMemory<Fr>(size));
        }
#endif
        return std::shared_ptr<BackingMemory<Fr>>(new AlignedMemory<Fr>(size));
    }

    virtual ~BackingMemory() = default;
};

template <typename T> class AlignedMemory : public BackingMemory<T> {
  public:
    T* raw_data() { return data.get(); }

  private:
    AlignedMemory(size_t size)
        : BackingMemory<T>()
        // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
        , data(std::static_pointer_cast<T[]>(std::move(bb::get_mem_slab(sizeof(T) * size))))
    {}

    // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
    std::shared_ptr<T[]> data;

    friend BackingMemory<T>;
};

#ifndef __wasm__
template <typename T> class FileBackedMemory : public BackingMemory<T> {
  public:
    FileBackedMemory(const FileBackedMemory&) = delete;            // delete copy constructor
    FileBackedMemory& operator=(const FileBackedMemory&) = delete; // delete copy assignment

    FileBackedMemory(FileBackedMemory&& other) = delete;            // delete move constructor
    FileBackedMemory& operator=(const FileBackedMemory&&) = delete; // delete move assignment

    ~FileBackedMemory() = default;

    T* raw_data() { return static_cast<T*>(allocation.ptr); }

  private:
    bb::FileBackedAllocation allocation;

    // Create a new file-backed memory region
    FileBackedMemory(size_t size)
        : BackingMemory<T>()
        , allocation(size * sizeof(T), "poly-mmap-")
    {}

    friend BackingMemory<T>;
};
#endif // __EMSCRIPTEN___
