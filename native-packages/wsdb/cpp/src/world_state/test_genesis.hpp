#pragma once

#include "field/field_element.hpp"

#include <vector>

namespace azteclabs::wsdb::world_state {

/**
 * @brief A fixed genesis for the world state tests: a few arbitrary nullifiers and the roots they produce.
 *
 * Deliberately not the protocol's canonical genesis, which is derived from the protocol contracts and belongs to a
 * protocol release (protocol/genesis): the world state does not depend on those contracts, so its tests do not move
 * when they do. The values only change if tree or header hashing does, which is what the tests guard against. The roots
 * come from the protocol's tree heights and initial sizes with these nullifiers prefilled, nothing else, timestamp 0.
 * They are the same values barretenberg's reference world state tests use (world_state_reference/test_genesis.hpp).
 */
inline std::vector<fr> test_genesis_nullifiers()
{
    return { fr(1001), fr(1002), fr(1003), fr(1004) };
}

inline fr test_genesis_nullifier_tree_root()
{
    return fr("0x0984ef292acf8583425681d911aa8400cf8c4dd0aba654bf7fdb6bc7ca66e557");
}

inline fr test_genesis_block_header_hash()
{
    return fr("0x08b92313c593864831f26da386e681c16556a64d685c3bfd1df38094a0dfce99");
}

inline fr test_genesis_archive_root()
{
    return fr("0x10ea75cb7e7d8e6e78fbf2866a9113e9471d810c6092bddb1be75603b079a972");
}

} // namespace azteclabs::wsdb::world_state
