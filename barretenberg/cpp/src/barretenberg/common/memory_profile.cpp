#include "memory_profile.hpp"

#ifndef __wasm__
#include "barretenberg/env/logstr.hpp"
#endif

#include "barretenberg/serialize/msgpack_impl.hpp"

#if defined(__linux__)
#include <malloc.h>
#endif

namespace {

size_t heap_allocated_mb()
{
#if defined(__linux__)
    struct mallinfo2 info = mallinfo2();
    return info.uordblks / (1024ULL * 1024ULL);
#elif defined(__wasm__)
    return 0;
#else
    // mallinfo2 is Linux-specific; fall back to peak RSS on other platforms
    return peak_rss_bytes() / (1024ULL * 1024ULL);
#endif
}

} // namespace

namespace bb::detail {

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
bool use_memory_profile = false;
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
MemoryProfile GLOBAL_MEMORY_PROFILE;

void MemoryProfile::add_checkpoint(const std::string& stage)
{
    std::lock_guard<std::mutex> lock(mutex);
    checkpoints.push_back(MemoryCheckpoint{ stage, current_circuit_index, current_circuit_name, heap_allocated_mb() });
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
    checkpoints.clear();
    current_circuit_name.clear();
    current_circuit_index = 0;
}

void MemoryProfile::serialize_json(std::ostream& os) const
{
    // Use msgpack round-trip to produce JSON (same pattern as bb_bench.cpp)
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, checkpoints);
    msgpack::object_handle oh = msgpack::unpack(buffer.data(), buffer.size());
    os << oh.get() << std::endl;
}

} // namespace bb::detail
