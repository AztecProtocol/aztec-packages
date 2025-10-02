#include "barretenberg/vm2/simulation/gadgets/protocol_contracts.hpp"

#include <cstdint>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/lib/protocol_contract_tree.hpp"

namespace bb::avm2::simulation {

ProtocolContractIndexedTree::ProtocolContractIndexedTree(
    const std::vector<ProtocolContractAddressHint>& protocol_contract_address_hints,
    FieldGreaterThan& gt,
    Poseidon2Interface& poseidon2,
    MerkleCheckInterface& merkle_check,
    EventEmitterInterface<GetProtocolContractDerivedAddressEvent>& events)
    : events(events)
    , gt(gt)
    , poseidon2(poseidon2)
    , merkle_check(merkle_check)
{
    for (const auto& [canonical_addr, derived_addr] : protocol_contract_address_hints) {
        derived_addresses[static_cast<uint8_t>(canonical_addr)] = derived_addr;
    }
}

bool ProtocolContractIndexedTree::contains(const AztecAddress& canonical_address)
{
    // Canonical addresses must be in the range 1 <= canonical_address <= MAX_PROTOCOL_CONTRACT_ADDRESS
    // We can re-interpret this to utilise the field greater-than operation by subtracting 1
    // canonical_address - 1 < MAX_PROTOCOL_CONTRACT_ADDRESS
    if (!gt.ff_gt(MAX_PROTOCOL_CONTRACT_ADDRESS, canonical_address - 1)) {
        return false;
    }
    return derived_addresses.contains(canonical_address);
}

AztecAddress ProtocolContractIndexedTree::get_derived_address(const AztecAddress& canonical_address)
{
    assert(contains(canonical_address) &&
           "Can only get derived address for known protocol contract canonical addresses");

    auto derived_address = derived_addresses.at(canonical_address);
    assert_set_membership(canonical_address, derived_address);
    return derived_address;
}

void ProtocolContractIndexedTree::assert_set_membership(const AztecAddress& canonical_address,
                                                        const AztecAddress& derived_address)
{
    if (cached_derived_address_retrievals.contains(derived_address)) {
        // Already proved membership before - cache hit, don't emit event
        return;
    }

    auto tree = get_tree();
    auto [exists, leaf_index] = tree.get_low_indexed_leaf(derived_address);
    // While we don't plan on performing non-membership checks
    if (!exists || leaf_index != static_cast<uint8_t>(canonical_address)) {
        // If the derived address doesn't exist in the tree, or it exists at a different index
        throw std::runtime_error("Protocol contract derived address membership check failed");
    }
    auto sibling_path = tree.get_sibling_path(leaf_index);
    IndexedLeaf<ProtocolContractLeaf> leaf_preimage = tree.get_leaf_preimage(leaf_index);

    // Leaf membership - leaf_hash = hash({address, next_address})
    FF leaf_hash = poseidon2.hash(leaf_preimage.get_hash_inputs());
    auto snapshot = tree.get_snapshot();
    merkle_check.assert_membership(leaf_hash, leaf_index, sibling_path, snapshot.root);

    // Cache this membership so we don't repeat it
    cached_derived_address_retrievals.emplace(derived_address);

    events.emit(GetProtocolContractDerivedAddressEvent{
        .canonical_address = canonical_address,
        .derived_address = leaf_preimage.leaf.derived_address,
        .next_derived_address = leaf_preimage.nextKey,
        .leaf_hash = leaf_hash,
        .protocol_contract_tree_root = snapshot.root,
    });
}

// Lazy load the tree on first acccess, then cache it
// Since we could execute a transaction without ever needing to access the protocol contract tree, it seems wasteful to
// build it upfront
const ProtocolContractTree& ProtocolContractIndexedTree::get_tree() const
{
    if (!tree.has_value()) {
        tree = build_tree(derived_addresses);
    }
    return tree.value();
}

} // namespace bb::avm2::simulation
