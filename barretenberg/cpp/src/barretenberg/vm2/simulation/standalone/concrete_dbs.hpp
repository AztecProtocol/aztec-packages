#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/db_types.hpp"
#include "barretenberg/vm2/simulation/lib/raw_data_dbs.hpp"

namespace bb::avm2::simulation {

// Forward declaration.
class WrittenPublicDataSlotsInterface;

// Does not generate events.
class PureContractDB final : public ContractDBInterface {
  public:
    PureContractDB(ContractDBInterface& raw_contract_db)
        : raw_contract_db(raw_contract_db)
    {}

    std::optional<ContractInstance> get_contract_instance(const AztecAddress& address) const override;
    std::optional<ContractClass> get_contract_class(const ContractClassId& class_id) const override;

  private:
    ContractDBInterface& raw_contract_db;
};

// Does not generate events.
class PureMerkleDB final : public HighLevelMerkleDBInterface {
  public:
    PureMerkleDB(const FF& first_nullifier,
                 LowLevelMerkleDBInterface& raw_merkle_db,
                 WrittenPublicDataSlotsInterface& written_public_data_slots)
        : first_nullifier(first_nullifier)
        , raw_merkle_db(raw_merkle_db)
        , written_public_data_slots(written_public_data_slots)
    {}

    // Unconstrained.
    TreeStates get_tree_state() const override;
    void create_checkpoint() override;
    void commit_checkpoint() override;
    void revert_checkpoint() override;
    uint32_t get_checkpoint_id() const override;

    // Constrained.
    FF storage_read(const AztecAddress& contract_address, const FF& slot) const override;
    void storage_write(const AztecAddress& contract_address,
                       const FF& slot,
                       const FF& value,
                       bool is_protocol_write) override;
    bool was_storage_written(const AztecAddress& contract_address, const FF& slot) const override;

    bool nullifier_exists(const AztecAddress& contract_address, const FF& nullifier) const override;
    bool siloed_nullifier_exists(const FF& nullifier) const override;
    // Throws if the nullifier already exists.
    void nullifier_write(const AztecAddress& contract_address, const FF& nullifier) override;
    void siloed_nullifier_write(const FF& nullifier) override;

    // Returns a unique note hash stored in the tree at leaf_index.
    bool note_hash_exists(uint64_t leaf_index, const FF& unique_note_hash) const override;
    void note_hash_write(const AztecAddress& contract_address, const FF& note_hash) override;
    void siloed_note_hash_write(const FF& note_hash) override;
    void unique_note_hash_write(const FF& note_hash) override;
    bool l1_to_l2_msg_exists(uint64_t leaf_index, const FF& msg_hash) const override;

    void pad_trees() override;

    void add_checkpoint_listener(CheckpointNotifiable& listener) { checkpoint_listeners.push_back(&listener); }

    LowLevelMerkleDBInterface& as_unconstrained() const override { return raw_merkle_db; }

  private:
    bool nullifier_exists_internal(std::optional<AztecAddress> contract_address, const FF& nullifier) const;
    void nullifier_write_internal(std::optional<AztecAddress> contract_address, const FF& nullifier);

    FF first_nullifier;
    LowLevelMerkleDBInterface& raw_merkle_db;
    // TODO: when you have a merkle gadget, consider marking it "mutable" so that read can be const.
    // It's usually ok for mutexes but a gadget is big...
    WrittenPublicDataSlotsInterface& written_public_data_slots;

    // Set for semantics.
    using Slot = FF;
    std::vector<CheckpointNotifiable*> checkpoint_listeners;

    // Stack of tree counters for checkpoints. Starts empty.
    std::stack<TreeCounters> tree_counters_stack{
        { { .note_hash_counter = 0, .nullifier_counter = 0, .l2_to_l1_msg_counter = 0 } }
    };
};

} // namespace bb::avm2::simulation
