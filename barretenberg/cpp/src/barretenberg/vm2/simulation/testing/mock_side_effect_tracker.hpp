#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/lib/side_effect_tracker.hpp"

namespace bb::avm2::simulation {

class MockSideEffectTracker : public SideEffectTrackerInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockSideEffectTracker();
    ~MockSideEffectTracker() override;

    MOCK_METHOD(void, add_nullifier, (const FF& siloed_nullifier), (override));
    MOCK_METHOD(void, add_note_hash, (const FF& siloed_unique_note_hash), (override));
    MOCK_METHOD(void,
                add_l2_to_l1_message,
                (const AztecAddress& contract_address, const EthAddress& recipient, const FF& content),
                (override));
    MOCK_METHOD(void,
                add_public_log,
                (const AztecAddress& contract_address, const std::vector<FF>& fields),
                (override));
    MOCK_METHOD(void, add_storage_write, (const FF& slot, const FF& value), (override));
    MOCK_METHOD(void, create_checkpoint, (), (override));
    MOCK_METHOD(void, commit_checkpoint, (), (override));
    MOCK_METHOD(void, revert_checkpoint, (), (override));
    MOCK_METHOD(const TrackedSideEffects&, get_side_effects, (), (const, override));
};

} // namespace bb::avm2::simulation
