#include "lmdblib/types.hpp"
#include <cstdint>
#include <random>
#include <sstream>

namespace azteclabs::lmdblib {
const uint32_t NUM_VALUES = 1024;

inline std::string random_string() {
  static thread_local std::mt19937 gen(std::random_device{}());
  std::stringstream ss;
  ss << std::uniform_int_distribution<uint32_t>{}(gen);
  return ss.str();
}

inline std::string random_temp_directory() {
  std::stringstream ss;
  ss << "/tmp/lmdb/" << random_string();
  return ss.str();
}

inline std::vector<uint8_t> serialise(std::string key) {
  std::vector<uint8_t> data(key.begin(), key.end());
  return data;
}

inline Key get_key(int64_t keyCount) {
  return serialise((std::stringstream() << "Key" << keyCount).str());
}

inline Value get_value(int64_t keyCount, int64_t valueCount) {
  return serialise(
      (std::stringstream() << "Key" << keyCount << "Data" << valueCount).str());
}

} // namespace azteclabs::lmdblib