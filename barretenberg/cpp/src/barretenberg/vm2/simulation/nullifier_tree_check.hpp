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
    virtual void assert_read(const FF& nullifier,
                             bool exists,
                             const NullifierTreeLeafPreimage& low_leaf_preimage,
                             uint64_t low_leaf_index,
                             std::span<const FF> sibling_path,
                             const AppendOnlyTreeSnapshot& snapshot) = 0;
    virtual AppendOnlyTreeSnapshot write(const FF& nullifier,
                                         const NullifierTreeLeafPreimage& low_leaf_preimage,
                                         uint64_t low_leaf_index,
                                         std::span<const FF> low_leaf_sibling_path,
                                         const AppendOnlyTreeSnapshot& prev_snapshot,
                                         std::span<const FF> insertion_sibling_path) = 0;
};

class NullifierTreeCheck : public NullifierTreeCheckInterface {
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

    void assert_read(const FF& nullifier,
                     bool exists,
                     const NullifierTreeLeafPreimage& low_leaf_preimage,
                     uint64_t low_leaf_index,
                     std::span<const FF> sibling_path,
                     const AppendOnlyTreeSnapshot& snapshot) override;
    AppendOnlyTreeSnapshot write(const FF& nullifier,
                                 const NullifierTreeLeafPreimage& low_leaf_preimage,
                                 uint64_t low_leaf_index,
                                 std::span<const FF> low_leaf_sibling_path,
                                 const AppendOnlyTreeSnapshot& prev_snapshot,
                                 std::span<const FF> insertion_sibling_path) override;

  private:
    EventEmitterInterface<NullifierTreeCheckEvent>& events;
    Poseidon2Interface& poseidon2;
    MerkleCheckInterface& merkle_check;
    FieldGreaterThanInterface& field_gt;
};

} // namespace bb::avm2::simulation
