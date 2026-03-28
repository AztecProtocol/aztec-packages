#pragma once

#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/wsdb/generated/wsdb_types.hpp"
#include "lmdb.h"
#include <cstdint>
#include <iostream>
#include <optional>
#include <string>
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
using KeyOptionalValuesPair = std::pair<Key, OptionalValues>;
using KeyOptionalValuesVector = std::vector<KeyOptionalValuesPair>;

struct DBStats {
    std::string name;
    uint64_t numDataItems;
    uint64_t totalUsedSize;

    DBStats() = default;
    DBStats(const DBStats& other) = default;
    DBStats(DBStats&& other) noexcept { *this = std::move(other); }
    ~DBStats() = default;
    DBStats(std::string name, MDB_stat& stat)
        : name(std::move(name))
        , numDataItems(stat.ms_entries)
        , totalUsedSize(stat.ms_psize * (stat.ms_branch_pages + stat.ms_leaf_pages + stat.ms_overflow_pages))
    {}
    DBStats(const std::string& name, uint64_t numDataItems, uint64_t totalUsedSize)
        : name(name)
        , numDataItems(numDataItems)
        , totalUsedSize(totalUsedSize)
    {}

    SERIALIZATION_FIELDS(name, numDataItems, totalUsedSize)

    bool operator==(const DBStats& other) const
    {
        return name == other.name && numDataItems == other.numDataItems && totalUsedSize == other.totalUsedSize;
    }

    DBStats& operator=(const DBStats& other) = default;

    DBStats& operator=(DBStats&& other) noexcept
    {
        if (this != &other) {
            name = std::move(other.name);
            numDataItems = other.numDataItems;
            totalUsedSize = other.totalUsedSize;
        }
        return *this;
    }

    friend std::ostream& operator<<(std::ostream& os, const DBStats& stats)
    {
        os << "DB " << stats.name << ", num items: " << stats.numDataItems
           << ", total used size: " << stats.totalUsedSize;
        return os;
    }

    static DBStats from_wire(const bb::wsdb::wire::DBStats& w)
    {
        DBStats r;
        r.name = w.name;
        r.numDataItems = w.numDataItems;
        r.totalUsedSize = w.totalUsedSize;
        return r;
    }

    bb::wsdb::wire::DBStats to_wire() const
    {
        return bb::wsdb::wire::DBStats{
            .name = name,
            .numDataItems = numDataItems,
            .totalUsedSize = totalUsedSize,
        };
    }
};

} // namespace bb::lmdblib