#pragma once

#include <stack>
#include <unordered_map>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

struct TrackedSideEffects {
    std::vector<FF> nullifiers;
    std::vector<FF> note_hashes;
    std::vector<ScopedL2ToL1Message> l2_to_l1_messages;
    PublicLogs public_logs;
    // These two are required for on-the-fly squashing.
    // The slots are tracked in the order that they were written.
    std::vector<FF> storage_writes_slots_by_insertion;
    std::unordered_map<FF, FF> storage_writes_slot_to_value;

    uint32_t get_num_unencrypted_log_fields() const;
};

/**
 * @brief Interface for a side effect tracker.
 *
 * This is the equivalent to the SideEffectTrace in TypeScript.
 */
class SideEffectTrackerInterface {
  public:
    virtual ~SideEffectTrackerInterface() = default;
    virtual void add_nullifier(const FF& siloed_nullifier) = 0;
    virtual void add_note_hash(const FF& siloed_unique_note_hash) = 0;
    virtual void add_l2_to_l1_message(const AztecAddress& contract_address,
                                      const EthAddress& recipient,
                                      const FF& content) = 0;
    virtual void add_public_log(const AztecAddress& contract_address, const std::vector<FF>& fields) = 0;
    virtual void add_storage_write(const FF& slot, const FF& value) = 0;

    virtual void create_checkpoint() = 0;
    virtual void commit_checkpoint() = 0;
    virtual void revert_checkpoint() = 0;

    virtual const TrackedSideEffects& get_side_effects() const = 0;
};

class SideEffectTracker : public SideEffectTrackerInterface {
  public:
    void add_nullifier(const FF& siloed_nullifier) override;
    void add_note_hash(const FF& siloed_unique_note_hash) override;
    void add_l2_to_l1_message(const AztecAddress& contract_address,
                              const EthAddress& recipient,
                              const FF& content) override;
    void add_public_log(const AztecAddress& contract_address, const std::vector<FF>& fields) override;
    void add_storage_write(const FF& slot, const FF& value) override;

    void create_checkpoint() override;
    void commit_checkpoint() override;
    void revert_checkpoint() override;

    const TrackedSideEffects& get_side_effects() const override { return tracked_tree_side_effects.top(); }

  private:
    std::stack<TrackedSideEffects> tracked_tree_side_effects{ { TrackedSideEffects{} } };
};

} // namespace bb::avm2::simulation
