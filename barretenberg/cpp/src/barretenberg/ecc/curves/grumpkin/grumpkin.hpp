// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "../../groups/group.hpp"
#include "../bn254/fq.hpp"
#include "../bn254/fr.hpp"

namespace bb::grumpkin {

constexpr size_t MAX_NO_WRAP_INTEGER_BIT_LENGTH = 252;

using fq = bb::fr;
using fr = bb::fq;

struct G1Params {
    static constexpr bool USE_ENDOMORPHISM = true;
    static constexpr bool can_hash_to_curve = true;
    static constexpr bool small_elements = true;
    static constexpr bool has_a = false;
// have checked in grumpkin.test_b that b is Montgomery form of -17
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    static constexpr bb::fr b{ 0xdd7056026000005a, 0x223fa97acb319311, 0xcc388229877910c0, 0x34394632b724eaa };
#else
    static constexpr bb::fr b{ 0x2646d52420000b3eUL, 0xf78d5ec872bf8119UL, 0x166fb9c3ec1f6749UL, 0x7a9ef7fabe69506UL };
#endif
    static constexpr bb::fr a{ 0UL, 0UL, 0UL, 0UL };

    // generator point = (x, y) = (1, sqrt(-16)), sqrt(-16) = 4i
    static constexpr bb::fr one_x = bb::fr::one();
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    static constexpr bb::fr one_y{
        0x11b2dff1448c41d8UL, 0x23d3446f21c77dc3UL, 0xaa7b8cf435dfafbbUL, 0x14b34cf69dc25d68UL
    };
#else
    static constexpr bb::fr one_y{
        0xc3e285a561883af3UL, 0x6fc5c2360a850101UL, 0xf35e144228647aa9UL, 0x2151a2fe48c68af6UL
    };
#endif
};
using g1 = bb::group<bb::fr, bb::fq, G1Params>;

}; // namespace bb::grumpkin

namespace bb::curve {
class Grumpkin {
  public:
    using ScalarField = bb::fq;
    using BaseField = bb::fr;
    using Group = typename grumpkin::g1;
    using Element = typename Group::element;
    using AffineElement = typename Group::affine_element;

    static constexpr const char* name = "Grumpkin";
    // TODO(#673): This flag is temporary. It is needed in the verifier classes (GeminiVerifier, etc.) while these
    // classes are instantiated with "native" curve types. Eventually, the verifier classes will be instantiated only
    // with stdlib types, and "native" verification will be acheived via a simulated builder.
    static constexpr bool is_stdlib_type = false;

    // Required by SmallSubgroupIPA argument. This constant needs to divide the size of the multiplicative subgroup of
    // the ScalarField and satisfy SUBGROUP_SIZE > CONST_PROOF_SIZE_LOG_N * 3, since in every round of Sumcheck, the
    // prover sends 3 elements to the verifier.
    static constexpr size_t SUBGROUP_SIZE = 87;
    // The generator below was derived by factoring r - 1 into primes, where r is the modulus of the Grumkin scalar
    // field. A random field element was sampled and raised to the power (r - 1) / (3 * 29). We verified that the
    // resulting element does not generate a smaller subgroup by further raising it to the powers of 3 and 29. To
    // optimize the recursive verifier and avoid costly inversions, we also precompute and store its inverse.
    static constexpr ScalarField subgroup_generator =
        ScalarField(uint256_t("0x147c647c09fb639514909e9f0513f31ec1a523bf8a0880bc7c24fbc962a9586b"));
    static constexpr ScalarField subgroup_generator_inverse =
        ScalarField("0x0c68e27477b5e78cfab790bd3b59806fa871771f71ec7452cde5384f6e3a1988");
    // The length of the polynomials used to mask the Sumcheck Round Univariates. In the ECCVM Sumcheck, the prover only
    // sends 3 elements in every round - a commitment to the round univariate and its evaluations at 0 and 1. Therefore,
    // length 3 is sufficient.
    static constexpr uint32_t LIBRA_UNIVARIATES_LENGTH = 3;
};
} // namespace bb::curve

// Specialize the reconstruct from public method
template <>
inline bb::grumpkin::g1::affine_element bb::grumpkin::g1::affine_element::reconstruct_from_public(
    const std::span<const bb::fr>& limbs)
{
    BB_ASSERT_EQ(limbs.size(), 2 * FR_PUBLIC_INPUTS_SIZE, "Incorrect number of limbs");

    auto x_limbs = limbs.subspan(0, FR_PUBLIC_INPUTS_SIZE);
    auto y_limbs = limbs.subspan(FR_PUBLIC_INPUTS_SIZE, FR_PUBLIC_INPUTS_SIZE);

    affine_element result;
    result.x = Fq::reconstruct_from_public(x_limbs);
    result.y = Fq::reconstruct_from_public(y_limbs);

    if (result.x == Fq::zero() && result.y == Fq::zero()) {
        result.self_set_infinity();
    }

    ASSERT(result.on_curve());
    return result;
}
