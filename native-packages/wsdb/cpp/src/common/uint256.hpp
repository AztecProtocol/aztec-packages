#pragma once

#include "field/field_element.hpp"
#include <compare>
#include <cstdint>

// Minimal 256-bit unsigned integer for wsdb, replacing barretenberg/numeric/uint256.
// FieldElement (canonical bytes, no arithmetic) is the production key/value type; this
// type exists for the reference/test code (e.g. the nullifier memory tree's abs-diff
// closest-leaf search) that genuinely needs integer arithmetic on field values.
namespace azteclabs::wsdb::numeric {

struct uint256_t {
    uint64_t data[4]{}; // little-endian limbs

    uint256_t() = default;
    uint256_t(uint64_t v) { data[0] = v; }

    // From a FieldElement (big-endian canonical 32 bytes) -> little-endian limbs.
    uint256_t(const ::azteclabs::wsdb::FieldElement& fe)
    {
        for (int limb = 0; limb < 4; ++limb) {
            uint64_t v = 0;
            for (int b = 0; b < 8; ++b) {
                v = (v << 8) | fe.bytes[static_cast<size_t>((3 - limb) * 8 + b)];
            }
            data[static_cast<size_t>(limb)] = v;
        }
    }

    bool operator==(const uint256_t& o) const
    {
        return data[0] == o.data[0] && data[1] == o.data[1] && data[2] == o.data[2] && data[3] == o.data[3];
    }

    std::strong_ordering operator<=>(const uint256_t& o) const
    {
        for (int i = 3; i >= 0; --i) {
            if (data[i] != o.data[i]) {
                return data[i] <=> o.data[i];
            }
        }
        return std::strong_ordering::equal;
    }

    uint256_t operator+(const uint256_t& o) const
    {
        uint256_t r;
        unsigned __int128 carry = 0;
        for (int i = 0; i < 4; ++i) {
            unsigned __int128 cur = (unsigned __int128)data[i] + o.data[i] + carry;
            r.data[i] = static_cast<uint64_t>(cur);
            carry = cur >> 64;
        }
        return r;
    }

    uint256_t operator-(const uint256_t& o) const
    {
        uint256_t r;
        unsigned __int128 borrow = 0;
        for (int i = 0; i < 4; ++i) {
            unsigned __int128 cur = (unsigned __int128)data[i] - o.data[i] - borrow;
            r.data[i] = static_cast<uint64_t>(cur);
            borrow = (cur >> 64) & 1U;
        }
        return r;
    }

    // Back to a FieldElement (little-endian limbs -> big-endian canonical bytes).
    operator ::azteclabs::wsdb::FieldElement() const
    {
        ::azteclabs::wsdb::FieldElement fe;
        for (int limb = 0; limb < 4; ++limb) {
            uint64_t v = data[static_cast<size_t>(limb)];
            for (int b = 0; b < 8; ++b) {
                fe.bytes[static_cast<size_t>((3 - limb) * 8 + b)] = static_cast<uint8_t>(v >> (8 * (7 - b)));
            }
        }
        return fe;
    }
};

} // namespace azteclabs::wsdb::numeric

namespace azteclabs::wsdb {
using numeric::uint256_t;
} // namespace azteclabs::wsdb
