// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "stdint.h"
#include <array>
#include <iomanip>
#include <ostream>
#include <vector>

namespace bb::crypto {

using Sha256Hash = std::array<uint8_t, 32>;

// SHA-256 compression function (FIPS 180-4 Section 6.2.2)
std::array<uint32_t, 8> sha256_block(const std::array<uint32_t, 8>& h_init, const std::array<uint32_t, 16>& input);

template <typename T> Sha256Hash sha256(const T& input);

inline bool operator==(Sha256Hash const& lhs, std::vector<uint8_t> const& rhs)
{
    return std::equal(lhs.begin(), lhs.end(), rhs.begin());
}

} // namespace bb::crypto

namespace std {
inline bool operator==(std::vector<uint8_t> const& lhs, bb::crypto::Sha256Hash const& rhs)
{
    return std::equal(lhs.begin(), lhs.end(), rhs.begin());
}

inline std::ostream& operator<<(std::ostream& os, bb::crypto::Sha256Hash const& arr)
{
    std::ios_base::fmtflags f(os.flags());
    os << std::hex << std::setfill('0');
    for (auto byte : arr) {
        os << std::setw(2) << +(unsigned char)byte;
    }
    os.flags(f);
    return os;
}
} // namespace std
