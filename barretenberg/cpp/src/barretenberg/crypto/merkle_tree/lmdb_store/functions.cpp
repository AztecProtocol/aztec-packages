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

int MemCmp(const MDB_val* a, const MDB_val* b)
{
    return std::memcmp(static_cast<char*>(a->mv_data), static_cast<char*>(b->mv_data), a->mv_size);
}

int IntegerKeyCmp(const MDB_val* a, const MDB_val* b)
{
    if (a->mv_size != b->mv_size) {
        return SizeCmp(a, b);
    }
    uint64_t factor = a->mv_size / sizeof(uint64_t);
    uint64_t remainder = a->mv_size % sizeof(uint64_t);

    if (a->mv_size > sizeof(uint256_t)) {
        return MemCmp(a, b);
    }
    if (a->mv_size > 1 && remainder != 0) {
        return MemCmp(a, b);
    }

    using f = std::function<MDB_cmp_func>;
    static std::vector<f> functions{
        ValueCmp<uint8_t>, ValueCmp<uint64_t>, ValueCmp<uint128_t>, MemCmp, ValueCmp<uint256_t>
    };
    return functions[factor](a, b);
}
} // namespace bb::crypto::merkle_tree