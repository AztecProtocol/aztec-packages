#include "memory_profile.hpp"

#include <algorithm>
#include <cstddef>
#include <iomanip>
#include <sstream>

#if defined(__linux__) || defined(__APPLE__) || defined(__FreeBSD__)
#include <sys/resource.h>
#endif

namespace {

size_t get_peak_rss_mb()
{
#if defined(__linux__)
    struct rusage usage{};
    if (getrusage(RUSAGE_SELF, &usage) == 0) {
        // ru_maxrss is in kilobytes on Linux
        return static_cast<size_t>(usage.ru_maxrss) / 1024;
    }
#elif defined(__APPLE__) || defined(__FreeBSD__)
    struct rusage usage{};
    if (getrusage(RUSAGE_SELF, &usage) == 0) {
        // ru_maxrss is in bytes on macOS/BSD
        return static_cast<size_t>(usage.ru_maxrss) / (1024 * 1024);
    }
#endif
    return 0;
}

} // namespace

namespace bb::detail {

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
bool use_memory_profile = false;
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
MemoryProfile GLOBAL_MEMORY_PROFILE;

void MemoryProfile::add_circuit(CircuitMemoryStats stats)
{
    std::lock_guard<std::mutex> lock(mutex);
    stats.circuit_index = circuits.size();
    circuits.push_back(std::move(stats));
}

void MemoryProfile::add_rss_checkpoint(const std::string& stage, size_t circuit_index)
{
    std::lock_guard<std::mutex> lock(mutex);
    rss_checkpoints.push_back(RssCheckpoint{ stage, circuit_index, get_peak_rss_mb() });
}

void MemoryProfile::set_crs_size(size_t num_points)
{
    std::lock_guard<std::mutex> lock(mutex);
    if (num_points > crs_points) {
        crs_points = num_points;
    }
}

void MemoryProfile::clear()
{
    std::lock_guard<std::mutex> lock(mutex);
    circuits.clear();
    rss_checkpoints.clear();
    crs_points = 0;
}

namespace {

void write_category_stats(std::ostream& os, const CategoryStats& stats, const std::string& indent)
{
    os << indent << "\"actual_mb\": " << std::fixed << std::setprecision(2) << stats.actual_mb << ", "
       << "\"compressed_mb\": " << std::fixed << std::setprecision(2) << stats.compressed_mb;
}

void write_circuit_stats(std::ostream& os, const CircuitMemoryStats& circuit, const std::string& indent)
{
    os << indent << "{\n";
    os << indent << "  \"index\": " << circuit.circuit_index << ",\n";
    os << indent << "  \"total_polynomial_mb\": " << std::fixed << std::setprecision(2) << circuit.total.actual_mb
       << ",\n";
    os << indent << "  \"categories\": {\n";
    bool first = true;
    for (const auto& [name, stats] : circuit.categories) {
        if (!first) {
            os << ",\n";
        }
        first = false;
        os << indent << "    \"" << name << "\": { ";
        write_category_stats(os, stats, "");
        os << " }";
    }
    os << "\n" << indent << "  }\n";
    os << indent << "}";
}

} // namespace

void MemoryProfile::serialize_json(std::ostream& os) const
{
    // Find peak circuit (largest total_polynomial_mb)
    size_t peak_idx = 0;
    double peak_mb = 0;
    for (size_t i = 0; i < circuits.size(); i++) {
        if (circuits[i].total.actual_mb > peak_mb) {
            peak_mb = circuits[i].total.actual_mb;
            peak_idx = i;
        }
    }

    // Find peak RSS checkpoint
    RssCheckpoint peak_rss{ "unknown", 0, 0 };
    for (const auto& cp : rss_checkpoints) {
        if (cp.rss_mb > peak_rss.rss_mb) {
            peak_rss = cp;
        }
    }

    // CRS memory: num_points * 128 bytes (with Pippenger point table)
    double crs_mb = static_cast<double>(crs_points) * 128.0 / (1024.0 * 1024.0);

    os << "{\n";

    // Peak circuit
    if (!circuits.empty()) {
        os << "  \"peak_circuit\": ";
        write_circuit_stats(os, circuits[peak_idx], "  ");
        os << ",\n";
    }

    // All circuits
    os << "  \"all_circuits\": [\n";
    for (size_t i = 0; i < circuits.size(); i++) {
        if (i > 0) {
            os << ",\n";
        }
        write_circuit_stats(os, circuits[i], "    ");
    }
    os << "\n  ],\n";

    // RSS checkpoints
    os << "  \"rss_checkpoints\": [\n";
    for (size_t i = 0; i < rss_checkpoints.size(); i++) {
        if (i > 0) {
            os << ",\n";
        }
        const auto& cp = rss_checkpoints[i];
        os << "    { \"stage\": \"" << cp.stage << "\", \"circuit_index\": " << cp.circuit_index
           << ", \"rss_mb\": " << cp.rss_mb << " }";
    }
    os << "\n  ],\n";

    // Peak RSS
    os << "  \"peak_rss\": { \"stage\": \"" << peak_rss.stage << "\", \"circuit_index\": " << peak_rss.circuit_index
       << ", \"rss_mb\": " << peak_rss.rss_mb << " },\n";

    // CRS
    os << "  \"crs_mb\": " << std::fixed << std::setprecision(2) << crs_mb << "\n";

    os << "}\n";
}

} // namespace bb::detail
