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
 * because the indexed nullifier tree requires unique, strictly increasing prefilled leaves. These determine the
 * three roots below, and GENESIS_NULLIFIER_TREE_ROOT, GENESIS_BLOCK_HEADER_HASH and GENESIS_ARCHIVE_ROOT in
 * constants.nr, so all of them are rewritten together and never on their own.
 */
inline std::vector<bb::fr> genesis_protocol_nullifiers()
{
    return {
<<<<<<< HEAD:barretenberg/cpp/src/barretenberg/world_state/genesis_protocol_nullifiers.hpp
        bb::fr("0x04287df03953b0d68b0e83e08a89067afc602626defd6002277cd6df34696818"),
        bb::fr("0x0d99507b7ecac720c73bf197a0e7366a5ed80c1c1b0afe8ff8c6ecc7b5a7aefe"),
        bb::fr("0x0eb50b367fb754d3a7d1238bfc105cc9b391a02e187be69038876ae9a502e877"),
        bb::fr("0x1cea539e01abaa5db980e7ff52ef0d2a7772310306ac625783ae435756ee326d"),
        bb::fr("0x2c1eb017f1534e95d91808e7ccc5f24a1cc6bf5686c6b6598e79b6f571d386fe"),
        bb::fr("0x2c3a57c8d7c387652babd36c4d79ab03c0fe593e160315a4dc098f92caf592c3"),
    };
}

} // namespace bb::world_state
=======
        fr("0x04287df03953b0d68b0e83e08a89067afc602626defd6002277cd6df34696818"),
        fr("0x0d99507b7ecac720c73bf197a0e7366a5ed80c1c1b0afe8ff8c6ecc7b5a7aefe"),
        fr("0x0eb50b367fb754d3a7d1238bfc105cc9b391a02e187be69038876ae9a502e877"),
        fr("0x16f917edd8e333013e5bb0633f7f484725bd19403854d6112992dccef4961e32"),
        fr("0x1cea539e01abaa5db980e7ff52ef0d2a7772310306ac625783ae435756ee326d"),
        fr("0x2c3a57c8d7c387652babd36c4d79ab03c0fe593e160315a4dc098f92caf592c3"),
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
    return fr("0x15c67f4d7495a669ed57c5a9468533c63ace43f86b787c52edabefec85e4afc0");
}

inline fr genesis_block_header_hash()
{
    return fr("0x199b52350e8f18eeb9cd455fd074bc6fa62ea6a8e3253e2c663aa4909bbd5718");
}

inline fr genesis_archive_root()
{
    return fr("0x29eb2c527f8d45276430363214e6c8d709ef3f657a3670ebac3179373d41e5c4");
}

} // namespace azteclabs::wsdb::world_state
>>>>>>> a36ddcc1c4c (feat!: bump the contract address domain separator to v3 (#25521)):native-packages/wsdb/cpp/src/world_state/genesis_protocol_nullifiers.hpp
