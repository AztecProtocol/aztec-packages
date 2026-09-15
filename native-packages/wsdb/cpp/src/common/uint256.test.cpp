#include "common/uint256.hpp"
#include "field/field_element.hpp"

#include <cstdint>
#include <cstring>
#include <gtest/gtest.h>
#include <string>

// Backward-compatibility lock for the on-disk lmdb KEY format. wsdb keys nodes/leaves by
// FrKeyType = numeric::uint256_t, and lmdblib serialises a key by raw memcpy of the struct.
// barretenberg's uint256_t (and ours) is { uint64_t data[4] } with data[0] = least-
// significant limb, so the on-disk key is the canonical value in LITTLE-ENDIAN limb order.
// FieldElement stores big-endian canonical bytes; this verifies the BE<->LE conversion and
// the resulting key bytes match the pre-decouple format exactly.
using azteclabs::wsdb::numeric::uint256_t;
using azteclabs::wsdb::FieldElement;

TEST(Uint256KeyFormat, LittleEndianCanonicalKeyBytes)
{
    // Canonical value 0x...0102030405060708 (low 64 bits set, rest zero).
    FieldElement fe(std::string("0x0000000000000000000000000000000000000000000000000102030405060708"));
    uint256_t k(fe);
    EXPECT_EQ(k.data[0], 0x0102030405060708ULL);
    EXPECT_EQ(k.data[1], 0ULL);
    EXPECT_EQ(k.data[2], 0ULL);
    EXPECT_EQ(k.data[3], 0ULL);

    // The lmdb key is a raw memcpy of the uint256_t -> little-endian limb bytes.
    uint8_t buf[32];
    std::memcpy(buf, &k, 32);
    uint8_t expected[32] = { 0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01 };
    EXPECT_EQ(0, std::memcmp(buf, expected, 32));

    // And it round-trips back to the same field element.
    EXPECT_EQ(static_cast<FieldElement>(k), fe);
}

TEST(Uint256KeyFormat, LimbExtractionAcrossFullWidth)
{
    FieldElement fe(std::string("0xfedcba9876543210ffffffffffffffff00000000000000001122334455667788"));
    uint256_t k(fe);
    EXPECT_EQ(k.data[3], 0xfedcba9876543210ULL); // most-significant limb
    EXPECT_EQ(k.data[2], 0xffffffffffffffffULL);
    EXPECT_EQ(k.data[1], 0x0000000000000000ULL);
    EXPECT_EQ(k.data[0], 0x1122334455667788ULL); // least-significant limb
    EXPECT_EQ(static_cast<FieldElement>(k), fe);
}
