#include "merkle_tree/merkle_tree_id.hpp"

#include <stdexcept>
#include <string>

namespace azteclabs::wsdb::merkle_tree {

std::string getMerkleTreeName(MerkleTreeId id)
{
    switch (id) {
    case MerkleTreeId::NULLIFIER_TREE:
        return "NullifierTree";
    case MerkleTreeId::NOTE_HASH_TREE:
        return "NoteHashTree";
    case MerkleTreeId::PUBLIC_DATA_TREE:
        return "PublicDataTree";
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
        return "L1ToL2MessageTree";
    case MerkleTreeId::ARCHIVE:
        return "ArchiveTree";
    default:
        throw std::invalid_argument("Unknown MerkleTreeId");
    }
}

} // namespace azteclabs::wsdb::merkle_tree
