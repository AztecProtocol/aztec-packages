#include "barretenberg/ecc/fields/bernstein_yang_inverse.hpp"

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/experimental_optimizations.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/uintx/uintx.hpp"

#include <cstddef>
#include <cstdint>

namespace {

template <typename F> void check_inverse(const uint8_t* data)
{
    using namespace bb::bernstein_yang;
    bb::numeric::uint256_t value = 0;
    for (size_t i = 0; i < 32; ++i) {
        value.data[i / 8] |= static_cast<uint64_t>(data[i]) << (8 * (i % 8));
    }
    value %= F::modulus;
    const auto native =
        invert_vartime<Native5x64>(value, F::modulus, Native5x64::p_inv_mod_2k_from_montgomery_r_inv(F::Params::r_inv));
    const auto wasm =
        invert_vartime<Wasm9x29>(value, F::modulus, Wasm9x29::p_inv_mod_2k_from_montgomery_r_inv(F::Params::r_inv));
    BB_ASSERT_EQ(native, wasm);
    if (value == 0) {
        BB_ASSERT_EQ(native, bb::numeric::uint256_t(0));
    } else {
        const auto [lo, hi] = value.mul_extended(native);
        BB_ASSERT_EQ(bb::numeric::uint512_t(lo, hi) % bb::numeric::uint512_t(F::modulus), bb::numeric::uint512_t(1));
    }
}

} // namespace

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    bb::initialize_experimental_optimizations();
    if (size < 33) {
        return 0;
    }
    if (data[0] & 1) {
        check_inverse<bb::fr>(data + 1);
    } else {
        check_inverse<bb::fq>(data + 1);
    }
    return 0;
}
