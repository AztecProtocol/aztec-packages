#pragma once

#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <cstdint>
#include <ostream>
#include <sstream>
#include <string>
#include <vector>

namespace bb::crypto::merkle_tree {

const uint32_t NUM_VALUES = 1024;
inline auto& engine = numeric::get_debug_randomness();
inline auto& random_engine = numeric::get_randomness();

static auto create_values = [](uint32_t num_values = NUM_VALUES) {
    std::vector<fr> values(num_values);
    for (uint32_t i = 0; i < num_values; ++i) {
        values[i] = fr(random_engine.get_random_uint256());
    }
    return values;
};

static std::vector<fr> VALUES = create_values();

inline std::string random_string()
{
    std::stringstream ss;
    ss << random_engine.get_random_uint256();
    return ss.str();
}

inline std::string random_temp_directory()
{
    std::stringstream ss;
    ss << "/tmp/lmdb/" << random_string();
    return ss.str();
}

inline void print_tree(const uint32_t depth, std::vector<fr> hashes, std::string const& msg)
{
    info("\n", msg);
    uint32_t offset = 0;
    for (uint32_t i = 0; i < depth; i++) {
        info("i = ", i);
        uint32_t layer_size = (1U << (depth - i));
        for (uint32_t j = 0; j < layer_size; j++) {
            info("j = ", j, ": ", hashes[offset + j]);
        }
        offset += layer_size;
    }
}

using ThreadPoolPtr = std::shared_ptr<ThreadPool>;

inline ThreadPoolPtr make_thread_pool(uint64_t numThreads)
{
    return std::make_shared<ThreadPool>(numThreads);
}

void inline print_store_data(LMDBTreeStore::SharedPtr db, std::ostream& os)
{
    LMDBTreeStore::ReadTransaction::Ptr tx = db->create_read_transaction();
    TreeDBStats stats;
    db->get_stats(stats, *tx);

    os << stats;
}
} // namespace bb::crypto::merkle_tree