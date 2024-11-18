#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/avm_inputs.hpp"

#include <cstdint>

#include "barretenberg/bb/file_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2 {
namespace {

std::vector<uint8_t> string_to_buffer(const std::string& str)
{
    return { str.begin(), str.end() };
}

TEST(AvmInputsTest, Deserialization)
{
    auto data = read_file("src/barretenberg/vm2/common/avm_inputs.testdata.bin");
    auto inputs = AvmProvingInputs::from(data);

    AvmProvingInputs expected = {
        .enqueuedCalls = {
            {
                .contractAddress = AztecAddress(0x123456),
                .sender = AztecAddress(0x000010),
                .args = {
                    FF(0x111111), FF(0x222222), FF(0x333333),
                },
                .isStatic = false,
            },
            {
                .contractAddress = AztecAddress(0x654321),
                .sender = AztecAddress(0x000020),
                .args = {
                    FF(0x222222), FF(0x333333), FF(0x444444),
                },
                .isStatic = true,
            },
        },
        .publicInputs = {
            .dummy = {}
        },
        .hints = {
            .contractInstances = {
                {
                    .address = AztecAddress(0x123456),
                    .exists = true,
                    .salt = FF(0xdeadbeef),
                    .deployer = AztecAddress(0x000010),
                    .contractClassId = ContractClassId(0x41181337),
                    .initializationHash = FF(0x111111),
                    .publicKeys = {
                        .masterNullifierPublicKey = AffinePoint(
                            FF("0x16421839f863564fbe9035338aa8ef7bda077d04b178b1353e781cac7e83d155"),
                            FF("0x2b6a73d9c017111f8223c81980e9ad167e1dec57d3f2fa649b11355b70b5f086")),
                        .masterIncomingViewingPublicKey = AffinePoint(
                            FF("0x047d001b3998ca8ae785c6a06870d4b56335f510743f3e68fda159fe60f22582"),
                            FF("0x1500cab14a6ea87cb26389431b0739bcf4b159d0e25b2c3a1cab94944254dcc4")),
                        .masterOutgoingViewingPublicKey = AffinePoint(
                            FF("0x03e11607d5adc8ce958646d7ef7cdcd8f4f48e0af20eca0ab4b07e8d1fc23dee"),
                            FF("0x1c89d3deed018ba1dbc81b9dfe265b367dbcf383f7e4374ba5c749028ba97158")),
                        .masterTaggingPublicKey = AffinePoint(
                            FF("0x268630a713908316c9af34f1d0f7f6e9dd80311b4973e2025bd86669a9955b23"),
                            FF("0x227bca4c20b3000895ddb7f69d0cb375247d6ef49beffc54a8d264731d52fd24")),
                    },
                },
                {
                    .address = AztecAddress(0x654321),
                    .exists = false,
                    .salt = FF(0xdead0000),
                    .deployer = AztecAddress(0x000020),
                    .contractClassId = ContractClassId(0x51181337),
                    .initializationHash = FF(0x222222),
                    .publicKeys = {
                        .masterNullifierPublicKey = AffinePoint(
                            FF("0x16421839f863564fbe9035338aa8ef7bda077d04b178b1353e781cac7e83d155"),
                            FF("0x2b6a73d9c017111f8223c81980e9ad167e1dec57d3f2fa649b11355b70b5f086")),
                        .masterIncomingViewingPublicKey = AffinePoint(
                            FF("0x047d001b3998ca8ae785c6a06870d4b56335f510743f3e68fda159fe60f22582"),
                            FF("0x1500cab14a6ea87cb26389431b0739bcf4b159d0e25b2c3a1cab94944254dcc4")),
                        .masterOutgoingViewingPublicKey = AffinePoint(
                            FF("0x03e11607d5adc8ce958646d7ef7cdcd8f4f48e0af20eca0ab4b07e8d1fc23dee"),
                            FF("0x1c89d3deed018ba1dbc81b9dfe265b367dbcf383f7e4374ba5c749028ba97158")),
                        .masterTaggingPublicKey = AffinePoint(
                            FF("0x268630a713908316c9af34f1d0f7f6e9dd80311b4973e2025bd86669a9955b23"),
                            FF("0x227bca4c20b3000895ddb7f69d0cb375247d6ef49beffc54a8d264731d52fd24")),
                    },
                },
            },
            .contractClasses = {
                {
                    .artifactHash = FF(0xdeadbeef),
                    .privateFunctionsRoot = FF(0x111111),
                    .publicBytecodeCommitment = FF(0x222222),
                    .packedBytecode = string_to_buffer("firstbuffer"),
                },
                {
                    .artifactHash = FF(0xdead0000),
                    .privateFunctionsRoot = FF(0x222222),
                    .publicBytecodeCommitment = FF(0x333333),
                    .packedBytecode = string_to_buffer("secondbuffer"),
                },
            },
        },
    };

    // Sorry but if this fails you'll get no useful information!
    // Limitations of GTEST.
    EXPECT_EQ(inputs.enqueuedCalls, expected.enqueuedCalls);
    EXPECT_EQ(inputs.publicInputs, expected.publicInputs);
    EXPECT_EQ(inputs.hints.contractClasses, expected.hints.contractClasses);
    EXPECT_EQ(inputs.hints.contractInstances, expected.hints.contractInstances);
    EXPECT_EQ(inputs, expected); // Catch all.
}

} // namespace
} // namespace bb::avm2