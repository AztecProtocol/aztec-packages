#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>

namespace bb::low_memory {

/**
 * @brief MSM batch memory budget used in low memory mode (see scalar_multiplication::set_msm_batch_mem_budget).
 * @details Measured on the pinned transfer flows run under a memory cap at their memory floor, 16 MiB is the smallest
 * budget whose capped proof stays within 4x of the wall time of ordinary mode; below it the floor no longer drops and
 * the capped wall time rises steeply. Without a tight cap the mode costs far less (see --slow_low_memory).
 */
inline constexpr size_t MSM_BATCH_MEM_BUDGET = size_t{ 16 } << 20;

/** @brief Default for Config::automatic_threshold: 2 GiB. */
inline constexpr size_t DEFAULT_AUTOMATIC_THRESHOLD = size_t{ 2 } << 30;

/**
 * @brief Off, on, or automatic: on iOS, on when os_proc_available_memory() is below Config::automatic_threshold; off on
 * every other platform, Android included. Resolved once, inside configure(); nothing picks automatic by default.
 */
enum class Mode : uint8_t { Off, On, Automatic };

struct Config {
    Mode mode = Mode::Off;
    /** @brief Bytes of file-backed polynomial storage allowed in total; nullopt means unlimited. */
    std::optional<size_t> storage_budget;
    /** @brief Where polynomial files go; nullopt means the system temp directory (TMPDIR). */
    std::optional<std::string> storage_directory;
    /** @brief Bytes of available memory below which Mode::Automatic turns the mode on; nullopt means the default. */
    std::optional<size_t> automatic_threshold;
};

/** @brief What configure() put in place on this build; all false when the mode is off. */
struct Applied {
    /** @brief Whether the mode is on; for Mode::Automatic, what it resolved to. */
    bool enabled = false;
    /**
     * @brief New polynomials are files in the storage directory mapped MAP_SHARED. False on wasm and Windows, and when
     * a file could not be created and mapped there; polynomials then stay on the heap.
     */
    bool file_backed_polynomials = false;
    /**
     * @brief glibc returns freed memory promptly (M_MMAP_THRESHOLD and M_TRIM_THRESHOLD of 1 MiB). False when malloc
     * is not glibc's (a preloaded tcmalloc, jemalloc or mimalloc): the heap is then left untuned.
     */
    bool heap_configured = false;
};

/**
 * @brief Turn low memory mode on or off, with everything it configures. The only writer of the mode's state.
 * @details Mode::Automatic is resolved here, once: on iOS it means on when os_proc_available_memory() is below
 * automatic_threshold, and everywhere else, Android included, it means off. Applied::enabled reports the result.
 *
 * On: polynomials allocated from then on are file backed in storage_directory, within storage_budget bytes in total; a
 * BN254 CRS loaded from a directory from then on is mapped from a native cache file; the heap is configured to return
 * freed memory promptly (see Applied); and the MSM batch memory budget becomes MSM_BATCH_MEM_BUDGET.
 *
 * Off, after on: new polynomials and CRS loads use the heap again, the MSM budget returns to
 * scalar_multiplication::DEFAULT_MSM_BATCH_MEM_BUDGET (32 MiB), and glibc's M_MMAP_THRESHOLD and M_TRIM_THRESHOLD are
 * set back to their default values (128 KiB). glibc's dynamic adjustment of
 * those thresholds, which any mallopt call to them disables, cannot be turned back on and stays off for the rest of
 * the process. Off when the mode is already off only sets the storage budget.
 *
 * Memory keeps the kind it was allocated with: polynomials allocated while the mode was on stay file backed, and a
 * CRS loaded while it was off stays on the heap, until freed.
 *
 * Turning the mode on first checks that a file can be created and mapped in the storage directory. If not (missing,
 * read-only, or on tmpfs), polynomials stay on the heap and the rest of the mode still turns on;
 * setup problems never abort. Android has no usable temp directory by default, so an Android host passes a writable
 * storage_directory. Heap trimming acts on glibc's malloc only: nothing trims the heap on Apple platforms or Android.
 *
 * Preconditions, not checked here: no proof is running, and "on" comes before the BN254 CRS is loaded. The bbapi
 * command LowMemoryConfigure rejects a call made while a Chonk proof is in progress, but only one in its own bbapi
 * session.
 */
Applied configure(const Config& config);

/**
 * @brief Apply BB_SLOW_LOW_MEMORY ("1" turns the mode on) and BB_STORAGE_BUDGET (e.g. "500m") through configure().
 * Does nothing when neither is set. Called by the bb executable before it runs a command; the library never reads
 * these variables on its own.
 */
void configure_from_environment();

/**
 * @brief Whether Mode::Automatic turns the mode on, given the bytes os_proc_available_memory() reported: only when that
 * is known and below threshold. 0, which a process without a memory limit gets, counts as unknown.
 */
bool automatic_turns_on(std::optional<size_t> available_bytes, size_t threshold) noexcept;

/** @brief Whether low memory mode is on. */
bool enabled() noexcept;

/**
 * @brief The directory new polynomial files go in; nullopt when polynomials are allocated on the heap. Costs one atomic
 * load in that case.
 */
std::optional<std::string> polynomial_storage_directory();

/** @brief Bytes of file-backed polynomial storage allowed in total; SIZE_MAX when unlimited. */
size_t storage_budget() noexcept;

/** @brief In low memory mode, return free glibc heap memory to the operating system; otherwise nothing. */
void trim_heap();

/** @brief Parse a storage size such as "500m", "2g" or "1024k" into bytes; empty means unlimited (SIZE_MAX). */
size_t parse_size_string(const std::string& size_str);

} // namespace bb::low_memory
