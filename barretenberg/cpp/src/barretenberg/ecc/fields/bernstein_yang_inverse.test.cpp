#include "barretenberg/ecc/fields/bernstein_yang_inverse.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/ecc/fields/bernstein_yang_inverse_wasm.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <gtest/gtest.h>

namespace {

using bb::numeric::uint256_t;
using Native = bb::bernstein_yang::Native5x64;
using Wasm = bb::bernstein_yang::Wasm9x29;

template <class F> uint256_t to_raw(const F& a)
{
    F nonmont = a.from_montgomery_form_reduced();
    return { nonmont.data[0], nonmont.data[1], nonmont.data[2], nonmont.data[3] };
}

template <class F> F from_raw(const uint256_t& a)
{
    F r{ a.data[0], a.data[1], a.data[2], a.data[3] };
    r.self_to_montgomery_form();
    return r;
}

template <class S, class F> uint256_t by_invert(const F& a)
{
    constexpr uint256_t p = F::modulus;
    constexpr uint64_t p_inv_mod_2k = S::p_inv_mod_2k_from_montgomery_r_inv(F::Params::r_inv);
    return bb::bernstein_yang::invert_vartime<S>(to_raw(a), p, p_inv_mod_2k);
}

// Random a, BY result roundtripped through Montgomery must invert a.
template <class S, class F> void check_inverse_matches_modexp(size_t n)
{
    for (size_t i = 0; i < n; ++i) {
        F a = F::random_element();
        if (a == F::zero()) {
            continue;
        }
        F got = from_raw<F>(by_invert<S>(a));
        EXPECT_EQ(got * a, F::one()) << "iteration " << i;
    }
}

// Same input through both kernels must produce identical canonical output.
template <class F> void check_native_matches_wasm(size_t n)
{
    for (size_t i = 0; i < n; ++i) {
        F a = F::random_element();
        if (a == F::zero()) {
            continue;
        }
        EXPECT_EQ(by_invert<Native>(a), by_invert<Wasm>(a)) << "iteration " << i;
    }
}

template <class S, class F> void check_edge_cases()
{
    // invert(1) == 1
    EXPECT_EQ(from_raw<F>(by_invert<S>(F::one())), F::one());

    // invert(-1) == -1
    F neg_one = -F::one();
    EXPECT_EQ(from_raw<F>(by_invert<S>(neg_one)), neg_one);

    // a * invert(a) == 1 for small / boundary / sparse inputs
    F two = F::one() + F::one();
    F neg_two = -two;
    F top_limb_only{ 0, 0, 0, 1 }; // raw value 2^192, well below modulus for 254-bit fields
    top_limb_only.self_to_montgomery_form();
    for (const F& a : { two, neg_two, top_limb_only }) {
        F inv = from_raw<F>(by_invert<S>(a));
        EXPECT_EQ(inv * a, F::one());
    }

    // Involution: invert(invert(a)) == a, on random samples.
    for (int i = 0; i < 64; ++i) {
        F a = F::random_element();
        if (a == F::zero()) {
            continue;
        }
        F inv = from_raw<F>(by_invert<S>(a));
        F inv_inv = from_raw<F>(by_invert<S>(inv));
        EXPECT_EQ(inv_inv, a);
    }
}

} // namespace

TEST(Wasm9x29, MatchesModexp_BN254_Fr)
{
    check_inverse_matches_modexp<Wasm, bb::fr>(500);
}
TEST(Wasm9x29, MatchesModexp_BN254_Fq)
{
    check_inverse_matches_modexp<Wasm, bb::fq>(500);
}

TEST(Native5x64, MatchesModexp_BN254_Fr)
{
    check_inverse_matches_modexp<Native, bb::fr>(500);
}
TEST(Native5x64, MatchesModexp_BN254_Fq)
{
    check_inverse_matches_modexp<Native, bb::fq>(500);
}

TEST(Wasm9x29, EdgeCases_BN254_Fr)
{
    check_edge_cases<Wasm, bb::fr>();
}
TEST(Wasm9x29, EdgeCases_BN254_Fq)
{
    check_edge_cases<Wasm, bb::fq>();
}
TEST(Native5x64, EdgeCases_BN254_Fr)
{
    check_edge_cases<Native, bb::fr>();
}
TEST(Native5x64, EdgeCases_BN254_Fq)
{
    check_edge_cases<Native, bb::fq>();
}

TEST(BernsteinYang, NativeMatchesWasm_BN254_Fr)
{
    check_native_matches_wasm<bb::fr>(500);
}
TEST(BernsteinYang, NativeMatchesWasm_BN254_Fq)
{
    check_native_matches_wasm<bb::fq>(500);
}

// 256-bit moduli must keep working through field::invert() via the Fermat
// fallback (the BY dispatch is gated by `modulus_3 < 2^63`, which excludes
// secp256k1/r1). Pin that behavior so a future change to the gate gets caught.
TEST(BernsteinYang, FermatFallback_Secp256k1_Fr)
{
    auto a = bb::secp256k1::fr::random_element();
    EXPECT_EQ(a * a.invert(), bb::secp256k1::fr::one());
}
TEST(BernsteinYang, FermatFallback_Secp256r1_Fr)
{
    auto a = bb::secp256r1::fr::random_element();
    EXPECT_EQ(a * a.invert(), bb::secp256r1::fr::one());
}
