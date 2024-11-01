#pragma once

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <cstdint>
#include <optional>
namespace bb::crypto::merkle_tree {
using index_t = uint64_t;

struct RequestContext {
    bool includeUncommitted;
    std::optional<index_t> blockNumber;
    bb::fr root;
};
} // namespace bb::crypto::merkle_tree