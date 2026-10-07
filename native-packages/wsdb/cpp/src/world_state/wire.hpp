#pragma once
#include "merkle_tree/wire.hpp"
#include "world_state/types.hpp"

namespace azteclabs::wsdb::merkle_tree {

// The state reference is keyed by tree on the domain side and a list on the wire.
template <> struct Wire<world_state::StateReference> {
    using type = std::vector<wire::TreeStateReference>;
    static type to(const world_state::StateReference& d)
    {
        type r;
        r.reserve(d.size());
        for (const auto& [tree_id, tree_ref] : d) {
            r.push_back({ .treeId = to_wire(tree_id), .root = tree_ref.first, .size = tree_ref.second });
        }
        return r;
    }
    static world_state::StateReference from(const type& w)
    {
        world_state::StateReference r;
        r.reserve(w.size());
        for (const auto& entry : w) {
            r.emplace(from_wire<MerkleTreeId>(entry.treeId), world_state::TreeStateReference{ entry.root, entry.size });
        }
        return r;
    }
};

} // namespace azteclabs::wsdb::merkle_tree
