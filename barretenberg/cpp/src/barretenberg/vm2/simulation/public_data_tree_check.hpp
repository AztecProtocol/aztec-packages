#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/public_data_tree_read_event.hpp"
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
                             const FF& root) = 0;
};

class PublicDataTreeCheck : public PublicDataTreeCheckInterface {
  public:
    PublicDataTreeCheck(Poseidon2Interface& poseidon2,
                        MerkleCheckInterface& merkle_check,
                        FieldGreaterThanInterface& field_gt,
                        EventEmitterInterface<PublicDataTreeReadEvent>& read_event_emitter)
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
                     const FF& root);

  private:
    EventEmitterInterface<PublicDataTreeReadEvent>& read_events;
    Poseidon2Interface& poseidon2;
    MerkleCheckInterface& merkle_check;
    FieldGreaterThanInterface& field_gt;
};

} // namespace bb::avm2::simulation
