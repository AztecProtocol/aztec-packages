#include "barretenberg/vm2/simulation/lib/protocol_contract_tree.hpp"

namespace bb::avm2::simulation {

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

ProtocolContractTree build_tree(std::unordered_map<CanonicalAddress, DerivedAddress> const& derived_addresses)
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
} // namespace bb::avm2::simulation
