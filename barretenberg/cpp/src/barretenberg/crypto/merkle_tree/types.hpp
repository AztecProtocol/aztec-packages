#pragma once

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <cstdint>
namespace bb::crypto::merkle_tree {
using index_t = uint64_t;

struct RequestContext {
    bool includeUncommitted;
    bool latestBlock;
    index_t blockNumber;
    bb::fr root;
    index_t sizeAtBlock;
};
} // namespace bb::crypto::merkle_tree