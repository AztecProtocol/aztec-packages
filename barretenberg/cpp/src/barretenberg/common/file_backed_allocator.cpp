#include "barretenberg/common/file_backed_allocator.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <atomic>
#include <cstring>
#include <fcntl.h>
#include <filesystem>
#include <sys/mman.h>

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
bool slow_low_memory =
    std::getenv("BB_SLOW_LOW_MEMORY") == nullptr ? false : std::string(std::getenv("BB_SLOW_LOW_MEMORY")) == "1";

namespace bb {

FileBackedAllocation::FileBackedAllocation(std::size_t size_bytes, const std::string& filename_prefix)
    : size_bytes(size_bytes)
{
    if (size_bytes == 0) {
        return;
    }

    static std::atomic<size_t> file_counter{ 0 };
    size_t id = file_counter.fetch_add(1);
    std::filesystem::path temp_dir;
    try {
        temp_dir = std::filesystem::temp_directory_path();
    } catch (const std::exception&) {
        // Fallback to current directory if temp_directory_path() fails
        temp_dir = std::filesystem::current_path();
    }

    filename = temp_dir / (filename_prefix + std::to_string(getpid()) + "-" + std::to_string(id));

    fd = open(filename.c_str(), O_CREAT | O_RDWR | O_TRUNC, 0644);
    // Create file
    if (fd < 0) {
        throw_or_abort("Failed to create backing file: " + filename);
    }

    // Set file size
    if (ftruncate(fd, static_cast<off_t>(size_bytes)) != 0) {
        throw_or_abort("Failed to set file size");
    }

    // Memory map the file
    ptr = mmap(nullptr, size_bytes, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    if (ptr == MAP_FAILED) {
        throw_or_abort("Failed to mmap file: " + std::string(std::strerror(errno)));
    }
}

FileBackedAllocation& FileBackedAllocation::operator=(FileBackedAllocation&& other) noexcept
{
    std::swap(ptr, other.ptr);
    std::swap(fd, other.fd);
    filename = std::move(other.filename);
    std::swap(size_bytes, other.size_bytes);
    return *this;
}

FileBackedAllocation::~FileBackedAllocation() noexcept
{
    if (size_bytes == 0) {
        return;
    }
    munmap(ptr, size_bytes);
    close(fd);
    std::filesystem::remove(filename);
}

} // namespace bb
