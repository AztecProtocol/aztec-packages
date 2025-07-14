// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/throw_or_abort.hpp"
#include <atomic>
#include <cstring>
#include <fcntl.h>
#include <filesystem>
#include <memory>
#include <sys/mman.h>

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
};
