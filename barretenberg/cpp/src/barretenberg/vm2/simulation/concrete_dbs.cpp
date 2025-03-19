#include "barretenberg/vm2/simulation/concrete_dbs.hpp"

namespace bb::avm2::simulation {

// Contracts DB starts.
std::optional<ContractInstance> ContractDB::get_contract_instance(const AztecAddress& address) const
{
    std::optional<ContractInstance> instance = raw_contract_db.get_contract_instance(address);
    // If we didn't get a contract instance, we don't prove anything.
    // It is the responsibility of the caller to prove what the protocol expects.
    if (!instance.has_value()) {
        return std::nullopt;
    }
    // If we did get a contract instance, we need to prove that the address is derived from the instance.
    address_derivation.assert_derivation(address, instance.value());
    return instance;
}

std::optional<ContractClass> ContractDB::get_contract_class(const ContractClassId& class_id) const
{
    std::optional<ContractClass> klass = raw_contract_db.get_contract_class(class_id);
    // If we didn't get a contract class, we don't prove anything.
    // It is the responsibility of the caller to prove what the protocol expects.
    if (!klass.has_value()) {
        return std::nullopt;
    }
    // If we did get a contract class, we need to prove that the class_id is derived from the class.
    class_id_derivation.assert_derivation(class_id, klass.value());
    return klass;
}

// Merkle DB starts.
const TreeSnapshots& MerkleDB::get_tree_roots() const
{
    // No event generated.
    return raw_merkle_db.get_tree_roots();
}

// TODO(fcarreiro): We wouldn't have a low level method here because it can't be constrained.
crypto::merkle_tree::fr_sibling_path MerkleDB::get_sibling_path(world_state::MerkleTreeId tree_id,
                                                                crypto::merkle_tree::index_t leaf_index) const
{
    return raw_merkle_db.get_sibling_path(tree_id, leaf_index);
}

} // namespace bb::avm2::simulation
