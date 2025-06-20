#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/note_hash_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/merkle_check.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"

namespace bb::avm2::simulation {

class NoteHashTreeCheckInterface {
  public:
    virtual ~NoteHashTreeCheckInterface() = default;

    virtual void assert_read(const FF& note_hash,
                             index_t leaf_index,
                             std::span<const FF> sibling_path,
                             const AppendOnlyTreeSnapshot& snapshot) = 0;
    virtual FF get_first_nullifier() const = 0;
    virtual AppendOnlyTreeSnapshot append_note_hash(const FF& note_hash,
                                                    AztecAddress contract_address,
                                                    uint64_t note_hash_counter,
                                                    std::span<const FF> sibling_path,
                                                    const AppendOnlyTreeSnapshot& prev_snapshot) = 0;
    virtual AppendOnlyTreeSnapshot append_siloed_note_hash(const FF& siloed_note_hash,
                                                           uint64_t note_hash_counter,
                                                           std::span<const FF> sibling_path,
                                                           const AppendOnlyTreeSnapshot& prev_snapshot) = 0;
    virtual AppendOnlyTreeSnapshot append_unique_note_hash(const FF& unique_note_hash,
                                                           uint64_t note_hash_counter,
                                                           std::span<const FF> sibling_path,
                                                           const AppendOnlyTreeSnapshot& prev_snapshot) = 0;

    virtual void create_checkpoint() = 0;
    virtual void commit_checkpoint() = 0;
    virtual void restore_checkpoint() = 0;
};

class NoteHashTreeCheck : public NoteHashTreeCheckInterface {
  public:
    NoteHashTreeCheck(const FF& first_nullifier,
                      Poseidon2Interface& poseidon2,
                      MerkleCheckInterface& merkle_check,
                      EventEmitterInterface<NoteHashTreeCheckEvent>& event_emitter)
        : first_nullifier(first_nullifier)
        , events(event_emitter)
        , poseidon2(poseidon2)
        , merkle_check(merkle_check)
    {}

    FF get_first_nullifier() const override { return first_nullifier; }

    void assert_read(const FF& note_hash,
                     index_t leaf_index,
                     std::span<const FF> sibling_path,
                     const AppendOnlyTreeSnapshot& snapshot) override;
    AppendOnlyTreeSnapshot append_note_hash(const FF& note_hash,
                                            AztecAddress contract_address,
                                            uint64_t note_hash_counter,
                                            std::span<const FF> sibling_path,
                                            const AppendOnlyTreeSnapshot& prev_snapshot) override;
    AppendOnlyTreeSnapshot append_siloed_note_hash(const FF& siloed_note_hash,
                                                   uint64_t note_hash_counter,
                                                   std::span<const FF> sibling_path,
                                                   const AppendOnlyTreeSnapshot& prev_snapshot) override;
    AppendOnlyTreeSnapshot append_unique_note_hash(const FF& unique_note_hash,
                                                   uint64_t note_hash_counter,
                                                   std::span<const FF> sibling_path,
                                                   const AppendOnlyTreeSnapshot& prev_snapshot) override;

    void create_checkpoint() override { events.emit(CheckPointEventType::CREATE_CHECKPOINT); }
    void commit_checkpoint() override { events.emit(CheckPointEventType::COMMIT_CHECKPOINT); }
    void restore_checkpoint() override { events.emit(CheckPointEventType::RESTORE_CHECKPOINT); }

  private:
    FF make_siloed(AztecAddress contract_address, const FF& note_hash) const;
    FF make_nonce(uint64_t note_hash_counter) const;
    FF make_unique(const FF& siloed_note_hash, const FF& nonce) const;
    AppendOnlyTreeSnapshot append_note_hash_internal(FF note_hash,
                                                     std::optional<AztecAddress> contract_address,
                                                     bool should_make_unique,
                                                     uint64_t note_hash_counter,
                                                     std::span<const FF> sibling_path,
                                                     const AppendOnlyTreeSnapshot& prev_snapshot);

    FF first_nullifier;
    EventEmitterInterface<NoteHashTreeCheckEvent>& events;
    Poseidon2Interface& poseidon2;
    MerkleCheckInterface& merkle_check;
};

} // namespace bb::avm2::simulation
