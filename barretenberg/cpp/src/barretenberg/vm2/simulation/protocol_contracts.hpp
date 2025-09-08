#pragma once

#include <unordered_map>
#include <unordered_set>

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/protocol_contract_event.hpp"
#include "barretenberg/vm2/simulation/lib/indexed_memory_tree.hpp"
#include "barretenberg/vm2/simulation/merkle_check.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"

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
using CanonicalAddress = AztecAddress;
using DerivedAddress = AztecAddress;

class ProtocolContractSetInterface {
  public:
    virtual ~ProtocolContractSetInterface() = default;
    virtual bool contains(const AztecAddress& canonical_address) const = 0;
    virtual AztecAddress get_derived_address(const AztecAddress& canonical_address) = 0;
};

class ProtocolContractIndexedTree : public ProtocolContractSetInterface {

  public:
    ProtocolContractIndexedTree(
        const std::unordered_map<CanonicalAddress, DerivedAddress>& protocol_contract_address_hints,
        Poseidon2Interface& poseidon2,
        MerkleCheckInterface& merkle_check,
        EventEmitterInterface<GetProtocolContractDerivedAddressEvent>& events)
        : events(events)
        , poseidon2(poseidon2)
        , merkle_check(merkle_check)
        , derived_addresses(protocol_contract_address_hints)
    {}

    bool contains(const AztecAddress& canonical_address) const override;
    AztecAddress get_derived_address(const AztecAddress& canonical_address) override;

  private:
    EventEmitterInterface<GetProtocolContractDerivedAddressEvent>& events;
    Poseidon2Interface& poseidon2;
    MerkleCheckInterface& merkle_check;

    std::unordered_map<CanonicalAddress, DerivedAddress> derived_addresses;
    // Need the mutable here to strip the constness resulting from build_tree
    mutable std::optional<ProtocolContractTree> tree;

    const ProtocolContractTree& get_tree() const;
    ProtocolContractTree build_tree() const;
    void assert_set_membership(const AztecAddress& canonical_address, const AztecAddress& derived_address);

    // Cache for derived address retrieval to avoid repeating retrievals and event emissions
    std::unordered_set<AztecAddress> cached_derived_address_retrievals;
};

} // namespace bb::avm2::simulation
