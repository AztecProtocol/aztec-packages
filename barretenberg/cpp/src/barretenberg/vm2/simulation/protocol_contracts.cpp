#include "barretenberg/vm2/simulation/protocol_contracts.hpp"

#include <cstdint>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

//////////////////////////
// Protocol Contract Leaf
//////////////////////////

bool ProtocolContractLeaf::is_updateable()
{
    return false;
}

bool ProtocolContractLeaf::operator==(ProtocolContractLeaf const& other) const
{
    return derived_address == other.derived_address;
}

AztecAddress ProtocolContractLeaf::get_key() const
{
    return derived_address;
}

bool ProtocolContractLeaf::is_empty() const
{
    return derived_address.is_zero();
}

std::vector<FF> ProtocolContractLeaf::get_hash_inputs(AztecAddress nextKey,
                                                      [[maybe_unused]] AztecAddress nextIndex) const
{
    return std::vector<FF>({ derived_address, nextKey });
}

ProtocolContractLeaf::operator uint256_t() const
{
    return static_cast<uint256_t>(derived_address);
}

ProtocolContractLeaf ProtocolContractLeaf::empty()
{
    return ProtocolContractLeaf(AztecAddress::zero());
}

ProtocolContractLeaf ProtocolContractLeaf::padding([[maybe_unused]] index_t i)
{
    return ProtocolContractLeaf(static_cast<AztecAddress>(0));
}

////////////////////////////////////
/// Protocol Contract Indexed tree
////////////////////////////////////
bool ProtocolContractIndexedTree::contains(const AztecAddress& canonical_address) const
{
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

ProtocolContractTree ProtocolContractIndexedTree::build_tree() const
{
    // The protocol contract derived addresses are inserted in the tree at the index defined by their
    // canonical address. Since we cannot guarantee that the canonical addresses are in contiguous and sequential order,
    // we insert them based on their canonical address.

    std::vector<IndexedLeaf<ProtocolContractLeaf>> initial_leaves(MAX_PROTOCOL_CONTRACTS,
                                                                  IndexedLeaf<ProtocolContractLeaf>::empty());

    // We need to make sure that the 0 leaf is present in the tree
    std::unordered_map<CanonicalAddress, DerivedAddress> leaves_map = derived_addresses;
    leaves_map.emplace(CanonicalAddress(0), DerivedAddress(0));

    // Indexed leaves are characterised by {key, next_index, next_key}, where
    // Note this looks like O(n^2) but n is currently 5 so it's probably quicker than double sorting
    for (const auto& [canonical_address, derived_address] : leaves_map) {
        // To build the indexed leaf, we need the "next key (i.e. derived address) of the current leaf
        // This is the smallest derived address that is greater than the current one
        uint256_t next_derived_address = uint256_t(0);
        index_t next_index = 0;
        for (const auto& [other_canonical_address, other_derived_address] : leaves_map) {
            uint256_t derived_address_u256 = static_cast<uint256_t>(derived_address);
            uint256_t other_derived_address_u256 = static_cast<uint256_t>(other_derived_address);
            if (other_derived_address_u256 > derived_address_u256) {
                // Is this other derived address the smallest we've seen that is greater than the current one?
                if (next_derived_address == 0 || other_derived_address_u256 < next_derived_address) {
                    next_derived_address = other_derived_address;
                    next_index = static_cast<index_t>(other_canonical_address);
                }
            }
        }
        // The max leaf will end up wiht a next_derived_address = 0, so we set the next_index to 0 (i.e. infinity)
        IndexedLeaf<ProtocolContractLeaf> initial_leaf(/*leaf=*/ProtocolContractLeaf(derived_address),
                                                       /*nextIdx=*/next_index,
                                                       /*nextKey=*/next_derived_address);

        initial_leaves[static_cast<uint8_t>(canonical_address)] = initial_leaf;
    }

    // We need to make sure that there zero-indexed leaf contains a zero value necessary for the indexed tree.
    // The only way this is infringed is if a protocol contract is given the canonical address 0 which is
    // disallowed by the protocol
    assert(initial_leaves[0].leaf == AztecAddress::zero());

    ProtocolContractTree tree(PROTOCOL_CONTRACT_TREE_HEIGHT, initial_leaves);
    return tree;
}

// Lazy load the tree on first acccess, then cache it
// Since we could execute a transaction without ever needing to access the protocol contract tree, it seems wasteful to
// build it upfront
const ProtocolContractTree& ProtocolContractIndexedTree::get_tree() const
{
    if (!tree.has_value()) {
        tree = build_tree();
    }
    return tree.value();
}

} // namespace bb::avm2::simulation
