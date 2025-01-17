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
using DupValue = std::vector<Value>;
using KeyDupValuePair = std::pair<Key, DupValue>;
using OptionalValues = std::optional<ValuesVector>;
using OptionalValuesVector = std::vector<OptionalValues>;
using KeyValuesVector = std::vector<KeyValuePair>;
using KeyDupValuesVector = std::vector<KeyDupValuePair>;
} // namespace bb::lmdblib