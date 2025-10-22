#pragma once

#include <stack>
#include <unordered_map>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

struct TrackedTreeSideEffects {
    std::vector<FF> nullifiers;
    std::vector<FF> note_hashes;
    std::vector<ScopedL2ToL1Message> l2_to_l1_messages;
    std::vector<PublicLog> public_logs;
    // These two are required for squashing.
    std::vector<FF> storage_writes_slots_by_insertion;
    std::unordered_map<FF, FF> storage_writes_slot_to_value;
};

class SideEffectTracker {
  public:
    void add_nullifier(const FF& siloed_nullifier);
    void add_note_hash(const FF& siloed_unique_note_hash);
    void add_l2_to_l1_message(const AztecAddress& contract_address, const EthAddress& recipient, const FF& content);
    void add_public_log(const AztecAddress& contract_address, const std::vector<FF>& fields);
    void add_storage_write(const FF& slot, const FF& value);

    void create_checkpoint();
    void commit_checkpoint();
    void revert_checkpoint();

    const TrackedTreeSideEffects& get_side_effects() const { return tracked_tree_side_effects.top(); }

  private:
    std::stack<TrackedTreeSideEffects> tracked_tree_side_effects{ { TrackedTreeSideEffects{} } };
};

} // namespace bb::avm2::simulation
