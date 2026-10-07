#pragma once
/**
 * @file wsdb_wire.hpp
 * @brief The boundary between bb's merkle-tree domain types and the generated wsdb wire types.
 *
 * The generated `wire::` records (native-packages/wsdb/wsdb_schema.jsonc) are the serialisation
 * types; bb's own merkle types are what the AVM computes with. `Wire<T>` names a domain type's
 * wire counterpart and converts both ways:
 *
 *   to_wire(x)              domain -> wire
 *   from_wire<Domain>(w)    wire -> domain
 *
 * Both are identity for types that are already wire records, and element-wise for vectors.
 * This mirrors native-packages/wsdb/cpp/src/merkle_tree/wire.hpp on the server side.
 */
#include "barretenberg/crypto/merkle_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/vm2_wsdb/generated/wsdb_types.hpp"
#include "barretenberg/world_state_reference/merkle_tree_id.hpp"
#include <optional>
#include <utility>
#include <vector>

namespace bb::wsdb {

template <typename W>
concept Bin32Wire = requires { typename W::IPC_CODEGEN_BIN32_ALIAS; };

/// Identity: the domain type is the wire record.
template <typename T> struct Wire {
    using type = T;
    static const T& to(const T& d) { return d; }
    static const T& from(const T& w) { return w; }
};

template <typename T> using wire_t = typename Wire<T>::type;

template <typename T> auto to_wire(const T& d) -> decltype(Wire<T>::to(d))
{
    return Wire<T>::to(d);
}
template <typename Domain, typename W> Domain from_wire(const W& w)
{
    return Wire<Domain>::from(w);
}

/// A field element converts to whichever bin32 wire alias the call site expects (`wire::Fr`,
/// `wire::Nullifier`, ...): all of them carry the same 32 canonical bytes under a nominal tag.
struct FrToWire {
    const bb::fr& value;
    template <Bin32Wire W> operator W() const
    {
        W r{};
        bb::fr::serialize_to_buffer(value, r.data());
        return r;
    }
};
template <> struct Wire<bb::fr> {
    using type = wire::Fr;
    static FrToWire to(const bb::fr& d) { return { d }; }
    template <Bin32Wire W> static bb::fr from(const W& w) { return bb::fr::serialize_from_buffer(w.data()); }
};

template <> struct Wire<world_state::MerkleTreeId> {
    using type = wire::MerkleTreeId;
    static type to(world_state::MerkleTreeId d) { return static_cast<type>(d); }
    static world_state::MerkleTreeId from(type w) { return static_cast<world_state::MerkleTreeId>(w); }
};

template <> struct Wire<world_state::WorldStateRevision> {
    using type = wire::WorldStateRevision;
    static type to(const world_state::WorldStateRevision& d)
    {
        return { .forkId = d.forkId, .blockNumber = d.blockNumber, .includeUncommitted = d.includeUncommitted };
    }
    static world_state::WorldStateRevision from(const type& w)
    {
        return { .forkId = w.forkId, .blockNumber = w.blockNumber, .includeUncommitted = w.includeUncommitted };
    }
};

template <typename T> struct Wire<std::vector<T>> {
    using type = std::vector<wire_t<T>>;
    static type to(const std::vector<T>& d)
    {
        type r;
        r.reserve(d.size());
        for (const auto& x : d) {
            r.push_back(Wire<T>::to(x));
        }
        return r;
    }
    template <typename W> static std::vector<T> from(const std::vector<W>& w)
    {
        std::vector<T> r;
        r.reserve(w.size());
        for (const auto& x : w) {
            r.push_back(Wire<T>::from(x));
        }
        return r;
    }
};

template <typename T> struct Wire<std::optional<T>> {
    using type = std::optional<wire_t<T>>;
    static type to(const std::optional<T>& d) { return d ? type(Wire<T>::to(*d)) : std::nullopt; }
    template <typename W> static std::optional<T> from(const std::optional<W>& w)
    {
        return w ? std::optional<T>(Wire<T>::from(*w)) : std::nullopt;
    }
};

/// The wire records of one leaf kind.
template <typename Leaf> struct WireOf;
template <> struct WireOf<crypto::merkle_tree::PublicDataLeafValue> {
    using leaf = wire::PublicDataLeafValue;
    using indexed = wire::IndexedPublicDataLeafValue;
    using witness = wire::PublicDataLeafUpdateWitnessData;
    using sorted = wire::SortedPublicDataLeaf;
    using batch = wire::BatchInsertionResultPublicData;
    using sequential = wire::SequentialInsertionResultPublicData;
};
template <> struct WireOf<crypto::merkle_tree::NullifierLeafValue> {
    using leaf = wire::NullifierLeafValue;
    using indexed = wire::IndexedNullifierLeafValue;
    using witness = wire::NullifierLeafUpdateWitnessData;
    using sorted = wire::SortedNullifierLeaf;
    using batch = wire::BatchInsertionResultNullifier;
    using sequential = wire::SequentialInsertionResultNullifier;
};

template <> struct Wire<crypto::merkle_tree::PublicDataLeafValue> {
    using type = wire::PublicDataLeafValue;
    static type to(const crypto::merkle_tree::PublicDataLeafValue& d)
    {
        return { .slot = to_wire(d.slot), .value = to_wire(d.value) };
    }
    static crypto::merkle_tree::PublicDataLeafValue from(const type& w)
    {
        return { from_wire<bb::fr>(w.slot), from_wire<bb::fr>(w.value) };
    }
};

template <> struct Wire<crypto::merkle_tree::NullifierLeafValue> {
    using type = wire::NullifierLeafValue;
    static type to(const crypto::merkle_tree::NullifierLeafValue& d) { return { .nullifier = to_wire(d.nullifier) }; }
    static crypto::merkle_tree::NullifierLeafValue from(const type& w) { return { from_wire<bb::fr>(w.nullifier) }; }
};

template <typename L> struct Wire<crypto::merkle_tree::IndexedLeaf<L>> {
    using type = typename WireOf<L>::indexed;
    static type to(const crypto::merkle_tree::IndexedLeaf<L>& d)
    {
        return { .leaf = to_wire(d.leaf), .nextIndex = d.nextIndex, .nextKey = to_wire(d.nextKey) };
    }
    static crypto::merkle_tree::IndexedLeaf<L> from(const type& w)
    {
        return { from_wire<L>(w.leaf), w.nextIndex, from_wire<bb::fr>(w.nextKey) };
    }
};

template <typename L> struct Wire<crypto::merkle_tree::LeafUpdateWitnessData<L>> {
    using type = typename WireOf<L>::witness;
    static type to(const crypto::merkle_tree::LeafUpdateWitnessData<L>& d)
    {
        return { .leaf = to_wire(d.leaf), .index = d.index, .path = to_wire(d.path) };
    }
    static crypto::merkle_tree::LeafUpdateWitnessData<L> from(const type& w)
    {
        return { from_wire<crypto::merkle_tree::IndexedLeaf<L>>(w.leaf),
                 w.index,
                 from_wire<crypto::merkle_tree::fr_sibling_path>(w.path) };
    }
};

template <typename L> struct Wire<crypto::merkle_tree::BatchInsertionResult<L>> {
    using type = typename WireOf<L>::batch;
    static type to(const crypto::merkle_tree::BatchInsertionResult<L>& d)
    {
        std::vector<typename WireOf<L>::sorted> sorted;
        sorted.reserve(d.sorted_leaves.size());
        for (const auto& [leaf, index] : d.sorted_leaves) {
            sorted.push_back({ .leaf = to_wire(leaf), .index = index });
        }
        return { .lowLeafWitnessData = to_wire(d.low_leaf_witness_data),
                 .sortedLeaves = std::move(sorted),
                 .subtreePath = to_wire(d.subtree_path) };
    }
    static crypto::merkle_tree::BatchInsertionResult<L> from(const type& w)
    {
        crypto::merkle_tree::BatchInsertionResult<L> r;
        r.low_leaf_witness_data =
            from_wire<std::vector<crypto::merkle_tree::LeafUpdateWitnessData<L>>>(w.lowLeafWitnessData);
        r.sorted_leaves.reserve(w.sortedLeaves.size());
        for (const auto& x : w.sortedLeaves) {
            r.sorted_leaves.emplace_back(from_wire<L>(x.leaf), x.index);
        }
        r.subtree_path = from_wire<crypto::merkle_tree::fr_sibling_path>(w.subtreePath);
        return r;
    }
};

template <typename L> struct Wire<crypto::merkle_tree::SequentialInsertionResult<L>> {
    using type = typename WireOf<L>::sequential;
    static type to(const crypto::merkle_tree::SequentialInsertionResult<L>& d)
    {
        return { .lowLeafWitnessData = to_wire(d.low_leaf_witness_data),
                 .insertionWitnessData = to_wire(d.insertion_witness_data) };
    }
    static crypto::merkle_tree::SequentialInsertionResult<L> from(const type& w)
    {
        return { .low_leaf_witness_data =
                     from_wire<std::vector<crypto::merkle_tree::LeafUpdateWitnessData<L>>>(w.lowLeafWitnessData),
                 .insertion_witness_data =
                     from_wire<std::vector<crypto::merkle_tree::LeafUpdateWitnessData<L>>>(w.insertionWitnessData) };
    }
};

} // namespace bb::wsdb
