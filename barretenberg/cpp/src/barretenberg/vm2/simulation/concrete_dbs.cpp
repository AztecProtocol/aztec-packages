#include "barretenberg/vm2/simulation/concrete_dbs.hpp"

namespace bb::avm2::simulation {

ContractInstance ContractDB::get_contract_instance(const AztecAddress& address) const
{
    ContractInstance instance = raw_contract_db.get_contract_instance(address);
    address_derivation.assert_derivation(address, instance);
    // TODO: emit event
    return instance;
}

ContractClass ContractDB::get_contract_class(const ContractClassId& class_id) const
{
    ContractClass klass = raw_contract_db.get_contract_class(class_id);
    class_id_derivation.assert_derivation(class_id, klass);
    // TODO: emit event
    return klass;
}

const TreeRoots& MerkleDB::get_tree_roots() const
{
    // No event generated.
    return raw_merkle_db.get_tree_roots();
}

} // namespace bb::avm2::simulation
