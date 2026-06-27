#include "vm2_contracts/fixture_common.hpp"

#include <string>

#include "barretenberg/numeric/uint256/uint256.hpp"

namespace bb::avm2::contracts {

namespace {

// Constructs an FF from a hex string of any length (uint256_t's string ctor requires exactly 64 hex
// digits), left-padding with zeros. Mirrors TS Fr.fromHexString for the pinned test vectors.
FF fr_hex(std::string hex)
{
    if (hex.rfind("0x", 0) == 0) {
        hex = hex.substr(2);
    }
    hex = std::string(64 - hex.size(), '0') + hex;
    return FF(uint256_t("0x" + hex));
}

} // namespace

std::vector<FF> consecutive_fields(size_t count, uint64_t start)
{
    std::vector<FF> fields;
    fields.reserve(count);
    for (size_t i = 0; i < count; ++i) {
        fields.push_back(FF(start + i));
    }
    return fields;
}

std::vector<FF> schnorr_inputs()
{
    return {
        fr_hex("0x065812e335a97c2108ea8cf4ccfe2f9dd6b117a0714f5e18461575be93f61da6"), // pubkey.x
        fr_hex("0x1a915003e8ec534f9a15d926a7ded478e178468ccc4f28e236e67450a55ac622"), // pubkey.y
        fr_hex("0xf3bc3b7147acb9c621fd9f72dbf15ffa"),                                 // sig_s.lo
        fr_hex("0x08599f379f0301dfefdbd0272554454d"),                                 // sig_s.hi
        fr_hex("0x97065383ebbbd76620398792bd259bc2"),                                 // sig_e.lo
        fr_hex("0x2ceaee87f45b7a417f0ffb05451a8c92"),                                 // sig_e.hi
        fr_hex("0x0123456789abcdef0fedcba9876543210123456789abcdef0fedcba987654321"), // message
    };
}

} // namespace bb::avm2::contracts
