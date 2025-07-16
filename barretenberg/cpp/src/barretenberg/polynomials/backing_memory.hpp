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
#ifndef _WASI_EMULATED_PROCESS_CLOCKS
#include <sys/mman.h>
#endif

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern bool slow_low_memory;

template <typename T> class AlignedMemory;

#ifndef _WASI_EMULATED_PROCESS_CLOCKS
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
#ifndef _WASI_EMULATED_PROCESS_CLOCKS
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

#ifndef _WASI_EMULATED_PROCESS_CLOCKS
template <typename T> class FileBackedMemory : public BackingMemory<T> {
  public:
    FileBackedMemory(const FileBackedMemory&) = delete;            // delete copy constructor
    FileBackedMemory& operator=(const FileBackedMemory&) = delete; // delete copy assignment

    FileBackedMemory(FileBackedMemory&& other) = delete;            // delete move constructor
    FileBackedMemory& operator=(const FileBackedMemory&&) = delete; // delete move assignment

    T* raw_data() { return memory; }

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
        : BackingMemory<T>()
        , file_size(size * sizeof(T))
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
            throw_or_abort("Failed to create backing file: " + filename);
        }

        // Set file size
        if (ftruncate(fd, static_cast<off_t>(file_size)) != 0) {
            throw_or_abort("Failed to set file size");
        }

        // Memory map the file
        void* addr = mmap(nullptr, file_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
        if (addr == MAP_FAILED) {
            throw_or_abort("Failed to mmap file: " + std::string(std::strerror(errno)));
        }

        memory = static_cast<T*>(addr);
    }

    size_t file_size;
    std::string filename;
    int fd;
    T* memory;

    friend BackingMemory<T>;
};
#endif // __EMSCRIPTEN___
