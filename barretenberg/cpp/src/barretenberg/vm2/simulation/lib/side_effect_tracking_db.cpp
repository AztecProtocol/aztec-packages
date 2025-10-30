#include "barretenberg/vm2/simulation/lib/side_effect_tracking_db.hpp"

#include "barretenberg/vm2/simulation/lib/merkle.hpp"

namespace bb::avm2::simulation {

FF SideEffectTrackingDB::storage_read(const AztecAddress& contract_address, const FF& slot) const
{
    return merkle_db.storage_read(contract_address, slot);
}

bool SideEffectTrackingDB::was_storage_written(const AztecAddress& contract_address, const FF& slot) const
{
    return merkle_db.was_storage_written(contract_address, slot);
}

bool SideEffectTrackingDB::nullifier_exists(const AztecAddress& contract_address, const FF& nullifier) const
{
    return merkle_db.nullifier_exists(contract_address, nullifier);
}

bool SideEffectTrackingDB::siloed_nullifier_exists(const FF& nullifier) const
{
    return merkle_db.siloed_nullifier_exists(nullifier);
}

bool SideEffectTrackingDB::note_hash_exists(uint64_t leaf_index, const FF& unique_note_hash) const
{
    return merkle_db.note_hash_exists(leaf_index, unique_note_hash);
}

bool SideEffectTrackingDB::l1_to_l2_msg_exists(uint64_t leaf_index, const FF& msg_hash) const
{
    return merkle_db.l1_to_l2_msg_exists(leaf_index, msg_hash);
}

uint32_t SideEffectTrackingDB::get_checkpoint_id() const
{
    return merkle_db.get_checkpoint_id();
}

TreeStates SideEffectTrackingDB::get_tree_state() const
{
    return merkle_db.get_tree_state();
}

LowLevelMerkleDBInterface& SideEffectTrackingDB::as_unconstrained() const
{
    return merkle_db.as_unconstrained();
}

void SideEffectTrackingDB::storage_write(const AztecAddress& contract_address,
                                         const FF& slot,
                                         const FF& value,
                                         bool is_protocol_write)
{
    merkle_db.storage_write(contract_address, slot, value, is_protocol_write);
    FF leaf_slot = unconstrained_compute_leaf_slot(contract_address, slot);
    tracked_side_effects.add_storage_write(leaf_slot, value);
}

void SideEffectTrackingDB::nullifier_write(const AztecAddress& contract_address, const FF& nullifier)
{
    merkle_db.nullifier_write(contract_address, nullifier);
    tracked_side_effects.add_nullifier(unconstrained_silo_nullifier(contract_address, nullifier));
}

void SideEffectTrackingDB::siloed_nullifier_write(const FF& nullifier)
{
    merkle_db.siloed_nullifier_write(nullifier);
    tracked_side_effects.add_nullifier(nullifier);
}

void SideEffectTrackingDB::note_hash_write(const AztecAddress& contract_address, const FF& note_hash)
{
    merkle_db.note_hash_write(contract_address, note_hash);
    FF siloed_note_hash = unconstrained_silo_note_hash(contract_address, note_hash);
    uint32_t note_hash_counter = static_cast<uint32_t>(tracked_side_effects.get_side_effects().note_hashes.size());
    FF unique_note_hash = unconstrained_make_unique_note_hash(siloed_note_hash, first_nullifier, note_hash_counter);
    tracked_side_effects.add_note_hash(unique_note_hash);
}

void SideEffectTrackingDB::siloed_note_hash_write(const FF& siloed_note_hash)
{
    merkle_db.siloed_note_hash_write(siloed_note_hash);
    uint32_t note_hash_counter = static_cast<uint32_t>(tracked_side_effects.get_side_effects().note_hashes.size());
    FF unique_note_hash = unconstrained_make_unique_note_hash(siloed_note_hash, first_nullifier, note_hash_counter);
    tracked_side_effects.add_note_hash(unique_note_hash);
}

void SideEffectTrackingDB::unique_note_hash_write(const FF& unique_note_hash)
{
    // The note hash is already siloed and unique.
    merkle_db.unique_note_hash_write(unique_note_hash);
    tracked_side_effects.add_note_hash(unique_note_hash);
}

void SideEffectTrackingDB::create_checkpoint()
{
    merkle_db.create_checkpoint();
    tracked_side_effects.create_checkpoint();
}

void SideEffectTrackingDB::commit_checkpoint()
{
    merkle_db.commit_checkpoint();
    tracked_side_effects.commit_checkpoint();
}

void SideEffectTrackingDB::revert_checkpoint()
{
    merkle_db.revert_checkpoint();
    tracked_side_effects.revert_checkpoint();
}

void SideEffectTrackingDB::pad_trees()
{
    merkle_db.pad_trees();
}

} // namespace bb::avm2::simulation
