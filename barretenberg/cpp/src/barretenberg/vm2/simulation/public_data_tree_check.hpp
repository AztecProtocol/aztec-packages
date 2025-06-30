#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/public_data_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/field_gt.hpp"
#include "barretenberg/vm2/simulation/merkle_check.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"

namespace bb::avm2::simulation {

class PublicDataTreeCheckInterface {
  public:
    virtual ~PublicDataTreeCheckInterface() = default;
    virtual void assert_read(const FF& slot,
                             const AztecAddress& contract_address,
                             const FF& value,
                             const PublicDataTreeLeafPreimage& low_leaf_preimage,
                             uint64_t low_leaf_index,
                             std::span<const FF> sibling_path,
                             const AppendOnlyTreeSnapshot& snapshot) = 0;
    virtual AppendOnlyTreeSnapshot write(const FF& slot,
                                         const AztecAddress& contract_address,
                                         const FF& value,
                                         const PublicDataTreeLeafPreimage& low_leaf_preimage,
                                         uint64_t low_leaf_index,
                                         std::span<const FF> low_leaf_sibling_path,
                                         const AppendOnlyTreeSnapshot& prev_snapshot,
                                         std::span<const FF> insertion_sibling_path,
                                         bool is_protocol_write) = 0;
};

class PublicDataTreeCheck : public PublicDataTreeCheckInterface, public CheckpointNotifiable {
  public:
    PublicDataTreeCheck(Poseidon2Interface& poseidon2,
                        MerkleCheckInterface& merkle_check,
                        FieldGreaterThanInterface& field_gt,
                        ExecutionIdGetterInterface& execution_id_manager,
                        RangeCheckInterface& range_check,
                        EventEmitterInterface<PublicDataTreeCheckEvent>& read_event_emitter)
        : events(read_event_emitter)
        , poseidon2(poseidon2)
        , merkle_check(merkle_check)
        , field_gt(field_gt)
        , execution_id_manager(execution_id_manager)
        , range_check(range_check)
    {
        // We are going to be sorting this trace by execution id
        // Reads have execution id 0, so we need a range check call to compare zero with zero
        // TODO(alvaro): Think of a better way to do this
        range_check.assert_range(0, 32);
    }

    void assert_read(const FF& slot,
                     const AztecAddress& contract_address,
                     const FF& value,
                     const PublicDataTreeLeafPreimage& low_leaf_preimage,
                     uint64_t low_leaf_index,
                     std::span<const FF> sibling_path,
                     const AppendOnlyTreeSnapshot& snapshot) override;

    AppendOnlyTreeSnapshot write(const FF& slot,
                                 const AztecAddress& contract_address,
                                 const FF& value,
                                 const PublicDataTreeLeafPreimage& low_leaf_preimage,
                                 uint64_t low_leaf_index,
                                 std::span<const FF> low_leaf_sibling_path,
                                 const AppendOnlyTreeSnapshot& prev_snapshot,
                                 std::span<const FF> insertion_sibling_path,
                                 bool is_protocol_write) override;

    void on_checkpoint_created() override;
    void on_checkpoint_committed() override;
    void on_checkpoint_reverted() override;

  private:
    EventEmitterInterface<PublicDataTreeCheckEvent>& events;
    Poseidon2Interface& poseidon2;
    MerkleCheckInterface& merkle_check;
    FieldGreaterThanInterface& field_gt;
    ExecutionIdGetterInterface& execution_id_manager;
    RangeCheckInterface& range_check;

    uint32_t last_write_execution_id = 0;

    void validate_low_leaf_jumps_over_slot(const PublicDataTreeLeafPreimage& low_leaf_preimage, const FF& leaf_slot);
    FF compute_leaf_slot(const AztecAddress& contract_address, const FF& slot);
};

} // namespace bb::avm2::simulation
