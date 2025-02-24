#pragma once

#include "barretenberg/vm2/simulation/address_derivation.hpp"
#include "barretenberg/vm2/simulation/class_id_derivation.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"
#include "barretenberg/vm2/simulation/lib/raw_data_dbs.hpp"

namespace bb::avm2::simulation {

// Generates events.
class ContractDB final : public ContractDBInterface {
  public:
    ContractDB(ContractDBInterface& raw_contract_db,
               AddressDerivationInterface& address_derivation,
               ClassIdDerivationInterface& class_id_derivation)
        : raw_contract_db(raw_contract_db)
        , address_derivation(address_derivation)
        , class_id_derivation(class_id_derivation)
    {}

    // Gets an instance from the DB and proves address derivation from the result.
    // This does NOT prove that the address is in the nullifier tree.
    // Silo the address and use the MerkleDB to prove that.
    ContractInstance get_contract_instance(const AztecAddress& address) const override;
    // Gets a class from the DB and proves class id derivation from the result.
    // This does NOT prove that the class id is in the nullifier tree.
    // Silo the class id and use the MerkleDB to prove that.
    ContractClass get_contract_class(const ContractClassId& class_id) const override;

  private:
    ContractDBInterface& raw_contract_db;
    AddressDerivationInterface& address_derivation;
    ClassIdDerivationInterface& class_id_derivation;
    // TODO: EventEmitters.
};

// Generates events.
class MerkleDB final : public MerkleDBInterface {
  public:
    MerkleDB(MerkleDBInterface& raw_merkle_db)
        : raw_merkle_db(raw_merkle_db)
    {}

    const TreeRoots& get_tree_roots() const override;

  private:
    MerkleDBInterface& raw_merkle_db;
};

} // namespace bb::avm2::simulation
