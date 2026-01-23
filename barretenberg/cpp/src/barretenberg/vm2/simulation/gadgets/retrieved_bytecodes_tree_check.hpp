#pragma once

#include <stack>
#include <utility>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/retrieved_bytecodes_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/merkle_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/interfaces/retrieved_bytecodes_tree_check.hpp"
#include "barretenberg/vm2/simulation/lib/retrieved_bytecodes_tree.hpp"

namespace bb::avm2::simulation {

class RetrievedBytecodesTreeCheck : public RetrievedBytecodesTreeCheckInterface {
  public:
    RetrievedBytecodesTreeCheck(Poseidon2Interface& poseidon2,
                                MerkleCheckInterface& merkle_check,
                                FieldGreaterThanInterface& field_gt,
                                RetrievedBytecodesTree initial_state,
                                EventEmitterInterface<RetrievedBytecodesTreeCheckEvent>& read_event_emitter)
        : events(read_event_emitter)
        , poseidon2(poseidon2)
        , merkle_check(merkle_check)
        , field_gt(field_gt)
        , tree(std::move(initial_state))
    {}

    bool contains(const FF& class_id) override;

    void insert(const FF& class_id) override;

    AppendOnlyTreeSnapshot get_snapshot() const override;

    uint32_t size() const override;

  private:
    EventEmitterInterface<RetrievedBytecodesTreeCheckEvent>& events;
    Poseidon2Interface& poseidon2;
    MerkleCheckInterface& merkle_check;
    FieldGreaterThanInterface& field_gt;

    RetrievedBytecodesTree tree;

    void validate_low_leaf_jumps_over_class_id(const RetrievedBytecodesTreeLeafPreimage& low_leaf_preimage,
                                               const FF& class_id);
};

} // namespace bb::avm2::simulation
