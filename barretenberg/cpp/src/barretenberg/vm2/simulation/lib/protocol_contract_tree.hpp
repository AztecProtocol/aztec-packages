#pragma once

#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/indexed_memory_tree.hpp"

namespace bb::avm2::simulation {

// Implements the methods expected by indexed_leaf.hpp
struct ProtocolContractLeaf {
    AztecAddress derived_address;

    ProtocolContractLeaf(const AztecAddress& derived_address)
        : derived_address(derived_address)
    {}

    static bool is_updateable();

    bool operator==(ProtocolContractLeaf const& other) const;

    AztecAddress get_key() const;

    bool is_empty() const;

    std::vector<FF> get_hash_inputs(AztecAddress nextKey, AztecAddress nextIndex) const;

    operator uint256_t() const;

    static ProtocolContractLeaf empty();

    static ProtocolContractLeaf padding(index_t i);
};

using ProtocolContractTree = IndexedMemoryTree<ProtocolContractLeaf, Poseidon2HashPolicy>;
using CanonicalAddress = AztecAddress; // The "index" into the tree
using DerivedAddress = AztecAddress;   // The "value" stored at that index

ProtocolContractTree build_tree(const unordered_flat_map<CanonicalAddress, DerivedAddress>& derived_addresses);

} // namespace bb::avm2::simulation
