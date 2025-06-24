#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/nullifier_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/field_gt.hpp"
#include "barretenberg/vm2/simulation/merkle_check.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"

namespace bb::avm2::simulation {

class NullifierTreeCheckInterface {
  public:
    virtual ~NullifierTreeCheckInterface() = default;
    virtual void assert_read(FF nullifier,
                             std::optional<AztecAddress> contract_address,
                             bool exists,
                             const NullifierTreeLeafPreimage& low_leaf_preimage,
                             uint64_t low_leaf_index,
                             std::span<const FF> sibling_path,
                             const AppendOnlyTreeSnapshot& snapshot) = 0;
    virtual AppendOnlyTreeSnapshot write(FF nullifier,
                                         std::optional<AztecAddress> contract_address,
                                         uint64_t nullifier_counter,
                                         const NullifierTreeLeafPreimage& low_leaf_preimage,
                                         uint64_t low_leaf_index,
                                         std::span<const FF> low_leaf_sibling_path,
                                         const AppendOnlyTreeSnapshot& prev_snapshot,
                                         // Null if this is a failing write.
                                         std::optional<std::span<const FF>> insertion_sibling_path) = 0;
};

class NullifierTreeCheck : public NullifierTreeCheckInterface, public CheckpointNotifiable {
  public:
    NullifierTreeCheck(Poseidon2Interface& poseidon2,
                       MerkleCheckInterface& merkle_check,
                       FieldGreaterThanInterface& field_gt,
                       EventEmitterInterface<NullifierTreeCheckEvent>& event_emitter)
        : events(event_emitter)
        , poseidon2(poseidon2)
        , merkle_check(merkle_check)
        , field_gt(field_gt)
    {}

    void assert_read(FF nullifier,
                     std::optional<AztecAddress> contract_address,
                     bool exists,
                     const NullifierTreeLeafPreimage& low_leaf_preimage,
                     uint64_t low_leaf_index,
                     std::span<const FF> sibling_path,
                     const AppendOnlyTreeSnapshot& snapshot) override;
    AppendOnlyTreeSnapshot write(FF nullifier,
                                 std::optional<AztecAddress> contract_address,
                                 uint64_t nullifier_counter,
                                 const NullifierTreeLeafPreimage& low_leaf_preimage,
                                 uint64_t low_leaf_index,
                                 std::span<const FF> low_leaf_sibling_path,
                                 const AppendOnlyTreeSnapshot& prev_snapshot,
                                 std::optional<std::span<const FF>> insertion_sibling_path) override;

    void on_checkpoint_created() override { events.emit(CheckPointEventType::CREATE_CHECKPOINT); }
    void on_checkpoint_committed() override { events.emit(CheckPointEventType::COMMIT_CHECKPOINT); }
    void on_checkpoint_reverted() override { events.emit(CheckPointEventType::REVERT_CHECKPOINT); }

  private:
    FF silo_nullifier(FF nullifier, AztecAddress contract_address);
    void validate_low_leaf(FF nullifier, const NullifierTreeLeafPreimage& low_leaf_preimage, bool exists);

    EventEmitterInterface<NullifierTreeCheckEvent>& events;
    Poseidon2Interface& poseidon2;
    MerkleCheckInterface& merkle_check;
    FieldGreaterThanInterface& field_gt;
};

} // namespace bb::avm2::simulation
