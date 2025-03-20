#include "barretenberg/lmdblib/types.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <cstdint>

namespace bb::lmdblib {
const uint32_t NUM_VALUES = 1024;
inline auto& engine = numeric::get_debug_randomness();
inline auto& random_engine = numeric::get_randomness();

inline std::string random_string()
{
    std::stringstream ss;
    ss << random_engine.get_random_uint32();
    return ss.str();
}

inline std::string random_temp_directory()
{
    std::stringstream ss;
    ss << "/tmp/lmdb/" << random_string();
    return ss.str();
}

inline std::vector<uint8_t> serialise(std::string key)
{
    std::vector<uint8_t> data(key.begin(), key.end());
    return data;
}

inline Key get_key(int64_t keyCount)
{
    return serialise((std::stringstream() << "Key" << keyCount).str());
}

inline Value get_value(int64_t keyCount, int64_t valueCount)
{
    return serialise((std::stringstream() << "Key" << keyCount << "Data" << valueCount).str());
}

} // namespace bb::lmdblib