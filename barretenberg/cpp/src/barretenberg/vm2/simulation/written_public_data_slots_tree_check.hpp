#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/written_public_data_slot_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/field_gt.hpp"
#include "barretenberg/vm2/simulation/lib/written_slots_tree.hpp"
#include "barretenberg/vm2/simulation/merkle_check.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"

namespace bb::avm2::simulation {

class WrittenPublicDataSlotsTreeCheckInterface {
  public:
    virtual ~WrittenPublicDataSlotsTreeCheckInterface() = default;
    virtual void assert_read(const FF& slot,
                             const AztecAddress& contract_address,
                             bool exists,
                             const WrittenPublicDataSlotsTreeLeafPreimage& low_leaf_preimage,
                             uint64_t low_leaf_index,
                             std::span<const FF> sibling_path,
                             const AppendOnlyTreeSnapshot& snapshot) = 0;
    virtual AppendOnlyTreeSnapshot upsert(const FF& slot,
                                          const AztecAddress& contract_address,
                                          const WrittenPublicDataSlotsTreeLeafPreimage& low_leaf_preimage,
                                          uint64_t low_leaf_index,
                                          std::span<const FF> low_leaf_sibling_path,
                                          const AppendOnlyTreeSnapshot& prev_snapshot,
                                          std::span<const FF> insertion_sibling_path) = 0;
};

class WrittenPublicDataSlotsTreeCheck : public WrittenPublicDataSlotsTreeCheckInterface {
  public:
    WrittenPublicDataSlotsTreeCheck(Poseidon2Interface& poseidon2,
                                    MerkleCheckInterface& merkle_check,
                                    FieldGreaterThanInterface& field_gt,
                                    EventEmitterInterface<WrittenPublicDataSlotsTreeCheckEvent>& read_event_emitter)
        : events(read_event_emitter)
        , poseidon2(poseidon2)
        , merkle_check(merkle_check)
        , field_gt(field_gt)
    {}

    void assert_read(const FF& slot,
                     const AztecAddress& contract_address,
                     bool exists,
                     const WrittenPublicDataSlotsTreeLeafPreimage& low_leaf_preimage,
                     uint64_t low_leaf_index,
                     std::span<const FF> sibling_path,
                     const AppendOnlyTreeSnapshot& snapshot) override;

    AppendOnlyTreeSnapshot upsert(const FF& slot,
                                  const AztecAddress& contract_address,
                                  const WrittenPublicDataSlotsTreeLeafPreimage& low_leaf_preimage,
                                  uint64_t low_leaf_index,
                                  std::span<const FF> low_leaf_sibling_path,
                                  const AppendOnlyTreeSnapshot& prev_snapshot,
                                  std::span<const FF> insertion_sibling_path) override;

  private:
    EventEmitterInterface<WrittenPublicDataSlotsTreeCheckEvent>& events;
    Poseidon2Interface& poseidon2;
    MerkleCheckInterface& merkle_check;
    FieldGreaterThanInterface& field_gt;

    void validate_low_leaf_jumps_over_slot(const WrittenPublicDataSlotsTreeLeafPreimage& low_leaf_preimage,
                                           const FF& leaf_slot);
    FF compute_leaf_slot(const AztecAddress& contract_address, const FF& slot);
};

} // namespace bb::avm2::simulation
