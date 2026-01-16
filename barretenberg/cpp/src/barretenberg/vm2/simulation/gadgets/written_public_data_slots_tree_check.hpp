#pragma once

#include <stack>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/written_public_data_slot_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/merkle_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/interfaces/written_public_data_slots_tree_check.hpp"
#include "barretenberg/vm2/simulation/lib/written_slots_tree.hpp"

namespace bb::avm2::simulation {

class WrittenPublicDataSlotsTreeCheck : public WrittenPublicDataSlotsTreeCheckInterface {
  public:
    WrittenPublicDataSlotsTreeCheck(Poseidon2Interface& poseidon2,
                                    MerkleCheckInterface& merkle_check,
                                    FieldGreaterThanInterface& field_gt,
                                    WrittenPublicDataSlotsTree initial_state,
                                    EventEmitterInterface<WrittenPublicDataSlotsTreeCheckEvent>& read_event_emitter)
        : events(read_event_emitter)
        , poseidon2(poseidon2)
        , merkle_check(merkle_check)
        , field_gt(field_gt)
    {
        written_public_data_slots_tree_stack.push(std::move(initial_state));
    }

    bool contains(const AztecAddress& contract_address, const FF& slot) override;

    void insert(const AztecAddress& contract_address, const FF& slot) override;

    AppendOnlyTreeSnapshot get_snapshot() const override;

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
