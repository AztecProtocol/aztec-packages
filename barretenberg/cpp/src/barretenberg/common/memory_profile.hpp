#pragma once

#include "barretenberg/serialize/msgpack.hpp"

#include <cstddef>
#include <mutex>
#include <ostream>
#include <string>
#include <vector>

namespace bb::detail {

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern bool use_memory_profile;

struct RssCheckpoint {
    std::string stage;
    size_t circuit_index;
    std::string circuit_name;
    size_t rss_mb;

    SERIALIZATION_FIELDS(stage, circuit_index, circuit_name, rss_mb);
};

struct MemoryProfile {
    std::mutex mutex;
    std::vector<RssCheckpoint> rss_checkpoints;
    std::string current_circuit_name;
    size_t current_circuit_index = 0;

    void add_rss_checkpoint(const std::string& stage);
    void set_circuit_name(const std::string& name);
    void next_circuit();
    void serialize_json(std::ostream& os) const;
    void clear();
};

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern MemoryProfile GLOBAL_MEMORY_PROFILE;

} // namespace bb::detail
