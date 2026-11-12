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
 * because the indexed nullifier tree requires unique, strictly increasing prefilled leaves. These determine the
 * three roots below, and GENESIS_NULLIFIER_TREE_ROOT, GENESIS_BLOCK_HEADER_HASH and GENESIS_ARCHIVE_ROOT in
 * constants.nr, so all of them are rewritten together and never on their own.
 */
inline std::vector<fr> genesis_protocol_nullifiers()
{
    return {
        fr("0x04287df03953b0d68b0e83e08a89067afc602626defd6002277cd6df34696818"),
        fr("0x0d99507b7ecac720c73bf197a0e7366a5ed80c1c1b0afe8ff8c6ecc7b5a7aefe"),
        fr("0x0eb50b367fb754d3a7d1238bfc105cc9b391a02e187be69038876ae9a502e877"),
        fr("0x16f917edd8e333013e5bb0633f7f484725bd19403854d6112992dccef4961e32"),
        fr("0x1cea539e01abaa5db980e7ff52ef0d2a7772310306ac625783ae435756ee326d"),
        fr("0x268b77cfa59397698ab19812d17573156d9a964fae96ab2d80929882f4a93837"),
    };
}

/**
 * @brief The genesis roots the seed vector above produces.
 *
 * Measured from the protocol contract artifacts together with the seeds, so that this package can check its tree
 * implementation against them without reaching for the protocol constants: the GENESIS_* macros in
 * common/aztec_constants.hpp come from the release named in foundation.pin, which lags this tree whenever the genesis
 * moves. constants.nr remains the protocol's source of truth, and is held to this same measurement by the script that
 * writes this file.
 */
inline fr genesis_nullifier_tree_root()
{
    return fr("0x238a0a0523fa750b77e243f8d6f485f03e90f1319fe76f5876f4af3d88b3fa89");
}

inline fr genesis_block_header_hash()
{
    return fr("0x0a72ed6f85f785d34e0a09a57c971b1623bb579531f3b85325e1d60f8209b3b8");
}

inline fr genesis_archive_root()
{
    return fr("0x1fdfe7b76afd4dc9b9b6bd09f5fd6fb354f22cf7055ef1f11490b55a4e197291");
}

} // namespace azteclabs::wsdb::world_state
