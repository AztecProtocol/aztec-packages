#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/side_effect_tracker.hpp"

namespace bb::avm2::simulation {

/**
 * @brief A high-level merkle db that tracks side effects.
 *
 * This class is a wrapper around a high-level merkle db that tracks side effects.
 * It delegates all methods to the merkle db, and tracks side effects.
 */
class SideEffectTrackingDB : public HighLevelMerkleDBInterface {
  public:
    SideEffectTrackingDB(const FF& first_nullifier,
                         HighLevelMerkleDBInterface& merkle_db,
                         SideEffectTrackerInterface& tracked_side_effects)
        : first_nullifier(first_nullifier)
        , merkle_db(merkle_db)
        , tracked_side_effects(tracked_side_effects)
    {}

    // These methods just delegate to the merkle db.
    FF storage_read(const AztecAddress& contract_address, const FF& slot) const override;
    bool was_storage_written(const AztecAddress& contract_address, const FF& slot) const override;
    bool nullifier_exists(const AztecAddress& contract_address, const FF& nullifier) const override;
    bool siloed_nullifier_exists(const FF& nullifier) const override;
    bool note_hash_exists(uint64_t leaf_index, const FF& unique_note_hash) const override;
    bool l1_to_l2_msg_exists(uint64_t leaf_index, const FF& msg_hash) const override;
    uint32_t get_checkpoint_id() const override;
    TreeStates get_tree_state() const override;
    LowLevelMerkleDBInterface& as_unconstrained() const override;

    // These methods track the side effects and delegate to the merkle db.
    void storage_write(const AztecAddress& contract_address,
                       const FF& slot,
                       const FF& value,
                       bool is_protocol_write) override;
    void nullifier_write(const AztecAddress& contract_address, const FF& nullifier) override;
    void siloed_nullifier_write(const FF& nullifier) override;
    void note_hash_write(const AztecAddress& contract_address, const FF& note_hash) override;
    void siloed_note_hash_write(const FF& note_hash) override;
    void unique_note_hash_write(const FF& note_hash) override;
    void pad_trees() override;

    // These methods notify the tracked container, and delegate to the merkle db.
    void create_checkpoint() override;
    void commit_checkpoint() override;
    void revert_checkpoint() override;

  private:
    FF first_nullifier;
    HighLevelMerkleDBInterface& merkle_db;
    SideEffectTrackerInterface& tracked_side_effects;
};

} // namespace bb::avm2::simulation
