#include "memory_profile.hpp"
#include "barretenberg/env/logstr.hpp"

#include "barretenberg/serialize/msgpack_impl.hpp"

namespace bb::detail {

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
bool use_memory_profile = false;
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
MemoryProfile GLOBAL_MEMORY_PROFILE;

void MemoryProfile::add_rss_checkpoint(const std::string& stage)
{
    std::lock_guard<std::mutex> lock(mutex);
    rss_checkpoints.push_back(
        RssCheckpoint{ stage, current_circuit_index, current_circuit_name, peak_rss_bytes() / (1024ULL * 1024ULL) });
}

void MemoryProfile::set_circuit_name(const std::string& name)
{
    std::lock_guard<std::mutex> lock(mutex);
    current_circuit_name = name;
}

void MemoryProfile::next_circuit()
{
    std::lock_guard<std::mutex> lock(mutex);
    current_circuit_index++;
}

void MemoryProfile::clear()
{
    std::lock_guard<std::mutex> lock(mutex);
    rss_checkpoints.clear();
    current_circuit_name.clear();
    current_circuit_index = 0;
}

void MemoryProfile::serialize_json(std::ostream& os) const
{
    // Use msgpack round-trip to produce JSON (same pattern as bb_bench.cpp)
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, rss_checkpoints);
    msgpack::object_handle oh = msgpack::unpack(buffer.data(), buffer.size());
    os << oh.get() << std::endl;
}

} // namespace bb::detail
