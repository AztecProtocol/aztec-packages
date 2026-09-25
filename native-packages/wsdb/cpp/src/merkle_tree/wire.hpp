#pragma once
/**
 * @file wire.hpp
 * @brief The boundary between wsdb's domain types and the generated wire types.
 *
 * The generated `wire::` records (wsdb_schema.jsonc) are the only serialisation types: they
 * cross the IPC boundary and are what the lmdb store writes. Most domain records simply *are*
 * the wire record (`using TreeMeta = wire::TreeMeta`). The types below carry behaviour the
 * wire record cannot (field arithmetic/ordering, leaf hashing, templated leaf kinds) and so
 * keep their own identity; `Wire<T>` names their wire counterpart and converts both ways.
 *
 *   to_wire(x)              domain -> wire
 *   from_wire<Domain>(w)    wire -> domain
 *
 * Both are identity for types that are already wire records, and element-wise for vectors.
 */
#include "field/field_element.hpp"
#include "merkle_tree/indexed_leaf.hpp"
#include "merkle_tree/merkle_tree_id.hpp"
#include "merkle_tree/response.hpp"
#include "wsdb/generated/ipc_codegen/msgpack_adaptor.hpp"
#include "wsdb/generated/wsdb_types.hpp"
#include <msgpack.hpp>
#include <optional>
#include <utility>
#include <vector>

namespace azteclabs::wsdb::merkle_tree {

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

template <> struct Wire<fr> {
    using type = wire::Fr;
    static type to(const fr& d) { return d; }
    static fr from(const type& w) { return w; }
};

template <> struct Wire<MerkleTreeId> {
    using type = wire::MerkleTreeId;
    static type to(MerkleTreeId d) { return static_cast<type>(d); }
    static MerkleTreeId from(type w) { return static_cast<MerkleTreeId>(w); }
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
    static std::vector<T> from(const type& w)
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
    static std::optional<T> from(const type& w) { return w ? std::optional<T>(Wire<T>::from(*w)) : std::nullopt; }
};

/// The wire records of one leaf kind.
template <typename Leaf> struct WireOf;
template <> struct WireOf<PublicDataLeafValue> {
    using leaf = wire::PublicDataLeafValue;
    using indexed = wire::IndexedPublicDataLeafValue;
    using witness = wire::PublicDataLeafUpdateWitnessData;
    using sorted = wire::SortedPublicDataLeaf;
    using batch = wire::BatchInsertionResultPublicData;
    using sequential = wire::SequentialInsertionResultPublicData;
};
template <> struct WireOf<NullifierLeafValue> {
    using leaf = wire::NullifierLeafValue;
    using indexed = wire::IndexedNullifierLeafValue;
    using witness = wire::NullifierLeafUpdateWitnessData;
    using sorted = wire::SortedNullifierLeaf;
    using batch = wire::BatchInsertionResultNullifier;
    using sequential = wire::SequentialInsertionResultNullifier;
};

template <> struct Wire<PublicDataLeafValue> {
    using type = wire::PublicDataLeafValue;
    static type to(const PublicDataLeafValue& d) { return { .slot = d.slot, .value = d.value }; }
    static PublicDataLeafValue from(const type& w) { return { w.slot, w.value }; }
};

template <> struct Wire<NullifierLeafValue> {
    using type = wire::NullifierLeafValue;
    static type to(const NullifierLeafValue& d) { return { .nullifier = d.nullifier }; }
    static NullifierLeafValue from(const type& w) { return { w.nullifier }; }
};

template <typename L> struct Wire<IndexedLeaf<L>> {
    using type = typename WireOf<L>::indexed;
    static type to(const IndexedLeaf<L>& d)
    {
        return { .leaf = to_wire(d.leaf), .nextIndex = d.nextIndex, .nextKey = d.nextKey };
    }
    static IndexedLeaf<L> from(const type& w) { return { from_wire<L>(w.leaf), w.nextIndex, w.nextKey }; }
};

template <typename L> struct Wire<LeafUpdateWitnessData<L>> {
    using type = typename WireOf<L>::witness;
    static type to(const LeafUpdateWitnessData<L>& d)
    {
        return { .leaf = to_wire(d.leaf), .index = d.index, .path = to_wire(d.path) };
    }
    static LeafUpdateWitnessData<L> from(const type& w)
    {
        return { from_wire<IndexedLeaf<L>>(w.leaf), w.index, from_wire<fr_sibling_path>(w.path) };
    }
};

template <typename L> struct Wire<BatchInsertionResult<L>> {
    using type = typename WireOf<L>::batch;
    static type to(const BatchInsertionResult<L>& d)
    {
        std::vector<typename WireOf<L>::sorted> sorted;
        sorted.reserve(d.sortedLeaves.size());
        for (const auto& [leaf, index] : d.sortedLeaves) {
            sorted.push_back({ .leaf = to_wire(leaf), .index = index });
        }
        return { .lowLeafWitnessData = to_wire(d.lowLeafWitnessData),
                 .sortedLeaves = std::move(sorted),
                 .subtreePath = to_wire(d.subtreePath) };
    }
    static BatchInsertionResult<L> from(const type& w)
    {
        BatchInsertionResult<L> r;
        r.lowLeafWitnessData = from_wire<std::vector<LeafUpdateWitnessData<L>>>(w.lowLeafWitnessData);
        r.sortedLeaves.reserve(w.sortedLeaves.size());
        for (const auto& x : w.sortedLeaves) {
            r.sortedLeaves.emplace_back(from_wire<L>(x.leaf), x.index);
        }
        r.subtreePath = from_wire<fr_sibling_path>(w.subtreePath);
        return r;
    }
};

template <typename L> struct Wire<SequentialInsertionResult<L>> {
    using type = typename WireOf<L>::sequential;
    static type to(const SequentialInsertionResult<L>& d)
    {
        return { .lowLeafWitnessData = to_wire(d.lowLeafWitnessData),
                 .insertionWitnessData = to_wire(d.insertionWitnessData) };
    }
    static SequentialInsertionResult<L> from(const type& w)
    {
        return { .lowLeafWitnessData = from_wire<std::vector<LeafUpdateWitnessData<L>>>(w.lowLeafWitnessData),
                 .insertionWitnessData = from_wire<std::vector<LeafUpdateWitnessData<L>>>(w.insertionWitnessData) };
    }
};

} // namespace azteclabs::wsdb::merkle_tree

// The lmdb store's private payload records hold field elements; they serialise through the
// wire scalar rather than giving FieldElement a codec of its own.
namespace msgpack::adaptor {
template <> struct pack<azteclabs::wsdb::FieldElement> {
    template <typename Stream>
    msgpack::packer<Stream>& operator()(msgpack::packer<Stream>& o, const azteclabs::wsdb::FieldElement& v) const
    {
        return o.pack(azteclabs::wsdb::wire::Fr(v));
    }
};
template <> struct convert<azteclabs::wsdb::FieldElement> {
    const msgpack::object& operator()(const msgpack::object& o, azteclabs::wsdb::FieldElement& v) const
    {
        azteclabs::wsdb::wire::Fr w;
        o.convert(w);
        v = w;
        return o;
    }
};
} // namespace msgpack::adaptor
