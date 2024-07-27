#pragma once

#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <cstdint>
#include <lmdb.h>
#include <vector>

namespace bb::crypto::merkle_tree {
using NodeKeyType = uint128_t;
using LeafIndexKeyType = uint64_t;
using FrKeyType = uint256_t;
using MetaKeyType = uint8_t;

void ThrowError(const std::string& errorString, int error);

int SizeCmp(const MDB_val* a, const MDB_val* b);

int MemCmp(const MDB_val*, const MDB_val*);

NodeKeyType GetKeyForNode(uint32_t level, index_t index);

std::vector<uint8_t> SerialiseKey(uint8_t key);
std::vector<uint8_t> SerialiseKey(uint64_t key);
std::vector<uint8_t> SerialiseKey(uint128_t key);
std::vector<uint8_t> SerialiseKey(uint256_t key);

void DeserialiseKey(void* data, uint8_t& key);
void DeserialiseKey(void* data, uint64_t& key);
void DeserialiseKey(void* data, uint128_t& key);
void DeserialiseKey(void* data, uint256_t& key);

template <typename T> int ValueCmp(const MDB_val* a, const MDB_val* b)
{
    T lhs;
    T rhs;
    DeserialiseKey(a->mv_data, lhs);
    DeserialiseKey(b->mv_data, rhs);
    if (lhs < rhs) {
        return -1;
    }
    if (lhs > rhs) {
        return 1;
    }
    return 0;
}

int IntegerKeyCmp(const MDB_val* a, const MDB_val* b);

template <typename... TArgs> bool call_lmdb_func(int (*f)(TArgs...), TArgs... args)
{
    int error = f(args...);
    return error == 0;
}

template <typename... TArgs> void call_lmdb_func(const std::string& errorString, int (*f)(TArgs...), TArgs... args)
{
    int error = f(args...);
    if (error != 0) {
        ThrowError(errorString, error);
    }
}

template <typename... TArgs> void call_lmdb_func(void (*f)(TArgs...), TArgs... args)
{
    f(args...);
}
} // namespace bb::crypto::merkle_tree