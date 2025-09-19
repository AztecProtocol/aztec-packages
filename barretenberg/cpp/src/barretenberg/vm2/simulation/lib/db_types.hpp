#pragma once

#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

using NullifierTreeLeafPreimage = crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::NullifierLeafValue>;
using PublicDataTreeLeafPreimage = crypto::merkle_tree::IndexedLeaf<crypto::merkle_tree::PublicDataLeafValue>;

} // namespace bb::avm2::simulation
