#include "barretenberg/vm2/simulation/lib/side_effect_tracker.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

namespace bb::avm2::simulation {
namespace {

using ::testing::ElementsAre;
using ::testing::Eq;
using ::testing::IsEmpty;
using ::testing::Pair;
using ::testing::UnorderedElementsAre;

TEST(SideEffectTrackerTest, GetNumUnencryptedLogFields)
{
    TrackedSideEffects side_effect_states = { .public_logs = {} };
    EXPECT_EQ(side_effect_states.get_num_unencrypted_log_fields(), 0);

    side_effect_states.public_logs.add_log(PublicLog{ { 1, 2 }, 0xdeadbeef });
    EXPECT_EQ(side_effect_states.get_num_unencrypted_log_fields(), 2 + PUBLIC_LOG_HEADER_LENGTH);

    side_effect_states.public_logs.add_log(PublicLog{ {
                                                          1,
                                                          2,
                                                          3,
                                                          4,
                                                          5,
                                                      },
                                                      0xdeadbeef });
    EXPECT_EQ(side_effect_states.get_num_unencrypted_log_fields(), 5 + 2 + (2 * PUBLIC_LOG_HEADER_LENGTH));
}

TEST(SideEffectTrackerTest, AddNullifier)
{
    SideEffectTracker tracker;
    EXPECT_THAT(tracker.get_side_effects().nullifiers, IsEmpty());

    tracker.add_nullifier(FF(123));
    EXPECT_THAT(tracker.get_side_effects().nullifiers, ElementsAre(FF(123)));

    tracker.add_nullifier(FF(456));
    EXPECT_THAT(tracker.get_side_effects().nullifiers, ElementsAre(FF(123), FF(456)));
}

TEST(SideEffectTrackerTest, AddNoteHash)
{
    SideEffectTracker tracker;
    EXPECT_THAT(tracker.get_side_effects().note_hashes, IsEmpty());

    tracker.add_note_hash(FF(789));
    EXPECT_THAT(tracker.get_side_effects().note_hashes, ElementsAre(FF(789)));

    tracker.add_note_hash(FF(101112));
    EXPECT_THAT(tracker.get_side_effects().note_hashes, ElementsAre(FF(789), FF(101112)));
}

TEST(SideEffectTrackerTest, AddL2ToL1Message)
{
    SideEffectTracker tracker;
    EXPECT_THAT(tracker.get_side_effects().l2_to_l1_messages, IsEmpty());

    AztecAddress contract_addr(0x1234);
    EthAddress recipient(0x5678);
    FF content(999);

    tracker.add_l2_to_l1_message(contract_addr, recipient, content);
    EXPECT_THAT(tracker.get_side_effects().l2_to_l1_messages,
                ElementsAre(ScopedL2ToL1Message{ .message = { .recipient = recipient, .content = content },
                                                 .contractAddress = contract_addr }));
}

TEST(SideEffectTrackerTest, AddPublicLog)
{
    SideEffectTracker tracker;
    EXPECT_EQ(tracker.get_side_effects().public_logs.length, 0);

    AztecAddress contract_addr(0xabcd);
    std::vector<FF> fields = { FF(1), FF(2), FF(3) };

    tracker.add_public_log(contract_addr, fields);

    PublicLogs expected_logs =
        PublicLogs::from_logs({ PublicLog{ .fields = fields, .contractAddress = contract_addr } });
    EXPECT_EQ(tracker.get_side_effects().public_logs, expected_logs);
}

TEST(SideEffectTrackerTest, AddStorageWrite)
{
    SideEffectTracker tracker;
    EXPECT_THAT(tracker.get_side_effects().storage_writes_slots_by_insertion, IsEmpty());

    FF slot1(100);
    FF value1(200);
    tracker.add_storage_write(slot1, value1);
    EXPECT_THAT(tracker.get_side_effects().storage_writes_slot_to_value, UnorderedElementsAre(Pair(slot1, value1)));
    EXPECT_THAT(tracker.get_side_effects().storage_writes_slots_by_insertion, ElementsAre(slot1));
}

TEST(SideEffectTrackerTest, AddStorageWriteOverwrite)
{
    SideEffectTracker tracker;
    FF slot(100);
    FF value1(200);
    FF value2(300);

    tracker.add_storage_write(slot, value1);
    EXPECT_THAT(tracker.get_side_effects().storage_writes_slot_to_value, UnorderedElementsAre(Pair(slot, value1)));
    EXPECT_THAT(tracker.get_side_effects().storage_writes_slots_by_insertion, ElementsAre(slot));

    tracker.add_storage_write(slot, value2);
    EXPECT_THAT(tracker.get_side_effects().storage_writes_slot_to_value, UnorderedElementsAre(Pair(slot, value2)));
    EXPECT_THAT(tracker.get_side_effects().storage_writes_slots_by_insertion, ElementsAre(slot));
}

TEST(SideEffectTrackerTest, CreateAndCommitCheckpoint)
{
    SideEffectTracker tracker;

    auto expect_contents = [&]() {
        EXPECT_THAT(tracker.get_side_effects().nullifiers, ElementsAre(FF(1), FF(3)));
        EXPECT_THAT(tracker.get_side_effects().note_hashes, ElementsAre(FF(2), FF(4)));
        EXPECT_THAT(tracker.get_side_effects().storage_writes_slots_by_insertion,
                    ElementsAre(FF(100), FF(200), FF(400)));
        EXPECT_THAT(tracker.get_side_effects().storage_writes_slot_to_value,
                    UnorderedElementsAre(Pair(FF(100), FF(300)), Pair(FF(200), FF(300)), Pair(FF(400), FF(400))));
        EXPECT_THAT(tracker.get_side_effects().public_logs,
                    Eq(PublicLogs::from_logs(
                        { PublicLog{ .fields = { FF(1), FF(2), FF(3) }, .contractAddress = AztecAddress(0x1234) },
                          PublicLog{ .fields = { FF(4), FF(5), FF(6) }, .contractAddress = AztecAddress(0x2222) } })));
        EXPECT_THAT(
            tracker.get_side_effects().l2_to_l1_messages,
            ElementsAre(ScopedL2ToL1Message{ .message = { .recipient = EthAddress(0x5678), .content = FF(999) },
                                             .contractAddress = AztecAddress(0x1234) },
                        ScopedL2ToL1Message{ .message = { .recipient = EthAddress(0x3333), .content = FF(1000) },
                                             .contractAddress = AztecAddress(0x2222) }));
    };

    tracker.add_nullifier(FF(1));
    tracker.add_note_hash(FF(2));
    tracker.add_storage_write(FF(100), FF(200));
    tracker.add_storage_write(FF(200), FF(300));
    tracker.add_public_log(AztecAddress(0x1234), { FF(1), FF(2), FF(3) });
    tracker.add_l2_to_l1_message(AztecAddress(0x1234), EthAddress(0x5678), FF(999));
    tracker.create_checkpoint();

    tracker.add_nullifier(FF(3));
    tracker.add_note_hash(FF(4));
    tracker.add_storage_write(FF(100), FF(300));
    tracker.add_storage_write(FF(400), FF(400));
    tracker.add_public_log(AztecAddress(0x2222), { FF(4), FF(5), FF(6) });
    tracker.add_l2_to_l1_message(AztecAddress(0x2222), EthAddress(0x3333), FF(1000));

    expect_contents();

    tracker.commit_checkpoint();

    expect_contents();
}

TEST(SideEffectTrackerTest, CreateAndRevertCheckpoint)
{
    SideEffectTracker tracker;

    auto expect_contents = [&]() {
        EXPECT_THAT(tracker.get_side_effects().nullifiers, ElementsAre(FF(1)));
        EXPECT_THAT(tracker.get_side_effects().note_hashes, ElementsAre(FF(2)));
        EXPECT_THAT(tracker.get_side_effects().storage_writes_slots_by_insertion, ElementsAre(FF(100), FF(200)));
        EXPECT_EQ(tracker.get_side_effects().storage_writes_slot_to_value.at(FF(100)), FF(200));
        EXPECT_EQ(tracker.get_side_effects().storage_writes_slot_to_value.at(FF(200)), FF(300));
        EXPECT_THAT(tracker.get_side_effects().public_logs,
                    Eq(PublicLogs::from_logs(
                        { PublicLog{ .fields = { FF(1), FF(2), FF(3) }, .contractAddress = AztecAddress(0x1234) } })));
        EXPECT_THAT(tracker.get_side_effects().l2_to_l1_messages,
                    ElementsAre(ScopedL2ToL1Message{ .message = { .recipient = EthAddress(0x5678), .content = FF(999) },
                                                     .contractAddress = AztecAddress(0x1234) }));
    };

    tracker.add_nullifier(FF(1));
    tracker.add_note_hash(FF(2));
    tracker.add_storage_write(FF(100), FF(200));
    tracker.add_storage_write(FF(200), FF(300));
    tracker.add_public_log(AztecAddress(0x1234), { FF(1), FF(2), FF(3) });
    tracker.add_l2_to_l1_message(AztecAddress(0x1234), EthAddress(0x5678), FF(999));
    tracker.create_checkpoint();

    expect_contents();

    tracker.add_nullifier(FF(3));
    tracker.add_note_hash(FF(4));
    tracker.add_storage_write(FF(100), FF(300));
    tracker.add_storage_write(FF(400), FF(400));
    tracker.add_public_log(AztecAddress(0x2222), { FF(4), FF(5), FF(6) });
    tracker.add_l2_to_l1_message(AztecAddress(0x2222), EthAddress(0x3333), FF(1000));
    tracker.revert_checkpoint();

    expect_contents();
}

TEST(SideEffectTrackerTest, NestedCheckpoints)
{
    SideEffectTracker tracker;
    tracker.add_nullifier(FF(1));

    tracker.create_checkpoint();
    tracker.add_nullifier(FF(2));

    tracker.create_checkpoint();
    tracker.add_nullifier(FF(3));
    EXPECT_THAT(tracker.get_side_effects().nullifiers, ElementsAre(FF(1), FF(2), FF(3)));

    tracker.commit_checkpoint();
    EXPECT_THAT(tracker.get_side_effects().nullifiers, ElementsAre(FF(1), FF(2), FF(3)));

    tracker.revert_checkpoint();
    EXPECT_THAT(tracker.get_side_effects().nullifiers, ElementsAre(FF(1)));
}

} // namespace
} // namespace bb::avm2::simulation
