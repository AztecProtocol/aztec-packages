#pragma once
/**
 * @file wsdb_wire_convert.hpp
 * @brief Wire <-> domain conversion helpers for the aztec-wsdb service.
 *
 * The codegen-emitted wire types in generated/wsdb_types.hpp are POD-shaped
 * (uint32_t for tree IDs, std::array<uint8_t, 32> for field elements, etc).
 * Domain types come from world_state/, crypto/merkle_tree/, ecc/. This file
 * is the single place that translates between them — used by handlers (server
 * side) and by wsdb_ipc_merkle_db.cpp (AVM client side).
 */
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/wsdb/generated/wsdb_types.hpp"

#include <cstring>

namespace bb::wsdb {

inline ::Fr fr_to_wire(const bb::fr& d)
{
    ::Fr r{};
    bb::fr::serialize_to_buffer(d, r.data());
    return r;
}

inline bb::fr fr_from_wire(const ::Fr& w)
{
    return bb::fr::serialize_from_buffer(w.data());
}

inline std::vector<::Fr> fr_vec_to_wire(const std::vector<bb::fr>& d)
{
    std::vector<::Fr> r;
    r.reserve(d.size());
    for (const auto& x : d) {
        r.push_back(fr_to_wire(x));
    }
    return r;
}

inline std::vector<bb::fr> fr_vec_from_wire(const std::vector<::Fr>& w)
{
    std::vector<bb::fr> r;
    r.reserve(w.size());
    for (const auto& x : w) {
        r.push_back(fr_from_wire(x));
    }
    return r;
}

inline wire::WorldStateRevision revision_to_wire(const world_state::WorldStateRevision& d)
{
    return wire::WorldStateRevision{
        .forkId = d.forkId,
        .blockNumber = d.blockNumber,
        .includeUncommitted = d.includeUncommitted,
    };
}

inline world_state::WorldStateRevision revision_from_wire(const wire::WorldStateRevision& w)
{
    return world_state::WorldStateRevision{
        .forkId = w.forkId,
        .blockNumber = w.blockNumber,
        .includeUncommitted = w.includeUncommitted,
    };
}

inline uint32_t tree_id_to_wire(world_state::MerkleTreeId d)
{
    return static_cast<uint32_t>(d);
}

inline world_state::MerkleTreeId tree_id_from_wire(uint32_t w)
{
    return static_cast<world_state::MerkleTreeId>(w);
}

// StateReference: domain unordered_map<MerkleTreeId, pair<fr, index_t>>.
// Wire: unordered_map<uint32_t, pair<vector<uint8_t>, uint64_t>>, where the
// inner vector<uint8_t> holds the msgpack-encoded `fr` (preserving the
// canonical 34-byte bin8-prefixed encoding for AVM <-> wsdb roundtrip).
inline std::unordered_map<uint32_t, std::pair<std::vector<uint8_t>, uint64_t>> state_reference_to_wire(
    const world_state::StateReference& d)
{
    std::unordered_map<uint32_t, std::pair<std::vector<uint8_t>, uint64_t>> r;
    r.reserve(d.size());
    for (const auto& [tree_id, tree_ref] : d) {
        msgpack::sbuffer buf;
        msgpack::pack(buf, tree_ref.first);
        std::vector<uint8_t> root_bytes(buf.data(), buf.data() + buf.size());
        r.emplace(static_cast<uint32_t>(tree_id), std::make_pair(std::move(root_bytes), tree_ref.second));
    }
    return r;
}

inline world_state::StateReference state_reference_from_wire(
    const std::unordered_map<uint32_t, std::pair<std::vector<uint8_t>, uint64_t>>& w)
{
    world_state::StateReference r;
    r.reserve(w.size());
    for (const auto& [tree_id, p] : w) {
        const auto& root_bytes = p.first;
        bb::fr root_fr;
        auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(root_bytes.data()), root_bytes.size());
        unpacked.get().convert(root_fr);
        r.emplace(static_cast<world_state::MerkleTreeId>(tree_id),
                  world_state::TreeStateReference{ root_fr, static_cast<crypto::merkle_tree::index_t>(p.second) });
    }
    return r;
}

// Generic msgpack roundtrip — for status/meta types whose wire and domain
// representations have isomorphic SERIALIZATION_FIELDS shapes (same field
// names + msgpack-compatible field types). Cheaper to roundtrip the bytes
// than to write field-by-field accessors for ~20 fields.
template <typename Wire, typename Domain> inline Wire msgpack_roundtrip_to_wire(const Domain& d)
{
    msgpack::sbuffer buf;
    msgpack::pack(buf, d);
    auto unpacked = msgpack::unpack(buf.data(), buf.size());
    Wire w;
    unpacked.get().convert(w);
    return w;
}

template <typename Domain, typename Wire> inline Domain msgpack_roundtrip_from_wire(const Wire& w)
{
    msgpack::sbuffer buf;
    msgpack::pack(buf, w);
    auto unpacked = msgpack::unpack(buf.data(), buf.size());
    Domain d;
    unpacked.get().convert(d);
    return d;
}

} // namespace bb::wsdb
