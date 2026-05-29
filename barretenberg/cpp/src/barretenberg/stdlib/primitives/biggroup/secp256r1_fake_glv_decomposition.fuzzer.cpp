// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

/**
 * @file secp256r1_fake_glv_decomposition.fuzzer.cpp
 * @brief Pure-native fuzzer for `bb::stdlib::element_default::detail::compute_secp256r1_fake_glv_decomposition`.
 *
 * Given a random secp256r1 scalar s, the helper returns (alpha, |beta|, beta_is_negative) such that
 *
 *     beta_signed * s ≡ alpha   (mod n),       |alpha|, |beta| < 2^128.
 *
 * The fuzzer reconstructs s from raw bytes, runs the decomposition, and asserts both the size bound and the
 * congruence. Any violation aborts via libFuzzer.
 */

#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"

#include <cassert>
#include <cstdint>
#include <cstring>

using bb::numeric::uint256_t;
using fr = bb::secp256r1::fr;

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* Data, size_t Size)
{
    // Need 32 bytes for one scalar.
    if (Size < 32) {
        return 0;
    }

    // Reconstruct s mod n from raw bytes (interpret little-endian into uint256_t, fr constructor reduces).
    uint64_t limbs[4]{};
    for (size_t i = 0; i < 4; ++i) {
        std::memcpy(&limbs[i], Data + i * 8, sizeof(uint64_t));
    }
    const uint256_t s_raw(limbs[0], limbs[1], limbs[2], limbs[3]);
    const fr s = fr(s_raw);

    const auto decomp = bb::stdlib::element_default::detail::compute_secp256r1_fake_glv_decomposition(s);

    // Size bounds: both |alpha| and |beta| must fit in 128 bits (in fact < sqrt(n) < 2^128).
    constexpr uint256_t bound = uint256_t(1) << 128;
    assert(decomp.alpha < bound && "secp256r1 fake-GLV: alpha >= 2^128");
    assert(decomp.beta_abs < bound && "secp256r1 fake-GLV: |beta| >= 2^128");

    // Congruence: beta_signed * s ≡ alpha (mod n).
    const fr beta_abs_fr(decomp.beta_abs);
    const fr beta_signed = decomp.beta_is_negative ? -beta_abs_fr : beta_abs_fr;
    const fr lhs = beta_signed * s;
    const fr rhs(decomp.alpha);
    assert(lhs == rhs && "secp256r1 fake-GLV: beta_signed * s != alpha (mod n)");

    // Degenerate s = 0 must return (0, 1, false) so the caller's substitution path is well-defined.
    if (s == fr::zero()) {
        assert(decomp.alpha == uint256_t(0));
        assert(decomp.beta_abs == uint256_t(1));
        assert(decomp.beta_is_negative == false);
    }

    return 0;
}
