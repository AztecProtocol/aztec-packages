#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/address_derivation.hpp"
#include "barretenberg/vm2/simulation/class_id_derivation.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"
#include "barretenberg/vm2/simulation/lib/raw_data_dbs.hpp"
#include "barretenberg/vm2/simulation/note_hash_tree_check.hpp"
#include "barretenberg/vm2/simulation/nullifier_tree_check.hpp"
#include "barretenberg/vm2/simulation/public_data_tree_check.hpp"

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
    std::optional<ContractInstance> get_contract_instance(const AztecAddress& address) const override;
    // Gets a class from the DB and proves class id derivation from the result.
    // This does NOT prove that the class id is in the nullifier tree.
    // Silo the class id and use the MerkleDB to prove that.
    std::optional<ContractClass> get_contract_class(const ContractClassId& class_id) const override;

  private:
    ContractDBInterface& raw_contract_db;
    AddressDerivationInterface& address_derivation;
    ClassIdDerivationInterface& class_id_derivation;
    // TODO: EventEmitters.
};

// Generates events.
class MerkleDB final : public HighLevelMerkleDBInterface {
  public:
    MerkleDB(LowLevelMerkleDBInterface& raw_merkle_db,
             PublicDataTreeCheckInterface& public_data_tree_check,
             NullifierTreeCheckInterface& nullifier_tree_check,
             NoteHashTreeCheckInterface& note_hash_tree_check)
        : raw_merkle_db(raw_merkle_db)
        , public_data_tree_check(public_data_tree_check)
        , nullifier_tree_check(nullifier_tree_check)
        , note_hash_tree_check(note_hash_tree_check)
    {}

    // Unconstrained.
    const TreeSnapshots& get_tree_roots() const override;
    TreeStates get_tree_state() const override;
    void create_checkpoint() override;
    void commit_checkpoint() override;
    void revert_checkpoint() override;

    // Constrained.
    // TODO: When actually using this, consider siloing inside (and taking a silo gadget in the constructor).
    // Probably better like this though.
    FF storage_read(const FF& leaf_slot) const override;
    void storage_write(const FF& leaf_slot, const FF& value) override;

    bool nullifier_exists(const FF& nullifier) const override;
    // Throws if the nullifier already exists
    void nullifier_write(const FF& nullifier) override;

    // Returns a unique note hash stored in the tree at leaf_index.
    FF note_hash_read(index_t leaf_index) const override;
    void note_hash_write(const AztecAddress& contract_address, const FF& note_hash) override;
    void siloed_note_hash_write(const FF& note_hash) override;
    void unique_note_hash_write(const FF& note_hash) override;

    void add_checkpoint_listener(CheckpointNotifiable& listener) { checkpoint_listeners.push_back(&listener); }

    LowLevelMerkleDBInterface& as_unconstrained() const override { return raw_merkle_db; }

  private:
    LowLevelMerkleDBInterface& raw_merkle_db;
    // TODO: when you have a merkle gadget, consider marking it "mutable" so that read can be const.
    // It's usually ok for mutexes but a gadget is big...
    PublicDataTreeCheckInterface& public_data_tree_check;
    NullifierTreeCheckInterface& nullifier_tree_check;
    NoteHashTreeCheckInterface& note_hash_tree_check;

    // Counters only in the HighLevel interface.
    uint32_t nullifier_counter = 0;
    uint32_t note_hash_counter = 0;
    uint32_t l2_to_l1_msg_counter = 0;
    // Set for semantics.
    using Slot = FF;
    std::unordered_set<Slot> storage_set;
    std::vector<CheckpointNotifiable*> checkpoint_listeners;
};

} // namespace bb::avm2::simulation
