#include "barretenberg/vm2/simulation/gadgets/bytecode_hashing.hpp"

#include "gmock/gmock.h"
#include <cstdint>
#include <gtest/gtest.h>
#include <memory>
#include <optional>
#include <vector>

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation/testing/mock_dbs.hpp"
#include "barretenberg/vm2/simulation/testing/mock_poseidon2.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
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

class BytecodeHashingTest : public ::testing::Test {
  protected:
    BytecodeHashingTest()
        : bytecode_hasher(poseidon2, hashing_events)
    {}

    StrictMock<MockPoseidon2> poseidon2;
    EventEmitter<BytecodeHashingEvent> hashing_events;
    BytecodeHasher bytecode_hasher;
};

TEST_F(BytecodeHashingTest, SimpleHash)
{
    // The hardcoded value is taken from noir-projects/aztec-nr/aztec/src/hash.nr:
    FF hash = FF("0x16d621c3387156ef53754679e7b2c9be8f0bceeb44aa59a74991df3b0b42a0bf");

    std::vector<FF> bytecode_fields = {};
    for (uint32_t i = 1; i < 100; i++) {
        bytecode_fields.push_back(FF(i));
    }

    std::vector<uint8_t> bytecode = {};
    for (auto bytecode_field : bytecode_fields) {
        auto bytes = to_buffer(bytecode_field);
        // Each field elt of encoded bytecode represents 31 bytes, but to_buffer returns 32, hence start at +1:
        bytecode.insert(bytecode.end(), bytes.begin() + 1, bytes.end());
    }

    bytecode_fields.insert(bytecode_fields.begin(), GENERATOR_INDEX__PUBLIC_BYTECODE);

    EXPECT_CALL(poseidon2, hash(bytecode_fields)).WillOnce(Return(hash));

    bytecode_hasher.assert_public_bytecode_commitment(FF(0xc0ffee), bytecode, hash);

    EXPECT_THAT(hashing_events.dump_events(),
                AllOf(SizeIs(1),
                      ElementsAre(AllOf(Field(&BytecodeHashingEvent::bytecode_id, 0xc0ffee),
                                        Field(&BytecodeHashingEvent::bytecode_length, 3069),
                                        Field(&BytecodeHashingEvent::bytecode_fields, SizeIs(99))))));
}

TEST_F(BytecodeHashingTest, Hash)
{
    std::vector<uint8_t> bytecode = testing::random_bytes(500);
    std::vector<FF> bytecode_fields = encode_bytecode(bytecode);
    std::vector<FF> prepended_bytecode_fields = { GENERATOR_INDEX__PUBLIC_BYTECODE };
    prepended_bytecode_fields.insert(prepended_bytecode_fields.end(), bytecode_fields.begin(), bytecode_fields.end());

    auto hash = RawPoseidon2::hash(prepended_bytecode_fields);
    EXPECT_CALL(poseidon2, hash(prepended_bytecode_fields)).WillOnce(Return(hash));

    bytecode_hasher.assert_public_bytecode_commitment(FF(0xc0ffee), bytecode, hash);

    EXPECT_THAT(hashing_events.dump_events(),
                AllOf(SizeIs(1),
                      ElementsAre(AllOf(Field(&BytecodeHashingEvent::bytecode_id, 0xc0ffee),
                                        Field(&BytecodeHashingEvent::bytecode_length, 500),
                                        Field(&BytecodeHashingEvent::bytecode_fields, bytecode_fields)))));
}

} // namespace
} // namespace bb::avm2::simulation
