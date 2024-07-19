#include "barretenberg/crypto/merkle_tree/lmdb_store/functions.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <cstdint>
#include <cstring>
#include <functional>

namespace bb::crypto::merkle_tree {
void ThrowError(const std::string& errorString, int error)
{
    std::stringstream ss;
    ss << errorString << ": " << error << " - " << mdb_strerror(error) << std::endl;
    throw std::runtime_error(ss.str());
}

// Nodes are stored as a heap
NodeKeyType GetKeyForNode(uint32_t level, index_t index)
{
    NodeKeyType key = static_cast<NodeKeyType>(1) << level;
    key += static_cast<NodeKeyType>(index);
    return key - 1;
}

int SizeCmp(const MDB_val* a, const MDB_val* b)
{
    if (a->mv_size < b->mv_size) {
        return -1;
    }
    if (a->mv_size > b->mv_size) {
        return 1;
    }
    return 0;
}

/**
 * Default lexicographical implementation of key comparisons used in our LMDB implementation
 */
int MemCmp(const MDB_val* a, const MDB_val* b)
{
    return std::memcmp(static_cast<char*>(a->mv_data), static_cast<char*>(b->mv_data), a->mv_size);
}

/**
 * Integer key comparison function.
 * We use this to divide the key space into discrete integer sizes
 * We check the key length in bytes to establish if it is exactly
 * 1. 1 byte
 * 2. 8 bytes
 * 3. 16 bytes
 * 4. 32 bytes
 * If it is one of the above sizes then we assume it is an integer value and we compare it as such
 */
int IntegerKeyCmp(const MDB_val* a, const MDB_val* b)
{
    // Id the keys sizes are different, sort by key size
    if (a->mv_size != b->mv_size) {
        return SizeCmp(a, b);
    }
    uint64_t factor = a->mv_size / sizeof(uint64_t);
    uint64_t remainder = a->mv_size % sizeof(uint64_t);

    // If the size is > 32 bytes, use default comparison
    if (a->mv_size > sizeof(uint256_t)) {
        return MemCmp(a, b);
    }
    // If the size is not a divisible by 8 then use default comparison, unless it is 1 byte
    if (a->mv_size > 1 && remainder != 0) {
        return MemCmp(a, b);
    }

    // Size is either 1, 8, 16 or 32 bytes, compare based on integer keys
    using f = std::function<MDB_cmp_func>;
    static std::vector<f> functions{
        ValueCmp<uint8_t>, ValueCmp<uint64_t>, ValueCmp<uint128_t>, MemCmp, ValueCmp<uint256_t>
    };
    return functions[factor](a, b);
}
} // namespace bb::crypto::merkle_tree