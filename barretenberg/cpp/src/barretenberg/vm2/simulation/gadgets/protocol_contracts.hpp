#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/common/set.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/protocol_contract_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/merkle_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/interfaces/protocol_contracts.hpp"
#include "barretenberg/vm2/simulation/lib/protocol_contract_tree.hpp"

namespace bb::avm2::simulation {

using CanonicalAddress = AztecAddress;
using DerivedAddress = AztecAddress;

class ProtocolContractIndexedTree : public ProtocolContractSetInterface {

  public:
    ProtocolContractIndexedTree(const std::vector<ProtocolContractAddressHint>& protocol_contract_address_hints,
                                FieldGreaterThan& gt,
                                Poseidon2Interface& poseidon2,
                                MerkleCheckInterface& merkle_check,
                                EventEmitterInterface<GetProtocolContractDerivedAddressEvent>& events);

    bool contains(const AztecAddress& canonical_address) override;
    AztecAddress get_derived_address(const AztecAddress& canonical_address) override;

  private:
    EventEmitterInterface<GetProtocolContractDerivedAddressEvent>& events;
    FieldGreaterThan gt;
    Poseidon2Interface& poseidon2;
    MerkleCheckInterface& merkle_check;

    unordered_flat_map<CanonicalAddress, DerivedAddress> derived_addresses;
    // Need the mutable here to strip the constness resulting from build_tree
    mutable std::optional<ProtocolContractTree> tree;

    const ProtocolContractTree& get_tree() const;
    void assert_set_membership(const AztecAddress& canonical_address, const AztecAddress& derived_address);

    // Cache for derived address retrieval to avoid repeating retrievals and event emissions
    unordered_flat_set<AztecAddress> cached_derived_address_retrievals;
};

} // namespace bb::avm2::simulation
