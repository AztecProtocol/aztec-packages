#pragma once

#include <cstddef>
#include <map>
#include <mutex>
#include <ostream>
#include <string>
#include <vector>

namespace bb {

struct CategoryStats {
    double actual_mb = 0;
    double compressed_mb = 0; // ideal if using variable-width encoding
};

struct CircuitMemoryStats {
    size_t circuit_index = 0;
    std::map<std::string, CategoryStats> categories;
    CategoryStats total;
};

namespace detail {

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern bool use_memory_profile;

struct RssCheckpoint {
    std::string stage;
    size_t circuit_index;
    std::string circuit_name;
    size_t rss_mb;
};

struct MemoryProfile {
    std::mutex mutex;
    std::vector<CircuitMemoryStats> circuits;
    std::vector<RssCheckpoint> rss_checkpoints;
    std::string current_circuit_name;

    void add_circuit(CircuitMemoryStats stats);
    void add_rss_checkpoint(const std::string& stage, size_t circuit_index);
    void set_circuit_name(const std::string& name);
    void serialize_json(std::ostream& os) const;
    void clear();
};

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern MemoryProfile GLOBAL_MEMORY_PROFILE;

} // namespace detail
} // namespace bb
