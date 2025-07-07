#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/written_public_data_slot_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/field_gt.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"
#include "barretenberg/vm2/simulation/lib/written_slots_tree.hpp"
#include "barretenberg/vm2/simulation/merkle_check.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"

namespace bb::avm2::simulation {

class WrittenPublicDataSlotsInterface {
  public:
    virtual ~WrittenPublicDataSlotsInterface() = default;
    virtual bool contains(const AztecAddress& contract_address, const FF& slot) = 0;
    virtual void insert(const AztecAddress& contract_address, const FF& slot) = 0;
    virtual uint32_t size() const = 0;

    // Abstraction leak: we need to track tree roots to implement the set in-circuit
    virtual AppendOnlyTreeSnapshot snapshot() const = 0;

    // These are needed since this is a checkpointable set.
    virtual void create_checkpoint() = 0;
    virtual void commit_checkpoint() = 0;
    virtual void revert_checkpoint() = 0;
};

class WrittenPublicDataSlotsTreeCheck : public WrittenPublicDataSlotsInterface {
  public:
    WrittenPublicDataSlotsTreeCheck(Poseidon2Interface& poseidon2,
                                    MerkleCheckInterface& merkle_check,
                                    FieldGreaterThanInterface& field_gt,
                                    EventEmitterInterface<WrittenPublicDataSlotsTreeCheckEvent>& read_event_emitter)
        : events(read_event_emitter)
        , poseidon2(poseidon2)
        , merkle_check(merkle_check)
        , field_gt(field_gt)
    {
        written_public_data_slots_tree_stack.push(build_public_data_slots_tree());
    }

    bool contains(const AztecAddress& contract_address, const FF& slot) override;

    void insert(const AztecAddress& contract_address, const FF& slot) override;

    AppendOnlyTreeSnapshot snapshot() const override;

    uint32_t size() const override;

    void create_checkpoint() override;
    void commit_checkpoint() override;
    void revert_checkpoint() override;

  private:
    EventEmitterInterface<WrittenPublicDataSlotsTreeCheckEvent>& events;
    Poseidon2Interface& poseidon2;
    MerkleCheckInterface& merkle_check;
    FieldGreaterThanInterface& field_gt;

    std::stack<WrittenPublicDataSlotsTree> written_public_data_slots_tree_stack = {};

    void validate_low_leaf_jumps_over_slot(const WrittenPublicDataSlotsTreeLeafPreimage& low_leaf_preimage,
                                           const FF& leaf_slot);
    FF compute_leaf_slot(const AztecAddress& contract_address, const FF& slot);
};

} // namespace bb::avm2::simulation
