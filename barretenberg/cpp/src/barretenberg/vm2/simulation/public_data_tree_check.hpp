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
    virtual void assert_read(const FF& leaf_slot,
                             const FF& value,
                             const PublicDataTreeLeafPreimage& low_leaf_preimage,
                             uint64_t low_leaf_index,
                             std::span<const FF> sibling_path,
                             const AppendOnlyTreeSnapshot& snapshot) = 0;
    virtual AppendOnlyTreeSnapshot write(const FF& leaf_slot,
                                         const FF& value,
                                         const PublicDataTreeLeafPreimage& low_leaf_preimage,
                                         uint64_t low_leaf_index,
                                         std::span<const FF> low_leaf_sibling_path,
                                         const AppendOnlyTreeSnapshot& prev_snapshot,
                                         std::span<const FF> insertion_sibling_path) = 0;
};

class PublicDataTreeCheck : public PublicDataTreeCheckInterface {
  public:
    PublicDataTreeCheck(Poseidon2Interface& poseidon2,
                        MerkleCheckInterface& merkle_check,
                        FieldGreaterThanInterface& field_gt,
                        EventEmitterInterface<PublicDataTreeCheckEvent>& read_event_emitter)
        : read_events(read_event_emitter)
        , poseidon2(poseidon2)
        , merkle_check(merkle_check)
        , field_gt(field_gt)
    {}

    void assert_read(const FF& leaf_slot,
                     const FF& value,
                     const PublicDataTreeLeafPreimage& low_leaf_preimage,
                     uint64_t low_leaf_index,
                     std::span<const FF> sibling_path,
                     const AppendOnlyTreeSnapshot& snapshot) override;

    AppendOnlyTreeSnapshot write(const FF& leaf_slot,
                                 const FF& value,
                                 const PublicDataTreeLeafPreimage& low_leaf_preimage,
                                 uint64_t low_leaf_index,
                                 std::span<const FF> low_leaf_sibling_path,
                                 const AppendOnlyTreeSnapshot& prev_snapshot,
                                 std::span<const FF> insertion_sibling_path) override;

  private:
    EventEmitterInterface<PublicDataTreeCheckEvent>& read_events;
    Poseidon2Interface& poseidon2;
    MerkleCheckInterface& merkle_check;
    FieldGreaterThanInterface& field_gt;

    void validate_low_leaf_jumps_over_slot(const PublicDataTreeLeafPreimage& low_leaf_preimage, const FF& leaf_slot);
};

} // namespace bb::avm2::simulation
