#pragma once

#include <cstdint>
#include <optional>
#include <vector>
namespace bb::lmdblib {
using Key = std::vector<uint8_t>;
using Value = std::vector<uint8_t>;
using KeysVector = std::vector<Key>;
using ValuesVector = std::vector<Value>;
using KeyValuesPair = std::pair<Key, ValuesVector>;
using OptionalValues = std::optional<ValuesVector>;
using OptionalValuesVector = std::vector<OptionalValues>;
using KeyDupValuesVector = std::vector<KeyValuesPair>;
} // namespace bb::lmdblib