#include "barretenberg/vm2/tracegen/lib/discard_reconstruction.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/testing/macros.hpp"

namespace bb::avm2::tracegen {
namespace {

using simulation::CheckPointEventType;

struct PayloadEvent {
    uint64_t foo;
};

struct Row {
    uint64_t foo;
    bool discard;

    bool operator==(const Row& other) const = default;
};

using EventVariant = std::variant<PayloadEvent, CheckPointEventType>;

using ::testing::AllOf;
using ::testing::ElementsAre;

std::vector<Row> tracegen(std::vector<EventVariant>& events)
{
    std::vector<Row> rows;

    process_with_discard(events, [&](const PayloadEvent& event, bool discard) {
        rows.push_back({ .foo = event.foo, .discard = discard });
    });

    return rows;
}

TEST(DiscardReconstructionTest, DiscardNestedReverts)
{
    std::vector<EventVariant> events = {
        CheckPointEventType::CREATE_CHECKPOINT,
        PayloadEvent{
            .foo = 1000,
        },

        CheckPointEventType::CREATE_CHECKPOINT,
        PayloadEvent{
            .foo = 1001,
        },
        CheckPointEventType::REVERT_CHECKPOINT,
        PayloadEvent{
            .foo = 1002,
        },
        CheckPointEventType::REVERT_CHECKPOINT,
        PayloadEvent{
            .foo = 1003,
        },
    };

    auto rows = tracegen(events);

    EXPECT_THAT(rows,
                ElementsAre(AllOf(Row{ .foo = 1000, .discard = 1 }),
                            AllOf(Row{ .foo = 1001, .discard = 1 }),
                            AllOf(Row{ .foo = 1002, .discard = 1 }),
                            // Not discarded
                            AllOf(Row{ .foo = 1003, .discard = 0 })));
}

TEST(DiscardReconstructionTest, DiscardSequentialReverts)
{
    std::vector<EventVariant> events = {
        PayloadEvent{
            .foo = 1000,
        },

        CheckPointEventType::CREATE_CHECKPOINT,
        PayloadEvent{
            .foo = 1001,
        },
        CheckPointEventType::REVERT_CHECKPOINT,
        PayloadEvent{
            .foo = 1002,
        },
        CheckPointEventType::CREATE_CHECKPOINT,
        PayloadEvent{
            .foo = 1003,
        },
        CheckPointEventType::REVERT_CHECKPOINT,
        PayloadEvent{
            .foo = 1004,
        },
    };

    auto rows = tracegen(events);

    EXPECT_THAT(rows,
                ElementsAre(AllOf(Row{ .foo = 1000, .discard = 0 }),
                            // First discarded checkpoint
                            AllOf(Row{ .foo = 1001, .discard = 1 }),
                            // End first discarded checkpoint
                            AllOf(Row{ .foo = 1002, .discard = 0 }),
                            // Second discarded checkpoint
                            AllOf(Row{ .foo = 1003, .discard = 1 }),
                            // End second discarded checkpoint
                            AllOf(Row{ .foo = 1004, .discard = 0 })));
}

} // namespace
} // namespace bb::avm2::tracegen
