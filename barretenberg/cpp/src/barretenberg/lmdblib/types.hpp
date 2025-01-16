#pragma once

#include <cstdint>
#include <optional>
#include <vector>
namespace bb::lmdblib {
using Key = std::vector<uint8_t>;
using Value = std::vector<uint8_t>;
using OptionalValue = std::optional<Value>;
using KeyValuePair = std::pair<Key, Value>;
using KeysVector = std::vector<Key>;
using ValuesVector = std::vector<Value>;
using OptionalValuesVector = std::vector<OptionalValue>;
using KeyValuesVector = std::vector<KeyValuePair>;
} // namespace bb::lmdblib