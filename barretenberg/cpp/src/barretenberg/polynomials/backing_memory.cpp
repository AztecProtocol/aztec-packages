#include "barretenberg/polynomials/backing_memory.hpp"
#include "barretenberg/common/low_memory.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <atomic>
#include <cerrno>
#include <cstdlib>
#include <cstring>
#include <limits>
#include <string>
#if !defined(__wasm__) && !defined(_WIN32)
#include <fcntl.h>
#include <filesystem>
#include <sys/mman.h>
#include <unistd.h>
#endif

#if !defined(__wasm__) || defined(ENABLE_WASM_BENCH)

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
std::atomic<size_t> current_storage_usage{ 0 };

#endif // !defined(__wasm__) || defined(ENABLE_WASM_BENCH)

#if !defined(__wasm__) && !defined(_WIN32)
namespace bb::detail {
/**
 * @details In low memory mode polynomial coefficients, witness polynomials included, are written to files in the
 * storage directory chosen by low_memory::configure (by default TMPDIR, or the system temp directory). Because the
 * mapping is shared, the kernel writes dirty pages back to those files under memory pressure, so witness data reaches
 * the filesystem rather than only anonymous memory or swap. Each file is created with mode 0600 and unlinked as soon as
 * it is opened, so no name refers to it and it disappears when the mapping goes, but its blocks are not wiped and may
 * stay on the device until they are reused. Where that matters, choose a storage directory on an encrypted or ephemeral
 * filesystem.
 *
 * The file's blocks are reserved with posix_fallocate, so a full disk fails the allocation instead of raising SIGBUS
 * on a later write. On filesystems without native fallocate support glibc emulates it by writing every block, which
 * makes allocating a large polynomial correspondingly slow.
 *
 * Once configure has checked that the directory can hold mapped files, a heap fallback would silently break the memory
 * bound low memory mode was requested for, so every failure here (budget, full disk) aborts.
 */
std::shared_ptr<void> allocate_file_backed(size_t count, size_t element_size)
{
    if (count == 0) {
        return nullptr;
    }
    const auto storage_directory = bb::low_memory::polynomial_storage_directory();
    if (!storage_directory) {
        return nullptr;
    }
    if (count > std::numeric_limits<size_t>::max() / element_size) {
        throw_or_abort("slow_low_memory: polynomial of " + std::to_string(count) + " elements overflows size_t");
    }
    const size_t file_size = count * element_size;

    // Check and update storage usage to enforce budget
    const size_t storage_budget = bb::low_memory::storage_budget();
    size_t current_usage = current_storage_usage.load();
    while (true) {
        if (current_usage + file_size > storage_budget) {
            throw_or_abort("slow_low_memory: allocating " + std::to_string(file_size) +
                           " bytes would exceed the storage budget (" + std::to_string(current_usage) + " of " +
                           std::to_string(storage_budget) + " bytes in use)");
        }
        if (current_storage_usage.compare_exchange_weak(current_usage, current_usage + file_size)) {
            break;
        }
    }
    // Returned to the budget on every failure below; once mapped, the mapping's owner returns it instead.
    struct Reservation {
        size_t bytes;
        bool handed_over = false;
        ~Reservation()
        {
            if (!handed_over) {
                current_storage_usage.fetch_sub(bytes);
            }
        }
    } reservation{ file_size };

    static std::atomic<size_t> file_counter{ 0 };
    size_t id = file_counter.fetch_add(1);

    std::string filename = std::filesystem::path(*storage_directory) /
                           ("poly-mmap-" + std::to_string(getpid()) + "-" + std::to_string(id));

    auto fail = [&](const std::string& step, int error) {
        throw_or_abort("slow_low_memory: " + step + " failed for " + std::to_string(file_size) + "-byte file " +
                       filename + ": " + std::strerror(error));
    };

    // Closed on every path. The mapping holds its own reference to the file, so the descriptor is not needed once it
    // exists; keeping one per polynomial would hit RLIMIT_NOFILE on large proofs.
    struct Descriptor {
        int fd;
        ~Descriptor()
        {
            if (fd >= 0) {
                close(fd);
            }
        }
    } descriptor{ open(filename.c_str(), O_CREAT | O_RDWR | O_TRUNC | O_EXCL, 0600) };
    if (descriptor.fd < 0) {
        fail("open", errno);
    }
    // The open fd, and after it the mapping, keep the file alive; unlinking now means a crash cannot
    // leave witness data behind in the temp directory.
    if (unlink(filename.c_str()) != 0) {
        fail("unlink", errno);
    }

    // Reserve the blocks up front: with a shared mapping, a write into a hole on a full disk raises
    // SIGBUS instead of failing here. Apple has no posix_fallocate and keeps that exposure.
#if defined(__APPLE__)
    if (ftruncate(descriptor.fd, static_cast<off_t>(file_size)) != 0) {
        fail("ftruncate", errno);
    }
#else
    if (int error = posix_fallocate(descriptor.fd, 0, static_cast<off_t>(file_size)); error != 0) {
        fail("posix_fallocate", error);
    }
#endif

    // Shared, so dirty pages are file pages the kernel can write back and reclaim; a private mapping
    // would turn every written page into an anonymous copy-on-write page.
    void* addr = mmap(nullptr, file_size, PROT_READ | PROT_WRITE, MAP_SHARED, descriptor.fd, 0);
    if (addr == MAP_FAILED) {
        fail("mmap", errno);
    }
    // If constructing the owner throws, it still runs the deleter, which returns the reservation.
    reservation.handed_over = true;
    return std::shared_ptr<void>(addr, [file_size](void* mapping) {
        munmap(mapping, file_size);
        current_storage_usage.fetch_sub(file_size);
    });
}
} // namespace bb::detail
#endif
