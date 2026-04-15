#include "barretenberg/vm2/simulation/gadgets/calldata_hashing.hpp"

#include "gmock/gmock.h"
#include <cstdint>
#include <gtest/gtest.h>
#include <memory>
#include <optional>
#include <vector>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/calldata_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/testing/mock_dbs.hpp"
#include "barretenberg/vm2/simulation/testing/mock_poseidon2.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"

namespace bb::avm2::simulation {

using ::testing::AllOf;
using ::testing::ElementsAre;
using ::testing::Field;
using ::testing::Return;
using ::testing::SizeIs;
using ::testing::StrictMock;

using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

namespace {

class CalldataHashingTest : public ::testing::Test {
  protected:
    CalldataHashingTest()
        : calldata_hasher(context_id, poseidon2, calldata_events)
    {}

    uint32_t context_id = 1;
    StrictMock<MockPoseidon2> poseidon2;
    EventEmitter<CalldataEvent> calldata_events;
    CalldataHasher calldata_hasher;
};

TEST_F(CalldataHashingTest, SimpleHash)
{
    // The hardcoded value is taken from noir-projects/aztec-nr/aztec/src/hash.nr:
    FF hash = FF("0x14a1539bdb1d26e03097cf4d40c87e02ca03f0bb50a3e617ace5a7bfd3943944");

    std::vector<FF> calldata_fields = {};
    calldata_fields.reserve(100);
    for (uint32_t i = 0; i < 100; i++) {
        calldata_fields.push_back(FF(i));
    }

    std::vector<FF> prepended_calldata_fields = { DOM_SEP__PUBLIC_CALLDATA };
    prepended_calldata_fields.insert(prepended_calldata_fields.end(), calldata_fields.begin(), calldata_fields.end());

    EXPECT_CALL(poseidon2, hash(prepended_calldata_fields)).WillOnce(Return(hash));

    calldata_hasher.assert_calldata_hash(hash, calldata_fields);

    EXPECT_THAT(
        calldata_events.dump_events(),
        AllOf(SizeIs(1),
              ElementsAre(AllOf(Field(&CalldataEvent::context_id, 1), Field(&CalldataEvent::calldata, SizeIs(100))))));
}

TEST_F(CalldataHashingTest, Hash)
{
    std::vector<FF> calldata = testing::random_fields(500);
    std::vector<FF> prepended_calldata_fields = { DOM_SEP__PUBLIC_CALLDATA };
    prepended_calldata_fields.insert(prepended_calldata_fields.end(), calldata.begin(), calldata.end());

    auto hash = RawPoseidon2::hash(prepended_calldata_fields);
    EXPECT_CALL(poseidon2, hash(prepended_calldata_fields)).WillOnce(Return(hash));

    calldata_hasher.assert_calldata_hash(hash, calldata);
    EXPECT_THAT(
        calldata_events.dump_events(),
        AllOf(SizeIs(1),
              ElementsAre(AllOf(Field(&CalldataEvent::context_id, 1), Field(&CalldataEvent::calldata, calldata)))));
}

TEST_F(CalldataHashingTest, Empty)
{
    std::vector<FF> calldata = {};
    // If we recieve empty calldata, we just hash the separator:
    std::vector<FF> prepended_calldata_fields = { DOM_SEP__PUBLIC_CALLDATA };

    auto hash = RawPoseidon2::hash(prepended_calldata_fields);
    EXPECT_CALL(poseidon2, hash(prepended_calldata_fields)).WillOnce(Return(hash));

    calldata_hasher.assert_calldata_hash(hash, calldata);
    EXPECT_THAT(
        calldata_events.dump_events(),
        AllOf(SizeIs(1),
              ElementsAre(AllOf(Field(&CalldataEvent::context_id, 1), Field(&CalldataEvent::calldata, calldata)))));
}

} // namespace
} // namespace bb::avm2::simulation
