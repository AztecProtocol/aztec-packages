#include "../mem.hpp"

#ifdef TRACY_MEMORY

void* operator new(std::size_t count)
{
    // NOLINTBEGIN(cppcoreguidelines-no-malloc)
    void* ptr = malloc(count);
    // NOLINTEND(cppcoreguidelines-no-malloc)
    TRACY_ALLOC(ptr, count);
    return ptr;
}

void* operator new[](std::size_t count)
{
    // NOLINTBEGIN(cppcoreguidelines-no-malloc)
    void* ptr = malloc(count);
    // NOLINTEND(cppcoreguidelines-no-malloc)
    TRACY_ALLOC(ptr, count);
    return ptr;
}

void operator delete(void* ptr) noexcept
{
    TRACY_FREE(ptr);
    // NOLINTBEGIN(cppcoreguidelines-no-malloc)
    free(ptr);
    // NOLINTEND(cppcoreguidelines-no-malloc)
}

void operator delete(void* ptr, std::size_t) noexcept
{
    TRACY_FREE(ptr);
    // NOLINTBEGIN(cppcoreguidelines-no-malloc)
    free(ptr);
    // NOLINTEND(cppcoreguidelines-no-malloc)
}

void operator delete[](void* ptr) noexcept
{
    TRACY_FREE(ptr);
    // NOLINTBEGIN(cppcoreguidelines-no-malloc)
    free(ptr);
    // NOLINTEND(cppcoreguidelines-no-malloc)
}

void operator delete[](void* ptr, std::size_t) noexcept
{
    TRACY_FREE(ptr);
    // NOLINTBEGIN(cppcoreguidelines-no-malloc)
    free(ptr);
    // NOLINTEND(cppcoreguidelines-no-malloc)
}

// C++17 aligned new
void* operator new(std::size_t size, std::align_val_t alignment)
{
    void* ptr = aligned_alloc(static_cast<std::size_t>(alignment), size);
    TRACY_ALLOC(ptr, size);
    return ptr;
}

void* operator new[](std::size_t size, std::align_val_t alignment)
{
    void* ptr = aligned_alloc(static_cast<std::size_t>(alignment), size);
    TRACY_ALLOC(ptr, size);
    return ptr;
}

void operator delete(void* ptr, std::align_val_t) noexcept
{
    TRACY_FREE(ptr);
    aligned_free(ptr);
}

void operator delete(void* ptr, std::size_t, std::align_val_t) noexcept
{
    TRACY_FREE(ptr);
    aligned_free(ptr);
}

void operator delete[](void* ptr, std::align_val_t) noexcept
{
    TRACY_FREE(ptr);
    aligned_free(ptr);
}

void operator delete[](void* ptr, std::size_t, std::align_val_t) noexcept
{
    TRACY_FREE(ptr);
    aligned_free(ptr);
}

#elif defined(BUMP_ALLOCATOR)

// Experimental thread-local bump pointer allocator for profiling.
// Preallocates 1GB of virtual address space per thread via mmap and
// never frees. Comparing bb performance with this allocator vs the
// default reveals total time lost to malloc/free.

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <new>
#include <sys/mman.h>

namespace {

constexpr std::size_t ARENA_SIZE = std::size_t(128) << 30; // 128 GB virtual (physical pages allocated on demand)

struct BumpArena {
    char* base = nullptr;
    std::size_t offset = 0;

    BumpArena()
    {
        base = static_cast<char*>(
            mmap(nullptr, ARENA_SIZE, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS | MAP_NORESERVE, -1, 0));
        if (base == MAP_FAILED) {
            std::fprintf(stderr, "BumpArena: mmap of %zu bytes failed\n", ARENA_SIZE);
            std::abort();
        }
    }

    void* allocate(std::size_t size, std::size_t alignment)
    {
        // Align offset up
        std::size_t aligned = (offset + alignment - 1) & ~(alignment - 1);
        if (aligned + size > ARENA_SIZE) {
            std::fprintf(stderr, "BumpArena: exhausted %zu bytes (requested %zu, alignment %zu)\n", ARENA_SIZE, size, alignment);
            std::abort();
        }
        void* ptr = base + aligned;
        offset = aligned + size;
        return ptr;
    }
};

thread_local BumpArena arena; // NOLINT

} // namespace

void* operator new(std::size_t count)
{
    return arena.allocate(count, alignof(std::max_align_t));
}

void* operator new[](std::size_t count)
{
    return arena.allocate(count, alignof(std::max_align_t));
}

void* operator new(std::size_t size, std::align_val_t alignment)
{
    return arena.allocate(size, static_cast<std::size_t>(alignment));
}

void* operator new[](std::size_t size, std::align_val_t alignment)
{
    return arena.allocate(size, static_cast<std::size_t>(alignment));
}

void operator delete(void*) noexcept {}
void operator delete(void*, std::size_t) noexcept {}
void operator delete[](void*) noexcept {}
void operator delete[](void*, std::size_t) noexcept {}
void operator delete(void*, std::align_val_t) noexcept {}
void operator delete(void*, std::size_t, std::align_val_t) noexcept {}
void operator delete[](void*, std::align_val_t) noexcept {}
void operator delete[](void*, std::size_t, std::align_val_t) noexcept {}

#elif defined(ALLOC_PROFILER)

// Allocation lifetime profiler: instruments every operator new/delete with stack traces,
// sizes, lifetimes, and thread affinity. Dumps a report at exit showing allocation sites
// sorted by peak concurrent bytes — identifies candidates for region-based allocation.

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <mutex>
#include <new>
#include <set>
#include <thread>
#include <unordered_map>
#include <vector>

#include <backward.hpp>
#include <execinfo.h>

namespace {

// Reentrance guard: when set, new/delete fall through to raw malloc/free.
// This prevents infinite recursion from profiler's own container allocations.
thread_local bool in_profiler = false; // NOLINT

struct ReentranceGuard {
    ReentranceGuard() { in_profiler = true; }
    ~ReentranceGuard() { in_profiler = false; }
    ReentranceGuard(const ReentranceGuard&) = delete;
    ReentranceGuard& operator=(const ReentranceGuard&) = delete;
};

constexpr int MAX_FRAMES = 16;

uint64_t now_ns()
{
    return static_cast<uint64_t>(
        std::chrono::high_resolution_clock::now().time_since_epoch().count());
}

uint32_t get_thread_id()
{
    // Use a compact sequential thread ID
    static std::atomic<uint32_t> next_id{ 0 }; // NOLINT
    thread_local uint32_t tid = next_id.fetch_add(1); // NOLINT
    return tid;
}

// FNV-1a hash over raw PC addresses
uint64_t hash_pcs(void* const* pcs, int count)
{
    uint64_t h = 14695981039346656037ULL;
    auto* bytes = reinterpret_cast<const uint8_t*>(pcs);
    size_t len = static_cast<size_t>(count) * sizeof(void*);
    for (size_t i = 0; i < len; i++) {
        h ^= bytes[i];
        h *= 1099511628211ULL;
    }
    return h;
}

struct AllocRecord {
    uint64_t site_hash;
    std::size_t size;
    uint64_t alloc_time_ns;
    uint32_t thread_id;
};

struct SiteStats {
    void* pcs[MAX_FRAMES]; // canonical alloc stack trace
    int pc_count = 0;
    uint64_t alloc_count = 0;
    uint64_t free_count = 0;
    uint64_t total_alloc_bytes = 0;
    uint64_t total_free_bytes = 0;
    int64_t current_bytes = 0;
    int64_t peak_bytes = 0;
    uint64_t lifetime_sum_ns = 0;
    uint64_t lifetime_min_ns = UINT64_MAX;
    uint64_t lifetime_max_ns = 0;
    std::size_t max_single_alloc = 0;
    std::size_t min_single_alloc = SIZE_MAX;
    std::set<uint32_t> alloc_threads;
    std::set<uint32_t> free_threads;
    // Track where frees happen
    std::unordered_map<uint64_t, uint64_t> free_site_counts;
    struct FreeSiteTrace {
        void* pcs[MAX_FRAMES];
        int count;
    };
    std::unordered_map<uint64_t, FreeSiteTrace> free_site_pcs;
};

struct ProfilerState {
    std::mutex mtx;
    std::unordered_map<void*, AllocRecord> live_allocs;
    std::unordered_map<uint64_t, SiteStats> sites;
    uint64_t global_current_bytes = 0;
    uint64_t global_peak_bytes = 0;
    uint64_t total_alloc_count = 0;
    uint64_t total_free_count = 0;
    bool report_dumped = false;
};

ProfilerState& state() // NOLINT
{
    static ProfilerState s; // NOLINT
    return s;
}

std::string format_bytes(uint64_t bytes)
{
    char buf[64]; // NOLINT
    if (bytes >= uint64_t(1) << 30) {
        std::snprintf(buf, sizeof(buf), "%.2f GB", static_cast<double>(bytes) / (1 << 30));
    } else if (bytes >= uint64_t(1) << 20) {
        std::snprintf(buf, sizeof(buf), "%.2f MB", static_cast<double>(bytes) / (1 << 20));
    } else if (bytes >= uint64_t(1) << 10) {
        std::snprintf(buf, sizeof(buf), "%.2f KB", static_cast<double>(bytes) / (1 << 10));
    } else {
        std::snprintf(buf, sizeof(buf), "%zu B", static_cast<std::size_t>(bytes));
    }
    return { buf };
}

std::string format_duration_ns(uint64_t ns)
{
    char buf[64]; // NOLINT
    if (ns >= 1000000000ULL) {
        std::snprintf(buf, sizeof(buf), "%.3fs", static_cast<double>(ns) / 1e9);
    } else if (ns >= 1000000ULL) {
        std::snprintf(buf, sizeof(buf), "%.3fms", static_cast<double>(ns) / 1e6);
    } else if (ns >= 1000ULL) {
        std::snprintf(buf, sizeof(buf), "%.3fus", static_cast<double>(ns) / 1e3);
    } else {
        std::snprintf(buf, sizeof(buf), "%zuns", static_cast<std::size_t>(ns));
    }
    return { buf };
}

void symbolize_and_print(FILE* f, void* const* pcs, int count)
{
    // Resolve each PC individually using backward-cpp
    backward::TraceResolver resolver;
    for (int i = 0; i < count; i++) {
        backward::Trace trace(pcs[i], static_cast<size_t>(i));
        backward::ResolvedTrace resolved = resolver.resolve(trace);
        if (resolved.source.filename.empty()) {
            if (resolved.object_function.empty()) {
                std::fprintf(f, "      #%d [%p]\n", i, pcs[i]);
            } else {
                std::fprintf(f, "      #%d %s [%p]\n", i, resolved.object_function.c_str(), pcs[i]);
            }
        } else {
            std::fprintf(f, "      #%d %s (%s:%d)\n", i, resolved.source.function.c_str(),
                         resolved.source.filename.c_str(), resolved.source.line);
        }
    }
}

void dump_report()
{
    ReentranceGuard guard;
    auto& s = state();
    std::lock_guard<std::mutex> lock(s.mtx);

    if (s.report_dumped) {
        return;
    }
    s.report_dumped = true;

    FILE* f = std::fopen("alloc_profile_report.txt", "w"); // NOLINT
    if (!f) {
        f = stderr;
    }

    // Sort sites by peak bytes descending
    std::vector<std::pair<uint64_t, const SiteStats*>> sorted_sites;
    sorted_sites.reserve(s.sites.size());
    for (const auto& [hash, stats] : s.sites) {
        sorted_sites.emplace_back(hash, &stats);
    }
    std::sort(sorted_sites.begin(), sorted_sites.end(),
              [](const auto& a, const auto& b) { return a.second->peak_bytes > b.second->peak_bytes; });

    uint64_t leaked = s.total_alloc_count - s.total_free_count;
    std::fprintf(f, "=== Allocation Lifetime Profiler Report ===\n");
    std::fprintf(f, "Total: %zu allocs, %zu frees, %zu leaked\n",
                 static_cast<size_t>(s.total_alloc_count),
                 static_cast<size_t>(s.total_free_count),
                 static_cast<size_t>(leaked));
    std::fprintf(f, "Total allocated: %s\n", format_bytes(s.global_peak_bytes).c_str());
    std::fprintf(f, "Peak concurrent: %s\n", format_bytes(s.global_peak_bytes).c_str());
    std::fprintf(f, "Unique allocation sites: %zu\n\n", s.sites.size());

    int rank = 0;
    for (const auto& [hash, stats] : sorted_sites) {
        if (++rank > 100) {
            std::fprintf(f, "... (%zu more sites truncated)\n", sorted_sites.size() - 100);
            break;
        }

        double freed_pct = stats->alloc_count > 0
            ? 100.0 * static_cast<double>(stats->free_count) / static_cast<double>(stats->alloc_count)
            : 0.0;

        std::fprintf(f, "--- Site #%d: peak %s, %zu allocs (%.0f%% freed) ---\n",
                     rank, format_bytes(static_cast<uint64_t>(stats->peak_bytes)).c_str(),
                     static_cast<size_t>(stats->alloc_count), freed_pct);

        // Sizes
        double avg_size = stats->alloc_count > 0
            ? static_cast<double>(stats->total_alloc_bytes) / static_cast<double>(stats->alloc_count)
            : 0.0;
        std::fprintf(f, "  Sizes: avg=%s, min=%s, max=%s, total=%s\n",
                     format_bytes(static_cast<uint64_t>(avg_size)).c_str(),
                     format_bytes(stats->min_single_alloc).c_str(),
                     format_bytes(stats->max_single_alloc).c_str(),
                     format_bytes(stats->total_alloc_bytes).c_str());

        // Lifetimes (only if we have frees)
        if (stats->free_count > 0) {
            double avg_life = static_cast<double>(stats->lifetime_sum_ns) / static_cast<double>(stats->free_count);
            std::fprintf(f, "  Lifetime: avg=%s, min=%s, max=%s\n",
                         format_duration_ns(static_cast<uint64_t>(avg_life)).c_str(),
                         format_duration_ns(stats->lifetime_min_ns).c_str(),
                         format_duration_ns(stats->lifetime_max_ns).c_str());
        } else {
            std::fprintf(f, "  Lifetime: never freed\n");
        }

        // Threads
        std::fprintf(f, "  Threads: alloc={");
        bool first = true;
        for (uint32_t t : stats->alloc_threads) {
            if (!first) std::fprintf(f, ",");
            std::fprintf(f, "%u", t);
            first = false;
        }
        std::fprintf(f, "}, free={");
        first = true;
        for (uint32_t t : stats->free_threads) {
            if (!first) std::fprintf(f, ",");
            std::fprintf(f, "%u", t);
            first = false;
        }
        std::fprintf(f, "}\n");

        // Alloc stack trace
        std::fprintf(f, "  Alloc stack:\n");
        symbolize_and_print(f, stats->pcs, stats->pc_count);

        // Free sites
        if (!stats->free_site_counts.empty()) {
            // Sort free sites by count descending
            std::vector<std::pair<uint64_t, uint64_t>> free_sorted(
                stats->free_site_counts.begin(), stats->free_site_counts.end());
            std::sort(free_sorted.begin(), free_sorted.end(),
                      [](const auto& a, const auto& b) { return a.second > b.second; });

            std::fprintf(f, "  Freed from:\n");
            int free_rank = 0;
            for (const auto& [fhash, fcount] : free_sorted) {
                if (++free_rank > 5) {
                    std::fprintf(f, "    ... (%zu more free sites)\n", free_sorted.size() - 5);
                    break;
                }
                std::fprintf(f, "    %zux:\n", static_cast<size_t>(fcount));
                auto it = stats->free_site_pcs.find(fhash);
                if (it != stats->free_site_pcs.end()) {
                    symbolize_and_print(f, it->second.pcs, it->second.count);
                }
            }
        }

        std::fprintf(f, "\n");
    }

    if (f != stderr) {
        std::fclose(f); // NOLINT
        std::fprintf(stderr, "Allocation profiler report written to alloc_profile_report.txt (%zu sites)\n",
                     s.sites.size());
    }
}

struct ReportDumper {
    ~ReportDumper() { dump_report(); }
};

ReportDumper report_dumper; // NOLINT - dumps report on process exit

void record_alloc(void* ptr, std::size_t size)
{
    if (!ptr || in_profiler) {
        return;
    }
    ReentranceGuard guard;

    // Capture stack trace (raw PCs)
    void* pcs[MAX_FRAMES]; // NOLINT
    int nframes = backtrace(pcs, MAX_FRAMES);
    // Skip the first 2 frames (record_alloc + operator new)
    int skip = 2;
    if (nframes <= skip) {
        skip = 0;
    }
    void* const* trace_pcs = pcs + skip;
    int trace_count = nframes - skip;

    uint64_t site_hash = hash_pcs(trace_pcs, trace_count);
    uint64_t ts = now_ns();
    uint32_t tid = get_thread_id();

    auto& s = state();
    std::lock_guard<std::mutex> lock(s.mtx);

    s.live_allocs[ptr] = AllocRecord{ site_hash, size, ts, tid };

    auto& site = s.sites[site_hash];
    if (site.alloc_count == 0) {
        // First time seeing this site — store canonical stack trace
        site.pc_count = trace_count;
        std::memcpy(site.pcs, trace_pcs, static_cast<size_t>(trace_count) * sizeof(void*));
    }
    site.alloc_count++;
    site.total_alloc_bytes += size;
    site.current_bytes += static_cast<int64_t>(size);
    if (site.current_bytes > site.peak_bytes) {
        site.peak_bytes = site.current_bytes;
    }
    if (size > site.max_single_alloc) {
        site.max_single_alloc = size;
    }
    if (size < site.min_single_alloc) {
        site.min_single_alloc = size;
    }
    site.alloc_threads.insert(tid);

    s.total_alloc_count++;
    s.global_current_bytes += size;
    if (s.global_current_bytes > s.global_peak_bytes) {
        s.global_peak_bytes = s.global_current_bytes;
    }
}

void record_free(void* ptr)
{
    if (!ptr || in_profiler) {
        return;
    }
    ReentranceGuard guard;

    auto& s = state();
    std::lock_guard<std::mutex> lock(s.mtx);

    auto it = s.live_allocs.find(ptr);
    if (it == s.live_allocs.end()) {
        return; // Not tracked (allocated before profiler init, or internal)
    }

    AllocRecord rec = it->second;
    s.live_allocs.erase(it);

    uint64_t lifetime = now_ns() - rec.alloc_time_ns;
    uint32_t tid = get_thread_id();

    auto& site = s.sites[rec.site_hash];
    site.free_count++;
    site.total_free_bytes += rec.size;
    site.current_bytes -= static_cast<int64_t>(rec.size);
    site.lifetime_sum_ns += lifetime;
    if (lifetime < site.lifetime_min_ns) {
        site.lifetime_min_ns = lifetime;
    }
    if (lifetime > site.lifetime_max_ns) {
        site.lifetime_max_ns = lifetime;
    }
    site.free_threads.insert(tid);

    // Capture free stack trace
    void* pcs[MAX_FRAMES]; // NOLINT
    int nframes = backtrace(pcs, MAX_FRAMES);
    int skip = 2; // skip record_free + operator delete
    if (nframes <= skip) {
        skip = 0;
    }
    void* const* trace_pcs = pcs + skip;
    int trace_count = nframes - skip;
    uint64_t free_hash = hash_pcs(trace_pcs, trace_count);

    site.free_site_counts[free_hash]++;
    if (site.free_site_pcs.find(free_hash) == site.free_site_pcs.end()) {
        SiteStats::FreeSiteTrace fst{};
        fst.count = trace_count;
        std::memcpy(fst.pcs, trace_pcs, static_cast<size_t>(trace_count) * sizeof(void*));
        site.free_site_pcs[free_hash] = fst;
    }

    s.total_free_count++;
    s.global_current_bytes -= rec.size;
}

} // namespace

// NOLINTBEGIN(cppcoreguidelines-no-malloc)

void* operator new(std::size_t count)
{
    void* ptr = malloc(count);
    record_alloc(ptr, count);
    return ptr;
}

void* operator new[](std::size_t count)
{
    void* ptr = malloc(count);
    record_alloc(ptr, count);
    return ptr;
}

void operator delete(void* ptr) noexcept
{
    record_free(ptr);
    free(ptr);
}

void operator delete(void* ptr, std::size_t) noexcept
{
    record_free(ptr);
    free(ptr);
}

void operator delete[](void* ptr) noexcept
{
    record_free(ptr);
    free(ptr);
}

void operator delete[](void* ptr, std::size_t) noexcept
{
    record_free(ptr);
    free(ptr);
}

void* operator new(std::size_t size, std::align_val_t alignment)
{
    size_t align = static_cast<size_t>(alignment);
    size_t padded = size + (size % align != 0 ? align - (size % align) : 0);
    void* ptr = aligned_alloc(align, padded);
    record_alloc(ptr, size);
    return ptr;
}

void* operator new[](std::size_t size, std::align_val_t alignment)
{
    size_t align = static_cast<size_t>(alignment);
    size_t padded = size + (size % align != 0 ? align - (size % align) : 0);
    void* ptr = aligned_alloc(align, padded);
    record_alloc(ptr, size);
    return ptr;
}

void operator delete(void* ptr, std::align_val_t) noexcept
{
    record_free(ptr);
    free(ptr);
}

void operator delete(void* ptr, std::size_t, std::align_val_t) noexcept
{
    record_free(ptr);
    free(ptr);
}

void operator delete[](void* ptr, std::align_val_t) noexcept
{
    record_free(ptr);
    free(ptr);
}

void operator delete[](void* ptr, std::size_t, std::align_val_t) noexcept
{
    record_free(ptr);
    free(ptr);
}

// NOLINTEND(cppcoreguidelines-no-malloc)

#else
void __ensure_object_file_not_empty_of_symbols() {} // NOLINT
#endif
