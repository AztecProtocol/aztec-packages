// logstr()
// --------------------
// Logs a message to stderr and appends the *peak* resident-set size (RSS)
// of the current process in MiB.
//
//  Windows note: link with Psapi.lib

#include "mem.hpp"
#include <cstddef>
#include <iomanip>
#include <iostream>
#ifndef NO_MULTITHREADING
#include <mutex>
#endif

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
#ifndef NO_MULTITHREADING
    static std::mutex log_mutex;
    std::lock_guard<std::mutex> lock(log_mutex);
#endif

    static bool disable_mem_usage = std::getenv("BB_DISABLE_MEM_USAGE") != nullptr;
    if (disable_mem_usage) {
        std::cerr << msg << '\n';
        return;
    }

    const std::size_t bytes = bb::get_peak_rss_bytes();
    std::cerr << msg;

    if (bytes != 0) {
        const double mib = static_cast<double>(bytes) / (1024.0 * 1024.0);
        std::cerr << " (mem: " << std::fixed << std::setprecision(2) << mib << " MiB)";
    } else {
        std::cerr << " (mem: N/A)";
    }
    std::cerr << '\n';
}
