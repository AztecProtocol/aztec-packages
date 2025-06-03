// logstr()
// --------------------
// Logs a message to stderr and appends the *peak* resident-set size (RSS)
// of the current process in MiB.
//
//  Windows note: link with Psapi.lib

#include <cstddef>
#include <iomanip>
#include <iostream>

#if defined(__linux__) || defined(__APPLE__) || defined(__FreeBSD__)
#include <sys/resource.h>
#elif defined(_WIN32)
#define NOMINMAX
#define PSAPI_VERSION 1
#include <psapi.h>
#include <windows.h>
#endif

namespace {
//---------------------------------------------------------------------
// peak_rss_bytes()
//---------------------------------------------------------------------
// Returns the *peak* RSS in **bytes** for the current process,
// or 0 on failure / unsupported platform.
//---------------------------------------------------------------------
std::size_t peak_rss_bytes()
{
#if defined(_WIN32)
    PROCESS_MEMORY_COUNTERS pmc{};
    if (GetProcessMemoryInfo(GetCurrentProcess(), &pmc, sizeof(pmc)))
        return static_cast<std::size_t>(pmc.PeakWorkingSetSize);

#elif defined(__APPLE__) || defined(__FreeBSD__)
    struct rusage usage {};
    if (getrusage(RUSAGE_SELF, &usage) == 0)
        // ru_maxrss is already bytes on macOS / BSD
        return static_cast<std::size_t>(usage.ru_maxrss);

#elif defined(__linux__)
    struct rusage usage {};
    if (getrusage(RUSAGE_SELF, &usage) == 0)
        // ru_maxrss is kilobytes on Linux → convert to bytes
        return static_cast<std::size_t>(usage.ru_maxrss) * 1024ULL;
#endif

    return 0; // fallback on error / unknown OS
}

} // namespace

//---------------------------------------------------------------------
// C-linkage wrapper: log_with_mem_usage()
//---------------------------------------------------------------------
//   Prints  "<msg> (mem: <value> MiB)"  with two-digit precision.
//
//   • Safe to call from C, C++, or dlopen’d plugins.
//   • Thread-safe w.r.t. internal state; output lines may still
//     interleave if multiple threads call concurrently (as with any
//     stderr logging).
//---------------------------------------------------------------------
extern "C" void logstr(char const* msg)
{
    const std::size_t bytes = peak_rss_bytes();
    std::cerr << msg;

    if (bytes != 0) {
        const double mib = static_cast<double>(bytes) / (1024.0 * 1024.0);
        std::cerr << " (mem: " << std::fixed << std::setprecision(2) << mib << " MiB)";
    } else {
        std::cerr << " (mem: N/A)";
    }
    std::cerr << '\n';
}
