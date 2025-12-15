#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/common/log.hpp"
#include "barretenberg/crypto/keccak/keccak.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_keccakf1600.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_memory.hpp"
#include "barretenberg/vm2/testing/macros.hpp"

using ::testing::ElementsAre;

namespace bb::avm2::simulation {
namespace {

class PureKeccakSimulationTest : public ::testing::Test {
  protected:
    MemoryStore memory;
    PureKeccakF1600 keccak;
};

TEST_F(PureKeccakSimulationTest, MatchesReferenceImplementation)
{
    std::array<uint64_t, AVM_KECCAKF1600_STATE_SIZE> input = {
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
    };

    const MemoryAddress src_addr = 1979;
    const MemoryAddress dst_addr = 3030;

    for (size_t i = 0; i < AVM_KECCAKF1600_STATE_SIZE; i++) {
        memory.set(src_addr + static_cast<MemoryAddress>(i), MemoryValue::from<uint64_t>(input[i]));
    }

    keccak.permutation(memory, dst_addr, src_addr);

    // Read output.
    std::array<uint64_t, AVM_KECCAKF1600_STATE_SIZE> output;
    for (size_t i = 0; i < AVM_KECCAKF1600_STATE_SIZE; i++) {
        MemoryValue val = memory.get(dst_addr + static_cast<MemoryAddress>(i));
        EXPECT_EQ(val.get_tag(), MemoryTag::U64);
        output[i] = val.as<uint64_t>();
    }

    ethash_keccakf1600(input.data()); // Mutate input
    EXPECT_THAT(input, testing::ElementsAreArray(output));
}

// Test Vector from: https://github.com/XKCP/XKCP/blob/master/tests/TestVectors/KeccakF-1600-IntermediateValues.txt
TEST_F(PureKeccakSimulationTest, OfficialTestVectorEmptyInput)
{
    std::array<uint64_t, AVM_KECCAKF1600_STATE_SIZE> input{};

    for (size_t i = 0; i < AVM_KECCAKF1600_STATE_SIZE; i++) {
        memory.set(static_cast<MemoryAddress>(i), MemoryValue::from<uint64_t>(input[i]));
    }

    keccak.permutation(memory, 0, 0);

    std::array<uint64_t, AVM_KECCAKF1600_STATE_SIZE> output{};
    for (size_t i = 0; i < AVM_KECCAKF1600_STATE_SIZE; i++) {
        MemoryValue val = memory.get(static_cast<MemoryAddress>(i));
        EXPECT_EQ(val.get_tag(), MemoryTag::U64);
        output[i] = val.as<uint64_t>();
    }

    EXPECT_THAT(output,
                ElementsAre(0xF1258F7940E1DDE7,
                            0x84D5CCF933C0478A,
                            0xD598261EA65AA9EE,
                            0xBD1547306F80494D,
                            0x8B284E056253D057,
                            0xFF97A42D7F8E6FD4,
                            0x90FEE5A0A44647C4,
                            0x8C5BDA0CD6192E76,
                            0xAD30A6F71B19059C,
                            0x30935AB7D08FFC64,
                            0xEB5AA93F2317D635,
                            0xA9A6E6260D712103,
                            0x81A57C16DBCF555F,
                            0x43B831CD0347C826,
                            0x01F22F1A11A5569F,
                            0x05E5635A21D9AE61,
                            0x64BEFEF28CC970F2,
                            0x613670957BC46611,
                            0xB87C5A554FD00ECB,
                            0x8C3EE88A1CCF32C8,
                            0x940C7922AE3A2614,
                            0x1841F924A2C509E4,
                            0x16F53526E70465C2,
                            0x75F644E97F30A13B,
                            0xEAF1FF7B5CECA249));
}

TEST_F(PureKeccakSimulationTest, OfficialTestVector)
{
    std::array<uint64_t, AVM_KECCAKF1600_STATE_SIZE> input = {
        0xF1258F7940E1DDE7, 0x84D5CCF933C0478A, 0xD598261EA65AA9EE, 0xBD1547306F80494D, 0x8B284E056253D057,
        0xFF97A42D7F8E6FD4, 0x90FEE5A0A44647C4, 0x8C5BDA0CD6192E76, 0xAD30A6F71B19059C, 0x30935AB7D08FFC64,
        0xEB5AA93F2317D635, 0xA9A6E6260D712103, 0x81A57C16DBCF555F, 0x43B831CD0347C826, 0x01F22F1A11A5569F,
        0x05E5635A21D9AE61, 0x64BEFEF28CC970F2, 0x613670957BC46611, 0xB87C5A554FD00ECB, 0x8C3EE88A1CCF32C8,
        0x940C7922AE3A2614, 0x1841F924A2C509E4, 0x16F53526E70465C2, 0x75F644E97F30A13B, 0xEAF1FF7B5CECA249,
    };

    for (size_t i = 0; i < AVM_KECCAKF1600_STATE_SIZE; i++) {
        memory.set(static_cast<MemoryAddress>(i), MemoryValue::from<uint64_t>(input[i]));
    }

    keccak.permutation(memory, 0, 0);

    std::array<uint64_t, AVM_KECCAKF1600_STATE_SIZE> output{};
    for (size_t i = 0; i < AVM_KECCAKF1600_STATE_SIZE; i++) {
        MemoryValue val = memory.get(static_cast<MemoryAddress>(i));
        EXPECT_EQ(val.get_tag(), MemoryTag::U64);
        output[i] = val.as<uint64_t>();
    }

    EXPECT_THAT(output,
                ElementsAre(
                    // 3C CB 6E F9 4D 95 5C 2D in little endian
                    0x2D5C954DF96ECB3C,
                    // 6D B5 57 70 D0 2C 33 6A in little endian
                    0x6A332CD07057B56D,
                    // 6C 6B D7 70 12 8D 3D 09 in little endian
                    0x093D8D1270D76B6C,
                    // 94 D0 69 55 B2 D9 20 8A in little endian
                    0x8A20D9B25569D094,
                    // 56 F1 E7 E5 99 4F 9C 4F in little endian
                    0x4F9C4F99E5E7F156,
                    // 38 FB 65 DA A2 B9 57 F9 in little endian
                    0xF957B9A2DA65FB38,
                    // 0D AF 75 12 AE 3D 77 85 in little endian
                    0x85773DAE1275AF0D,
                    // F7 10 D8 C3 47 F2 F4 FA in little endian
                    0xFAF4F247C3D810F7,
                    // 59 87 9A F7 E6 9E 1B 1F in little endian
                    0x1F1B9EE6F79A8759,
                    // 25 B4 98 EE 0F CC FE E4 in little endian
                    0xE4FECC0FEE98B425,
                    // A1 68 CE B9 B6 61 CE 68 in little endian
                    0x68CE61B6B9CE68A1,
                    // 4F 97 8F BA C4 66 EA DE in little endian
                    0xDEEA66C4BA8F974F,
                    // F5 B1 AF 6E 83 3D C4 33 in little endian
                    0x33C43D836EAFB1F5,
                    // D9 DB 19 27 04 54 06 E0 in little endian
                    0xE00654042719DBD9,
                    // 65 12 83 09 F0 A9 F8 7C in little endian
                    0x7CF8A9F009831265,
                    // 43 47 17 BF A6 49 54 FD in little endian
                    0xFD5449A6BF174743,
                    // 40 4B 99 D8 33 AD DD 97 in little endian
                    0x97DDAD33D8994B40,
                    // 74 E7 0B 5D FC D5 EA 48 in little endian
                    0x48EAD5FC5D0BE774,
                    // 3C B0 B7 55 EE C8 B8 E3 in little endian
                    0xE3B8C8EE55B7B03C,
                    // E9 42 9E 64 6E 22 A0 91 in little endian
                    0x91A0226E649E42E9,
                    // 7B DD BA E7 29 31 0E 90 in little endian
                    0x900E3129E7BADD7B,
                    // E8 CC A3 FA C5 9E 2A 20 in little endian
                    0x202A9EC5FAA3CCE8,
                    // B6 3D 1C 4E 46 02 34 5B in little endian
                    0x5B3402464E1C3DB6,
                    // 59 10 4C A4 62 4E 9F 60 in little endian
                    0x609F4E62A44C1059,
                    // 5C BF 8F 6A D2 6C D0 20 in little endian
                    0x20D06CD26A8FBF5C));
}

TEST_F(PureKeccakSimulationTest, TagError)
{
    const MemoryAddress src_addr = 1970;
    const MemoryAddress src_addr_wrong_tag = 1979;
    const MemoryAddress dst_addr = 3030;
    const MemoryTag wrong_tag = MemoryTag::U128;

    // Initialize the full slice with U64 values in standard Keccak layout
    for (size_t i = 0; i < AVM_KECCAKF1600_STATE_SIZE; i++) {
        memory.set(src_addr + static_cast<MemoryAddress>(i),
                   MemoryValue::from_tag_truncating(MemoryTag::U64, (i * i) + 187));
    }

    // Override just the first value with U128 to trigger the tag error
    memory.set(src_addr_wrong_tag, MemoryValue::from_tag_truncating(wrong_tag, 0));

    EXPECT_THROW_WITH_MESSAGE(
        keccak.permutation(memory, dst_addr, src_addr),
        format("Read slice tag invalid - addr: ", src_addr_wrong_tag, " tag: ", static_cast<uint32_t>(wrong_tag)));
}

TEST_F(PureKeccakSimulationTest, SrcSliceOutOfBounds)
{
    const MemoryAddress src_addr = AVM_HIGHEST_MEM_ADDRESS - AVM_KECCAKF1600_STATE_SIZE + 2;
    const MemoryAddress dst_addr = 3030;

    EXPECT_THROW_WITH_MESSAGE(keccak.permutation(memory, dst_addr, src_addr), "Read slice out of range");
}

TEST_F(PureKeccakSimulationTest, DstSliceOutOfBounds)
{
    const MemoryAddress src_addr = 1970;
    const MemoryAddress dst_addr = AVM_HIGHEST_MEM_ADDRESS - AVM_KECCAKF1600_STATE_SIZE + 2;

    EXPECT_THROW_WITH_MESSAGE(keccak.permutation(memory, dst_addr, src_addr), "Write slice out of range");
}

} // namespace
} // namespace bb::avm2::simulation
