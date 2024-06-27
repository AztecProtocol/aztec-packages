#include "barretenberg/crypto/merkle_tree/lmdb_store/functions.hpp"
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

int Invalid(const MDB_val*, const MDB_val*)
{
    throw std::runtime_error("Invalid comparison");
}

int IntegerKeyCmp(const MDB_val* a, const MDB_val* b)
{
    if (a->mv_size != b->mv_size) {
        return SizeCmp(a, b);
    }

    using f_type = std::function<MDB_cmp_func>;
    static std::vector<f_type> functions{
        ValueCmp<uint8_t>, ValueCmp<uint64_t>, ValueCmp<uint128_t>, Invalid, ValueCmp<uint256_t>
    };
    return functions[a->mv_size / 8](a, b);
}
} // namespace bb::crypto::merkle_tree