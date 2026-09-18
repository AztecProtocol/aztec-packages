// GENERATED FILE - DO NOT EDIT.
// Regenerate with noir-projects/fnd/scripts/regenerate_genesis_constants.sh.
#pragma once

#include "field/field_element.hpp"

#include <vector>

namespace azteclabs::wsdb::world_state {

/**
 * @brief The protocol contracts' registration nullifiers, seeded into the nullifier tree of a production genesis.
 *
 * Derived from the protocol contract artifacts: per protocol contract, the class registration nullifier siloed by
 * ContractClassRegistry and the instance publication nullifier siloed by ContractInstanceRegistry. Sorted ascending
 * because the indexed nullifier tree requires unique, strictly increasing prefilled leaves. These determine
 * GENESIS_NULLIFIER_TREE_ROOT, GENESIS_BLOCK_HEADER_HASH and GENESIS_ARCHIVE_ROOT, so they are rewritten together
 * with those constants and never on their own.
 */
inline std::vector<fr> genesis_protocol_nullifiers()
{
    return {
        fr("0x0d99507b7ecac720c73bf197a0e7366a5ed80c1c1b0afe8ff8c6ecc7b5a7aefe"),
        fr("0x0eb50b367fb754d3a7d1238bfc105cc9b391a02e187be69038876ae9a502e877"),
        fr("0x19abee68e5a38d84af5a572b116d0f7ad75e2f37436282f66d98b79ed188ad84"),
        fr("0x1cea539e01abaa5db980e7ff52ef0d2a7772310306ac625783ae435756ee326d"),
        fr("0x227e7f5e17eb474dea5aeba8d5e515e4c67c9ea86d6c873f07c145681b1a1ea5"),
        fr("0x270362ee3cfed58db7e3d28f732d3d68b47a4b2efdf20bb96af27e02a6203dc4"),
    };
}

} // namespace azteclabs::wsdb::world_state
