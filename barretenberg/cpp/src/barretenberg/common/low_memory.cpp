#include "barretenberg/common/low_memory.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/ecc/scalar_multiplication/msm_batch_mem_budget.hpp"
#include <atomic>
#include <cctype>
#include <cerrno>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <limits>
#include <string>
#if defined(__GLIBC__)
#include "barretenberg/common/log.hpp"
#include <dlfcn.h>
#include <gnu/libc-version.h>
#include <malloc.h>
#elif defined(__APPLE__)
#include <TargetConditionals.h>
#if TARGET_OS_IPHONE
#include <os/proc.h>
#endif
#endif
#ifndef NO_MULTITHREADING
#include <mutex>
#endif
#if !defined(__wasm__) && !defined(_WIN32)
#include <fcntl.h>
#include <sys/mman.h>
#include <unistd.h>
#endif
#if defined(__linux__)
#include <linux/magic.h>
#include <sys/vfs.h>
#endif

namespace bb::low_memory {
namespace {

// NOLINTBEGIN(cppcoreguidelines-avoid-non-const-global-variables)
std::atomic<bool> mode_enabled{ false };
std::atomic<size_t> budget_bytes{ std::numeric_limits<size_t>::max() };
// Whether storage_directory holds a checked directory; read first so that heap allocation takes no lock.
std::atomic<bool> file_backing{ false };
// Set by configure() only; read under the same mutex.
std::optional<std::string> storage_directory;
#ifndef NO_MULTITHREADING
std::mutex configure_mutex;
#endif
// NOLINTEND(cppcoreguidelines-avoid-non-const-global-variables)

#if defined(__GLIBC__)
/**
 * @brief Whether malloc is glibc's own. An allocator preloaded or linked in front of it (tcmalloc, jemalloc, mimalloc)
 * interposes malloc; mallopt and malloc_trim then tune glibc's arenas, which hold none of the process's memory, and the
 * assumptions about glibc's thresholds below do not hold. Sanitizer runtimes (ASan, TSan, MSan) interpose malloc too
 * and count as foreign. Logs once when malloc is not glibc's.
 */
bool malloc_is_glibc()
{
    static const bool is_glibc = [] {
        Dl_info malloc_info{};
        Dl_info libc_info{};
        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast)
        const bool resolved = dladdr(reinterpret_cast<void*>(&malloc), &malloc_info) != 0 &&
                              // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast)
                              dladdr(reinterpret_cast<void*>(&gnu_get_libc_version), &libc_info) != 0;
        const bool same_object = resolved && malloc_info.dli_fbase == libc_info.dli_fbase;
        if (!same_object) {
            info("low memory mode: malloc does not come from glibc (",
                 resolved && malloc_info.dli_fname != nullptr ? malloc_info.dli_fname : "unknown",
                 "); leaving the heap untuned");
        }
        return same_object;
    }();
    return is_glibc;
}
#endif

#if !defined(__wasm__) && !defined(_WIN32)
/**
 * @brief The directory polynomial files will go in, if a file can be created, unlinked and mapped there; otherwise
 * nullopt, after one info line saying why. Polynomials then stay on the heap: a missing or read-only directory is a
 * setup problem, which should not stop a proof that may fit in memory anyway. A directory on tmpfs counts as unusable,
 * since files there are memory.
 */
std::optional<std::string> probe_storage_directory(const std::optional<std::string>& requested)
{
    std::filesystem::path directory;
    if (requested) {
        directory = *requested;
    } else {
        std::error_code error;
        directory = std::filesystem::temp_directory_path(error);
        if (error) {
            info("low memory mode: no temp directory (", error.message(), "); polynomials stay on the heap");
            return std::nullopt;
        }
    }
#if defined(__linux__)
    struct statfs filesystem{};
    if (statfs(directory.c_str(), &filesystem) == 0 && filesystem.f_type == TMPFS_MAGIC) {
        info("low memory mode: ",
             directory.string(),
             " is on tmpfs, whose files are memory; polynomials stay on the heap. Pass a storage directory on a disk "
             "filesystem, or set TMPDIR to one.");
        return std::nullopt;
    }
#endif
    const std::string probe = (directory / ("poly-mmap-probe-" + std::to_string(getpid()))).string();
    const auto page_size = static_cast<size_t>(sysconf(_SC_PAGESIZE));
    const int fd = open(probe.c_str(), O_CREAT | O_RDWR | O_TRUNC | O_EXCL, 0600);
    void* mapping = fd >= 0 && unlink(probe.c_str()) == 0 && ftruncate(fd, static_cast<off_t>(page_size)) == 0
                        ? mmap(nullptr, page_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0)
                        : MAP_FAILED;
    const int error = errno;
    if (fd >= 0) {
        close(fd);
    }
    if (mapping == MAP_FAILED) {
        info("low memory mode: cannot map a file in ",
             directory.string(),
             " (",
             std::strerror(error),
             "); polynomials stay on the heap");
        return std::nullopt;
    }
    munmap(mapping, page_size);
    return directory.string();
}
#else
std::optional<std::string> probe_storage_directory(const std::optional<std::string>& /*requested*/)
{
    return std::nullopt;
}
#endif

/**
 * @brief Return free glibc heap memory to the operating system.
 * @details glibc keeps freed memory in its arenas, where it stays resident until reused. Call after releasing a large
 * structure whose memory the next phase will not reuse. The prover calls it only in low memory mode (trim_heap): when
 * resident memory is not bounded, returning the pages just means faulting them back in later. No-op on other
 * allocators, Apple's and Android's included.
 */
void release_free_heap_memory()
{
#if defined(__GLIBC__)
    if (malloc_is_glibc()) {
        malloc_trim(0);
    }
#endif
}

/**
 * @brief Make glibc return freed memory to the operating system promptly, for runs that bound resident memory.
 * @details By default glibc raises its mmap threshold to the size of each freed mmap-served chunk (up to 32 MiB) and
 * its trim threshold to twice that. After one large buffer is freed, later buffers of up to 32 MiB are carved from
 * the heap instead of mapped, and up to 64 MiB of free heap is kept resident. Setting both thresholds explicitly turns
 * that adjustment off: chunks of 1 MiB or more are always mapped and unmapped on free, and free heap above 1 MiB is
 * returned. Apple's libmalloc has no mallopt equivalent that can be set from inside the process (its tuning is
 * environment variables read at startup). On macOS it keeps freed large blocks in a cache and defers returning freed
 * memory; MallocLargeCache=0 in the environment turns both off, and iOS has both off by default.
 * @return Whether the heap was configured: glibc only, and not when another allocator has replaced malloc.
 */
bool configure_heap_for_low_memory()
{
#if defined(__GLIBC__)
    if (!malloc_is_glibc()) {
        return false;
    }
    constexpr int threshold = 1 << 20;
    mallopt(M_MMAP_THRESHOLD, threshold);
    mallopt(M_TRIM_THRESHOLD, threshold);
    return true;
#else
    return false;
#endif
}

// glibc's defaults (DEFAULT_MMAP_THRESHOLD_MIN and DEFAULT_TRIM_THRESHOLD). Setting them does not bring back the
// dynamic adjustment configure_heap_for_low_memory turned off.
void restore_default_heap_thresholds()
{
#if defined(__GLIBC__)
    if (!malloc_is_glibc()) {
        return;
    }
    constexpr int threshold = 128 * 1024;
    mallopt(M_MMAP_THRESHOLD, threshold);
    mallopt(M_TRIM_THRESHOLD, threshold);
#endif
}

/** @brief Bytes the process can still allocate before the system terminates it; known on iOS only. */
std::optional<size_t> available_memory()
{
#if defined(__APPLE__) && TARGET_OS_IPHONE
    return os_proc_available_memory();
#else
    return std::nullopt;
#endif
}

bool resolve_mode(const Config& config)
{
    if (config.mode != Mode::Automatic) {
        return config.mode == Mode::On;
    }
    const auto available = available_memory();
    const bool on = automatic_turns_on(available, config.automatic_threshold.value_or(DEFAULT_AUTOMATIC_THRESHOLD));
    info("low memory mode: automatic resolved to ",
         on ? "on" : "off",
         available ? " (" + std::to_string(*available) + " bytes available)"
                   : std::string(" (available memory unknown)"));
    return on;
}
} // namespace

bool automatic_turns_on(std::optional<size_t> available_bytes, size_t threshold) noexcept
{
    return available_bytes.has_value() && *available_bytes != 0 && *available_bytes < threshold;
}

Applied configure(const Config& config)
{
#ifndef NO_MULTITHREADING
    std::lock_guard<std::mutex> lock(configure_mutex);
#endif
    const bool was_enabled = mode_enabled.load();
    budget_bytes.store(config.storage_budget.value_or(std::numeric_limits<size_t>::max()));
    Applied applied{ .enabled = resolve_mode(config) };
    if (applied.enabled) {
        applied.heap_configured = configure_heap_for_low_memory();
        storage_directory = probe_storage_directory(config.storage_directory);
        applied.file_backed_polynomials = storage_directory.has_value();
        file_backing.store(applied.file_backed_polynomials);
        scalar_multiplication::set_msm_batch_mem_budget(MSM_BATCH_MEM_BUDGET);
    } else if (was_enabled) {
        file_backing.store(false);
        storage_directory.reset();
        restore_default_heap_thresholds();
        scalar_multiplication::set_msm_batch_mem_budget(scalar_multiplication::DEFAULT_MSM_BATCH_MEM_BUDGET);
    }
    mode_enabled.store(applied.enabled);
    return applied;
}

void configure_from_environment()
{
    const char* mode = std::getenv("BB_SLOW_LOW_MEMORY");
    const char* budget = std::getenv("BB_STORAGE_BUDGET");
    const bool enable = mode != nullptr && std::string(mode) == "1";
    if (!enable && budget == nullptr) {
        return;
    }
    configure({ .mode = enable ? Mode::On : Mode::Off,
                .storage_budget = budget == nullptr ? std::nullopt : std::optional(parse_size_string(budget)) });
}

bool enabled() noexcept
{
    return mode_enabled.load(std::memory_order_relaxed);
}

std::optional<std::string> polynomial_storage_directory()
{
    if (!file_backing.load(std::memory_order_relaxed)) {
        return std::nullopt;
    }
#ifndef NO_MULTITHREADING
    std::lock_guard<std::mutex> lock(configure_mutex);
#endif
    return storage_directory;
}

size_t storage_budget() noexcept
{
    return budget_bytes.load(std::memory_order_relaxed);
}

void trim_heap()
{
    if (enabled()) {
        release_free_heap_memory();
    }
}

#if defined(__wasm__) && defined(BB_NO_EXCEPTIONS)
// Simplified version for WASM builds without exception support
// For WASM benchmarking, we don't enforce storage budgets
size_t parse_size_string(const std::string& /* size_str */)
{
    // Return unlimited budget for WASM builds
    return std::numeric_limits<size_t>::max();
}
#else
size_t parse_size_string(const std::string& size_str)
{
    if (size_str.empty()) {
        return std::numeric_limits<size_t>::max();
    }

    try {
        std::string str = size_str;

        // Convert to lowercase for case-insensitive comparison
        char suffix = static_cast<char>(std::tolower(static_cast<unsigned char>(str.back())));
        size_t multiplier = 1;

        // Check for unit suffix
        if (suffix == 'k') {
            multiplier = size_t{ 1024 };
            str.pop_back();
        } else if (suffix == 'm') {
            multiplier = size_t{ 1024 } * 1024;
            str.pop_back();
        } else if (suffix == 'g') {
            multiplier = size_t{ 1024 } * 1024 * 1024;
            str.pop_back();
        } else if (std::isdigit(static_cast<unsigned char>(suffix)) == 0) {
            // Invalid suffix
            throw_or_abort("Invalid storage size format: '" + size_str + "'. Use format like '500m', '2g', or '1024k'");
        }

        // Check if remaining string is a valid number
        if (str.empty()) {
            throw_or_abort("Invalid storage size format: '" + size_str + "'. No numeric value provided");
        }

        const unsigned long long value = std::stoull(str);
        // Rejects a product that does not fit size_t: wrapping modulo 2^64, or any value past 4 GiB on 32-bit targets.
        if (value > std::numeric_limits<size_t>::max() / multiplier) {
            throw_or_abort("Invalid storage size format: '" + size_str + "'. Value out of range");
        }
        return static_cast<size_t>(value) * multiplier;
    } catch (const std::invalid_argument&) {
        throw_or_abort("Invalid storage size format: '" + size_str + "'. Not a valid number");
    } catch (const std::out_of_range&) {
        throw_or_abort("Invalid storage size format: '" + size_str + "'. Value out of range");
    }
}
#endif

} // namespace bb::low_memory
