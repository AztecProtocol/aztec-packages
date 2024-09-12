#pragma once

#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <cstdint>
#include <variant>

namespace bb::world_state {

enum MerkleTreeId {
    NULLIFIER_TREE = 0,
    NOTE_HASH_TREE = 1,
    PUBLIC_DATA_TREE = 2,
    L1_TO_L2_MESSAGE_TREE = 3,
    ARCHIVE = 4,
};

using TreeStateReference = std::pair<bb::fr, bb::crypto::merkle_tree::index_t>;
using StateReference = std::unordered_map<MerkleTreeId, TreeStateReference>;

struct WorldStateRevision {
    struct FinalisedBlock {
        uint32_t block;
    };

    struct CurrentState {
        bool uncommitted;
    };

    using Revision = std::variant<WorldStateRevision::FinalisedBlock, WorldStateRevision::CurrentState>;
    Revision inner;

    static WorldStateRevision committed() { return { CurrentState{ false } }; }
    static WorldStateRevision uncommitted() { return { CurrentState{ true } }; }
    static WorldStateRevision finalised_block(uint32_t block_number) { return { FinalisedBlock{ block_number } }; }
};
} // namespace bb::world_state
