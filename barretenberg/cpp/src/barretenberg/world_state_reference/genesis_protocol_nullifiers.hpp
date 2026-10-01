// GENERATED FILE - DO NOT EDIT.
// Regenerate with noir-projects/fnd/scripts/regenerate_genesis_constants.sh.
#pragma once

#include "barretenberg/ecc/curves/bn254/fr.hpp"

#include <vector>

namespace bb::world_state {

/**
 * @brief The protocol contracts' registration nullifiers, seeded into the nullifier tree of a production genesis.
 *
 * Derived from the protocol contract artifacts: per protocol contract, the class registration nullifier siloed by
 * ContractClassRegistry and the instance publication nullifier siloed by ContractInstanceRegistry. Sorted ascending
 * because the indexed nullifier tree requires unique, strictly increasing prefilled leaves. These determine
 * GENESIS_NULLIFIER_TREE_ROOT, GENESIS_BLOCK_HEADER_HASH and GENESIS_ARCHIVE_ROOT, so they are rewritten together
 * with those constants and never on their own.
 */
inline std::vector<bb::fr> genesis_protocol_nullifiers()
{
    return {
        bb::fr("0x04287df03953b0d68b0e83e08a89067afc602626defd6002277cd6df34696818"),
        bb::fr("0x0d99507b7ecac720c73bf197a0e7366a5ed80c1c1b0afe8ff8c6ecc7b5a7aefe"),
        bb::fr("0x0eb50b367fb754d3a7d1238bfc105cc9b391a02e187be69038876ae9a502e877"),
        bb::fr("0x1cea539e01abaa5db980e7ff52ef0d2a7772310306ac625783ae435756ee326d"),
        bb::fr("0x2c1eb017f1534e95d91808e7ccc5f24a1cc6bf5686c6b6598e79b6f571d386fe"),
        bb::fr("0x2c3a57c8d7c387652babd36c4d79ab03c0fe593e160315a4dc098f92caf592c3"),
    };
}

} // namespace bb::world_state
