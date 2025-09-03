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
            auto file_backed = try_allocate_file_backed(size);
            if (file_backed) {
                return file_backed;
            }
        }
#endif
        return std::shared_ptr<BackingMemory<Fr>>(new AlignedMemory<Fr>(size));
    }

  private:
#ifndef __wasm__
    static std::shared_ptr<BackingMemory<Fr>> try_allocate_file_backed(size_t size)
    {
        size_t required_bytes = size * sizeof(Fr);
        size_t current_usage = current_storage_usage.load();

        // Check if we're under the storage budget
        if (current_usage + required_bytes > storage_budget) {
            return nullptr; // Over budget
        }

        // Attempt to create FileBackedMemory without exceptions
        // We'll need to modify FileBackedMemory constructor to be noexcept
        auto file_backed = FileBackedMemory<Fr>::try_create(size);
        if (file_backed) {
            current_storage_usage.fetch_add(required_bytes);
        }
        return file_backed;
    }
#endif

  public:
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

    T* raw_data() { return memory; }

    // Try to create file-backed memory, returns nullptr on failure
    static std::shared_ptr<BackingMemory<T>> try_create(size_t size)
    {
        if (size == 0) {
            return std::shared_ptr<BackingMemory<T>>(new FileBackedMemory<T>());
        }

        size_t file_size = size * sizeof(T);
        static std::atomic<size_t> file_counter{ 0 };
        size_t id = file_counter.fetch_add(1);

        std::filesystem::path temp_dir;
        try {
            temp_dir = std::filesystem::temp_directory_path();
        } catch (const std::exception&) {
            // Fallback to current directory if temp_directory_path() fails
            temp_dir = std::filesystem::current_path();
        }

        std::string filename = temp_dir / ("poly-mmap-" + std::to_string(getpid()) + "-" + std::to_string(id));

        int fd = open(filename.c_str(), O_CREAT | O_RDWR | O_TRUNC, 0644);
        if (fd < 0) {
            return nullptr; // Failed to create file
        }

        // Set file size
        if (ftruncate(fd, static_cast<off_t>(file_size)) != 0) {
            close(fd);
            std::filesystem::remove(filename);
            return nullptr; // Failed to set file size
        }

        // Memory map the file
        void* addr = mmap(nullptr, file_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
        if (addr == MAP_FAILED) {
            close(fd);
            std::filesystem::remove(filename);
            return nullptr; // Failed to mmap
        }

        // Create the FileBackedMemory object using private constructor
        auto memory = new FileBackedMemory<T>();
        memory->file_size = file_size;
        memory->filename = filename;
        memory->fd = fd;
        memory->memory = static_cast<T*>(addr);

        return std::shared_ptr<BackingMemory<T>>(memory);
    }

    ~FileBackedMemory()
    {
        if (file_size == 0) {
            return;
        }
        if (memory != nullptr && file_size > 0) {
            munmap(memory, file_size);
            // Decrement storage usage when FileBackedMemory is freed
            current_storage_usage.fetch_sub(file_size);
        }
        if (fd >= 0) {
            close(fd);
        }
        if (!filename.empty()) {
            std::filesystem::remove(filename);
        }
    }

  private:
    // Default constructor for empty file-backed memory
    FileBackedMemory()
        : BackingMemory<T>()
        , file_size(0)
        , fd(-1)
        , memory(nullptr)
    {}

    size_t file_size;
    std::string filename;
    int fd;
    T* memory;

    friend BackingMemory<T>;
};
#endif // __EMSCRIPTEN___
