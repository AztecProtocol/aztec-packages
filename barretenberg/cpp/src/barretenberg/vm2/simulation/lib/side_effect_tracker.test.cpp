#include "barretenberg/vm2/simulation/lib/side_effect_tracker.hpp"

#include <gtest/gtest.h>

namespace bb::avm2::simulation {

TEST(SideEffectTrackerTest, GetNumUnencryptedLogFields)
{
    TrackedSideEffects side_effect_states = { .public_logs = {} };
    EXPECT_EQ(side_effect_states.get_num_unencrypted_log_fields(), 0);

    side_effect_states.public_logs.push_back(PublicLog{ { 1, 2 }, 0xdeadbeef });
    EXPECT_EQ(side_effect_states.get_num_unencrypted_log_fields(), 2 + PUBLIC_LOG_HEADER_LENGTH);

    side_effect_states.public_logs.push_back(PublicLog{ {
                                                            1,
                                                            2,
                                                            3,
                                                            4,
                                                            5,
                                                        },
                                                        0xdeadbeef });
    EXPECT_EQ(side_effect_states.get_num_unencrypted_log_fields(), 5 + 2 + 2 * PUBLIC_LOG_HEADER_LENGTH);
}

} // namespace bb::avm2::simulation
